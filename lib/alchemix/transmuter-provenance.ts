// Receipts for a Transmuter position's figures.
// ----------------------------------------------------------------------------
// Every figure a Transmuter position states is one of the Transmuter's own
// logs, replayed, so every receipt here names the Transmuter as its contract
// and the log field it came from. None of them is a getCDP reading: the
// Transmuter has no such read, and nothing here claims one.

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import { explorerUrl } from "@/lib/shared/chains";
import type { AlchemixCoords } from "@/lib/alchemix/event-provenance";
import type { TransmuterEarlyClaim } from "@/lib/alchemix/transmuter-early-claim";

const TRANSMUTER_VIA = "captured Transmuter logs (alchemix_v3_transmuter_*)";

const transmuterContract = (coords: AlchemixCoords) => ({ name: "Transmuter V3", address: coords.emitter });

function txVerify(coords: AlchemixCoords): ProvVerify | undefined {
  if (!coords.txHash) return undefined;
  return {
    kind: "etherscan",
    href: explorerUrl(coords.chainId, "tx-logs", coords.txHash),
    text: "Confirm in the tx event logs",
  };
}

function inputs(coords: AlchemixCoords, extra: ProvInput[] = []): ProvInput[] {
  const out: ProvInput[] = [
    ...extra,
    { label: "line", value: coords.lineKey, kind: "offchain", note: "one synthetic on one chain" },
    { label: "position id", value: coords.tokenId, kind: "chain", note: "the Transmuter's own NFT" },
  ];
  if (coords.blockNumber != null) {
    out.push({ label: "block", value: String(coords.blockNumber), kind: "chain", note: "event block" });
  }
  if (coords.txHash) out.push({ label: "tx", value: coords.txHash, kind: "chain", note: "captured log" });
  return out;
}

/** A field of one Transmuter log, as emitted. Both units the Transmuter moves,
 *  the synthetic and the vault share, carry 18 decimals on every line. */
export function transmuterEmittedProv(
  field: string,
  symbol: string,
  raw: string | null,
  coords: AlchemixCoords,
): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    summary: `${symbol} — the \`${field}\` field of the Transmuter's log`,
    contract: transmuterContract(coords),
    via: `${TRANSMUTER_VIA} · ${field}${raw ? `: ${raw}` : ""}`,
    verify: txVerify(coords),
    source: { block: coords.blockNumber, txHash: coords.txHash },
    inputs: inputs(coords),
    scaling: raw ? { raw, from: "log", places: 18, why: `${symbol} carries 18 decimals` } : undefined,
  };
}

/** The date a maturing position's maturity block is estimated to land: the
 *  blocks still to go past the block the line is indexed to, at the chain's
 *  block time, counted from when the page was read. */
export interface TransmuterMaturityEstimate {
  referenceBlock: number;
  blocksRemaining: number;
  secondsPerBlock: number;
  /** Unix milliseconds the count starts from: the time the page was read. */
  fromMs: number;
  /** Unix milliseconds of the estimated maturity. */
  atMs: number;
}

/** The maturity block: the start block plus the `timeToTransmute` in force at
 *  that block, settled when the stake was replayed. With an estimate, the
 *  receipt also carries the arithmetic behind the date the figure headlines. */
export function transmuterMaturityProv(
  startBlock: number,
  maturationBlock: number,
  coords: AlchemixCoords,
  estimate?: TransmuterMaturityEstimate | null,
): Provenance {
  const block: Provenance = {
    kind: "chain-derived",
    pclass: "indexed",
    summary:
      "Maturity block — the start block plus the timeToTransmute in force when the stake was made, counted in blocks",
    contract: transmuterContract(coords),
    via: `${TRANSMUTER_VIA} · start block + timeToTransmute at that block`,
    formula: `${startBlock} + ${maturationBlock - startBlock} = ${maturationBlock}`,
    inputs: inputs(coords, [
      { label: "start block", value: String(startBlock), kind: "chain", note: "PositionCreated" },
      {
        label: "timeToTransmute",
        value: String(maturationBlock - startBlock),
        kind: "chain",
        note: "the last TransmutationTimeUpdated at or before the start block",
      },
    ]),
  };
  if (!estimate) return block;
  const e = estimate;
  const seconds = e.blocksRemaining * e.secondsPerBlock;
  return {
    ...block,
    summary:
      "Estimated maturity date — the maturity block (the start block plus the timeToTransmute in force when the stake was made) less the block the line is indexed to, at the chain's block time, counted from when this page was read",
    via: `${block.via} · (maturity block − indexed block) × seconds per block`,
    formula: `${block.formula}; (${maturationBlock} − ${e.referenceBlock}) × ${e.secondsPerBlock} s = ${seconds} s after ${new Date(e.fromMs).toISOString()} ≈ ${new Date(e.atMs).toISOString().slice(0, 10)}`,
    inputs: [
      ...(block.inputs ?? []),
      {
        label: "indexed block",
        value: String(e.referenceBlock),
        kind: "offchain",
        note: "how far the indexer has read the line",
      },
      {
        label: "blocks to go",
        value: String(e.blocksRemaining),
        kind: "offchain",
        note: "maturity block − indexed block",
      },
      {
        label: "seconds per block",
        value: String(e.secondsPerBlock),
        kind: "offchain",
        note: "the chain's slot time; a missed slot moves the date later",
      },
    ],
  };
}

