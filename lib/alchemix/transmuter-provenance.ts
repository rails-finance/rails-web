// Receipts for a Transmuter position's figures.
// ----------------------------------------------------------------------------
// Every figure a Transmuter position states is one of the Transmuter's own
// logs, replayed, so every receipt here names the Transmuter as its contract
// and the log field it came from. None of them is a getCDP reading: the
// Transmuter has no such read, and nothing here claims one.

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import { explorerUrl } from "@/lib/shared/chains";
import type { AlchemixCoords } from "@/lib/alchemix/event-provenance";

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

/** The maturity block: the start block plus the `timeToTransmute` in force at
 *  that block, settled when the stake was replayed. */
export function transmuterMaturityProv(
  startBlock: number,
  maturationBlock: number,
  coords: AlchemixCoords,
): Provenance {
  return {
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
