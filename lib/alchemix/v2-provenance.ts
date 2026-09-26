// Receipts for an Alchemix V2 position's figures.
// ----------------------------------------------------------------------------
// Two kinds of figure, and every receipt names which:
//
//   * the FROZEN READS: accounts() and positions() on the V2 Alchemist at block
//     24,794,239, the last Alchemist log of any kind. The storage has not moved
//     since and cannot (rails-ops reference/alchemix-v2-frozen-record.md);
//   * the LOGS: a field of one captured Alchemist event, as emitted.
//
// Each amount is scaled by the decimals of the token it is in, which the
// caller passes from the token: never a fixed 18 for a yield token or an
// underlying (USDC and USDT are 6, and so are the yvUSDC and yvUSDT shares).

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";

const V2_VIA = "captured Alchemist V2 logs (alchemix_v2_*)";

export interface AlchemixV2Coords {
  chainId: ChainId;
  lineKey: string;
  account: string;
  /** The Alchemist: every V2 log's emitter. */
  emitter?: string;
  txHash?: string;
  blockNumber?: number;
}

const alchemist = (coords: AlchemixV2Coords) => ({ name: "Alchemist V2", address: coords.emitter });

function inputs(coords: AlchemixV2Coords, extra: ProvInput[] = []): ProvInput[] {
  const out: ProvInput[] = [
    ...extra,
    { label: "line", value: coords.lineKey, kind: "offchain", note: "one synthetic, V2" },
    { label: "account", value: coords.account, kind: "chain", note: "a V2 position is a wallet account" },
  ];
  if (coords.blockNumber != null) out.push({ label: "block", value: String(coords.blockNumber), kind: "chain" });
  if (coords.txHash) out.push({ label: "tx", value: coords.txHash, kind: "chain", note: "captured log" });
  return out;
}

function txVerify(coords: AlchemixV2Coords): ProvVerify | undefined {
  if (!coords.txHash) return undefined;
  return {
    kind: "etherscan",
    href: explorerUrl(coords.chainId, "tx-logs", coords.txHash),
    text: "Confirm in the tx event logs",
  };
}

/** The frozen debt: accounts(account).debt at the frozen block. Signed. */
export function v2FrozenDebtProv(
  symbol: string,
  raw: string,
  frozenAtBlock: number,
  coords: AlchemixV2Coords,
): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    summary: `Debt at close. accounts(${coords.account}).debt on the V2 Alchemist at block ${frozenAtBlock}; a negative figure is credit the account never drew`,
    contract: alchemist(coords),
    via: `accounts(${coords.account}) at block ${frozenAtBlock}`,
    verify: {
      kind: "recompute",
      text: `Call accounts(${coords.account}) at block ${frozenAtBlock}, or at head: it has not moved`,
    },
    source: { block: frozenAtBlock },
    inputs: inputs(coords),
    scaling: { raw, from: "call", places: 18, why: `${symbol} carries 18 decimals` },
  };
}

/** A yield token's share count: positions(account, yieldToken).shares. */
export function v2SharesProv(
  yieldSymbol: string,
  yieldToken: string,
  raw: string,
  decimals: number,
  frozenAtBlock: number,
  coords: AlchemixV2Coords,
): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    summary: `${yieldSymbol} shares at close. positions(${coords.account}, ${yieldToken}) on the V2 Alchemist at block ${frozenAtBlock}`,
    contract: alchemist(coords),
    via: `positions(account, ${yieldToken}).shares at block ${frozenAtBlock}`,
    verify: { kind: "recompute", text: `Call positions(${coords.account}, ${yieldToken}) at block ${frozenAtBlock}` },
    source: { block: frozenAtBlock },
    inputs: inputs(coords, [{ label: "yield token", value: yieldToken, kind: "chain" }]),
    scaling: {
      raw,
      from: "call",
      places: decimals,
      why: `${yieldSymbol} shares carry the yield token's ${decimals} decimals`,
    },
  };
}

/** The underlying behind a share count, by the Alchemist's own conversion. */
export function v2UnderlyingProv(
  symbol: string,
  raw: string,
  decimals: number,
  yieldSymbol: string,
  yieldDecimals: number,
  perShareRaw: string,
  frozenAtBlock: number,
  coords: AlchemixV2Coords,
): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    summary: `${symbol} behind the ${yieldSymbol} shares. The share count at close taken to the underlying at the Alchemist's rate that block`,
    contract: alchemist(coords),
    formula: `shares × getUnderlyingTokensPerShare ÷ 10^${yieldDecimals}`,
    via: `getUnderlyingTokensPerShare = ${perShareRaw} at block ${frozenAtBlock}`,
    verify: { kind: "recompute", text: "Recompute it from the share count and the rate" },
    source: { block: frozenAtBlock },
    inputs: inputs(coords, [
      { label: "rate", value: perShareRaw, kind: "chain", note: `underlying for 10^${yieldDecimals} shares` },
    ]),
    scaling: { raw, from: "call", places: decimals, why: `${symbol} carries ${decimals} decimals` },
  };
}

/** A field of one V2 Alchemist log, as emitted, at its token's decimals. */
export function v2EmittedProv(
  field: string,
  symbol: string,
  raw: string | null,
  decimals: number,
  coords: AlchemixV2Coords,
): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    summary: `${symbol}. The \`${field}\` field of the V2 Alchemist's log`,
    contract: alchemist(coords),
    via: `${V2_VIA} · ${field}${raw ? `: ${raw}` : ""}`,
    verify: txVerify(coords),
    source: { block: coords.blockNumber, txHash: coords.txHash },
    inputs: inputs(coords),
    scaling: raw ? { raw, from: "log", places: decimals, why: `${symbol} carries ${decimals} decimals` } : undefined,
  };
}

/** A lifetime total: the logs of one kind on this account, summed in one token. */
export function v2SummedProv(label: string, symbol: string, count: number, coords: AlchemixV2Coords): Provenance {
  return {
    kind: "chain-derived",
    pclass: "indexed",
    summary: `${label}. The ${count} ${count === 1 ? "log" : "logs"} of this kind on this V2 account, summed in ${symbol}`,
    contract: alchemist(coords),
    via: V2_VIA,
    verify: { kind: "rollup", text: "It rolls up the events on this page" },
    inputs: inputs(coords, [{ label: "events", value: String(count), kind: "chain" }]),
  };
}