/** The part of the stake the claim converted: the stake less what came back,
 *  both from logs. */
export function transmuterConvertedProv(
  symbol: string,
  stakedRaw: string,
  unclaimedRaw: string,
  coords: AlchemixCoords,
): Provenance {
  return {
    kind: "chain-derived",
    pclass: "indexed",
    summary: `${symbol} converted — the stake less what the claim handed back, both from the Transmuter's logs`,
    contract: transmuterContract(coords),
    via: `${TRANSMUTER_VIA} · amount_staked − amount_unclaimed`,
    formula: `${stakedRaw} − ${unclaimedRaw}`,
    verify: { kind: "rollup", text: "It rolls up the stake and the claim on this page" },
    inputs: inputs(coords, [
      { label: "amount_staked", value: stakedRaw, kind: "chain", note: "PositionCreated" },
      { label: "amount_unclaimed", value: unclaimedRaw, kind: "chain", note: "PositionClaimed" },
    ]),
  };
}

/** One part of a claim that landed before maturity (lib/alchemix/transmuter-early-claim):
 *  the part converted, the part that had not, or the early exit fee. Each is
 *  arithmetic over the stake, the two blocks that bound its term, the claim
 *  block and the part handed back, all from the Transmuter's logs. */
export function transmuterEarlyClaimProv(
  part: "converted" | "unconverted" | "exit-fee",
  symbol: string,
  e: TransmuterEarlyClaim,
  coords: AlchemixCoords,
): Provenance {
  const term = e.maturationBlock - e.startBlock;
  const unconvertedFormula = `${e.stakedRaw} × (${e.maturationBlock} − ${e.claimBlock}) ÷ (${e.maturationBlock} − ${e.startBlock}) = ${e.stakedRaw} × ${e.blocksEarly} ÷ ${term} = ${e.unconvertedRaw}`;
  const spec = {
    converted: {
      summary: `${symbol} converted — the stake less the part whose blocks had not yet passed at the claim`,
      via: "amount_staked − unconverted",
      formula: `${unconvertedFormula}; ${e.stakedRaw} − ${e.unconvertedRaw} = ${e.convertedRaw}`,
    },
    unconverted: {
      summary: `${symbol} not yet converted — the stake converts in equal parts every block from its start to maturity, so this is the share of its term still to run at the claim`,
      via: "amount_staked × blocks left ÷ term",
      formula: unconvertedFormula,
    },
    "exit-fee": {
      summary: `${symbol} kept as the early exit fee — the unconverted part less what the claim handed back`,
      via: "unconverted − amount_unclaimed",
      formula: `${unconvertedFormula}; ${e.unconvertedRaw} − ${e.returnedRaw} = ${e.exitFeeRaw} (${(e.exitFeeShare * 100).toFixed(4)}% of the unconverted part)`,
    },
  }[part];
  return {
    kind: "chain-derived",
    pclass: "indexed",
    summary: spec.summary,
    contract: transmuterContract(coords),
    via: `${TRANSMUTER_VIA} · ${spec.via}`,
    formula: spec.formula,
    verify: { kind: "rollup", text: "It rolls up the stake, its maturity and the claim on this page" },
    inputs: inputs(coords, [
      { label: "amount_staked", value: e.stakedRaw, kind: "chain", note: "PositionCreated" },
      { label: "start block", value: String(e.startBlock), kind: "chain", note: "PositionCreated" },
      { label: "maturity block", value: String(e.maturationBlock), kind: "chain", note: "start + timeToTransmute" },
      { label: "claim block", value: String(e.claimBlock), kind: "chain", note: "PositionClaimed" },
      { label: "amount_unclaimed", value: e.returnedRaw, kind: "chain", note: "PositionClaimed" },
    ]),
  };
}
