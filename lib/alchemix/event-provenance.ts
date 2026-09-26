// Alchemix V3 provenance vocabulary — what every figure on the position page
// traces to, and the four different answers this protocol can give.
// ----------------------------------------------------------------------------
// THE GRADE IS PER LINE, NOT PER POSITION (rails-ops decisions/0032). Debt
// steps at the position's own events AND at the Alchemist's global
// `Redemption`, which carries one uint256, no indexed field and no per-account
// attribution. So:
//
//   • a line that has never had a redemption is graded `derived`: its figures
//     come from the position's own events alone and are exact to the wei;
//   • from a line's FIRST redemption it is graded `read`: the served figures
//     are a `getCDP` reading at a named block, because the events can no longer
//     account for every step;
//   • `unavailable` is a read-grade line with no current reading for this
//     position — then only the event-derived figures are known;
//   • `refused` is the reducer declining the position outright, and no figure
//     is served rather than a wrong one.
//
// EARMARKED IS A POINT READING. It accrues inside `_earmark()` on every block,
// so a stored figure is true at the block it was read at and at no other. Every
// earmarked receipt therefore names its own block and never a range.
//
// THE HEADLINE FIGURES ARE A CHAIN READ, not an index row: one `getCDP` call
// and one share-price call, both pinned to the block read first. That is the
// only condition under which earmarked may stand beside debt, and the receipts
// say which block it was.
//
// COLLATERAL IS MYT SHARES. The share count is what the position holds; the
// underlying is the share count times the vault's share price, and the two need
// not have been read at the same block — both blocks are on the wire and both
// are in the receipt.

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import type { AlchemixGrade } from "@/types/api/alchemix";

/** Where the figures on this page were captured from, in custody terms. */
const ALCHEMIX_VIA = "captured Alchemist + position NFT logs (alchemix_v3_*)";

export interface AlchemixCoords {
  chainId: ChainId;
  lineKey: string;
  tokenId: string;
  /** The Alchemist that emitted the log, where the row names one. */
  emitter?: string;
  txHash?: string;
  blockNumber?: number;
}

const alchemistContract = (coords: AlchemixCoords) => ({
  name: "Alchemist V3",
  address: coords.emitter,
});

/** Etherscan tx-logs link for an emitted field — a link out, never a read. */
function txVerify(coords: AlchemixCoords): ProvVerify | undefined {
  if (!coords.txHash) return undefined;
  return {
    kind: "etherscan",
    href: explorerUrl(coords.chainId, "tx-logs", coords.txHash),
    text: "Confirm in the tx event logs",
  };
}

function coordInputs(coords: AlchemixCoords, extra: ProvInput[] = []): ProvInput[] {
  const inputs: ProvInput[] = [...extra];
  inputs.push({
    label: "line",
    value: coords.lineKey,
    kind: "offchain",
    note: "one synthetic on one chain — the scope a token id is unique inside",
  });
  inputs.push({ label: "token id", value: coords.tokenId, kind: "chain", note: "the position NFT" });
  if (coords.blockNumber != null) {
    inputs.push({ label: "block", value: String(coords.blockNumber), kind: "chain", note: "event block" });
  }
  if (coords.txHash) inputs.push({ label: "tx", value: coords.txHash, kind: "chain", note: "captured log" });
  return inputs;
}

// ── The event's own emitted amounts ─────────────────────────────────────────

/** A quantity the log itself states — the deposit's shares, the mint's
 *  synthetic, the withdraw's shares. Nothing recomputes it. */
export function emittedAmountProv(
  field: string,
  symbol: string,
  raw: string | null,
  coords: AlchemixCoords,
  decimals = 18,
): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    summary: `${symbol} — the \`${field}\` field of this event's log`,
    contract: alchemistContract(coords),
    via: `${ALCHEMIX_VIA} · ${field}${raw ? `: ${raw}` : ""}`,
    verify: txVerify(coords),
    source: { block: coords.blockNumber, txHash: coords.txHash },
    inputs: coordInputs(coords),
    scaling: raw ? { raw, from: "log", places: decimals, why: `${symbol} carries ${decimals} decimals` } : undefined,
  };
}

/** The two quantities `Repay` and `ForceRepay` do not emit, resolved when the
 *  log was captured and stored beside it.
 *
 *  THE REPAY CASE IS THE SHARP ONE. The `Repay` log's amount is a YIELD-TOKEN
 *  quantity — what the caller offered — and the debt it bought is
 *  `min(that amount converted to debt at this block, the position's debt, the
 *  line's total debt)`. Flow and delta are different numbers, and this receipt
 *  is what keeps the card from reading one as the other. */
export function resolvedAtCaptureProv(
  what: "debt credit" | "collateral fee",
  symbol: string,
  raw: string | null,
  coords: AlchemixCoords,
): Provenance {
  const debt = what === "debt credit";
  return {
    kind: "chain-derived",
    pclass: "indexed",
    summary: `${symbol} — the ${what} this event carried, resolved when the log was captured`,
    contract: alchemistContract(coords),
    via: `${ALCHEMIX_VIA} · ${debt ? "debt_credit" : "collateral_fee"}${raw ? `: ${raw}` : ""}`,
    formula: debt
      ? "min(the offered amount converted to debt at this block, the position's debt, the line's total debt)"
      : "the protocol fee leg of the same transaction's share transfer",
    verify: {
      kind: "recompute",
      text: "Recompute it from this transaction's own transfers",
    },
    source: { block: coords.blockNumber, txHash: coords.txHash },
    inputs: coordInputs(coords, [
      {
        label: "why it is not in the log",
        value: debt ? "Repay states what was offered, not what it cleared" : "the fee rides a separate transfer",
        kind: "offchain",
      },
    ]),
    scaling: raw ? { raw, from: "log", places: 18, why: `${symbol} carries 18 decimals` } : undefined,
  };
}

// ── The headline figures ────────────────────────────────────────────────────

const GRADE_BASIS: Record<AlchemixGrade, string> = {
  derived: "the position's own events, with no redemption on this line to move it otherwise",
  read: "a getCDP call on the Alchemist at the block named",
  unavailable: "nothing current — this line carries the read grade and no reading is in hand",
  refused: "nothing — the reducer declined this position rather than serve a wrong figure",
};

/** A figure the position row serves, under its line's grade, at its own block. */
export function servedFigureProv(
  label: string,
  symbol: string,
  raw: string | null,
  asOfBlock: number | null,
  grade: AlchemixGrade,
  coords: AlchemixCoords,
  decimals = 18,
): Provenance {
  const readGraded = grade === "read";
  return {
    kind: readGraded ? "chain" : "chain-derived",
    pclass: readGraded ? "state" : "indexed",
    summary: `${label} — ${GRADE_BASIS[grade]}`,
    contract: alchemistContract(coords),
    via: readGraded
      ? `getCDP(${coords.tokenId}) on the Alchemist${asOfBlock != null ? ` at block ${asOfBlock}` : ""}`
      : `${ALCHEMIX_VIA} · reduced per-position state`,
    verify:
      readGraded && asOfBlock != null
        ? { kind: "recompute", text: `Call getCDP(${coords.tokenId}) at block ${asOfBlock}` }
        : { kind: "recompute", text: "Recompute it from this position's own events" },
    source: { block: asOfBlock ?? undefined },
    inputs: coordInputs(coords, [
      { label: "grade", value: grade, kind: "offchain", note: "the line's grade, which every position on it carries" },
    ]),
    scaling: raw ? { raw, from: readGraded ? "call" : "log", places: decimals, why: `${symbol} carries ${decimals} decimals` } : undefined,
  };
}

/** The CURRENT figures — one call at one block. The block is part of the
 *  figure, and never a range: earmarked is the figure that makes this so. */
export function liveFigureProv(
  label: string,
  symbol: string,
  raw: string | null,
  asOfBlock: number,
  coords: AlchemixCoords,
  decimals = 18,
): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    summary: `${label} — read from the Alchemist at block ${asOfBlock}`,
    contract: alchemistContract(coords),
    via: `getCDP(${coords.tokenId}) at block ${asOfBlock}`,
    verify: { kind: "recompute", text: `Call getCDP(${coords.tokenId}) at block ${asOfBlock}` },
    source: { block: asOfBlock },
    inputs: coordInputs(coords, [
      {
        label: "reading",
        value: `debt, collateral and earmarked at block ${asOfBlock}`,
        kind: "chain",
        note: "one call, one block — which is what lets these three stand together",
      },
    ]),
    scaling: raw ? { raw, from: "call", places: decimals, why: `${symbol} carries ${decimals} decimals` } : undefined,
  };
}

/** The underlying behind a share count: shares × the vault's share price. The
 *  two figures can come from different blocks, and both are named. */
export function underlyingProv(
  symbol: string,
  raw: string,
  decimals: number,
  sharesBlock: number | null,
  sharePriceRaw: string,
  sharePriceBlock: number | null,
  coords: AlchemixCoords,
): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    summary: `${symbol} behind the vault shares — the share count taken to the asset the vault holds`,
    contract: { name: "Metavault (MYT)" },
    formula: "shares × convertToAssets(1e18) ÷ 1e18",
    via: `share price ${sharePriceRaw}${sharePriceBlock != null ? ` at block ${sharePriceBlock}` : ""}`,
    verify: { kind: "recompute", text: "Recompute it from the share count and the share price" },
    source: { block: sharesBlock ?? undefined },
    inputs: coordInputs(coords, [
      {
        label: "shares",
        value: sharesBlock != null ? `counted at block ${sharesBlock}` : "no block stated",
        kind: "chain",
      },
      {
        label: "share price",
        value: sharePriceBlock != null ? `read at block ${sharePriceBlock}` : "no block stated",
        kind: "chain",
        note: "the two blocks need not be the same, so both are stated",
      },
    ]),
    scaling: { raw, from: "call", places: decimals, why: `${symbol} carries ${decimals} decimals` },
  };
}

/** A USD figure: the underlying priced through the one general token-price
 *  path. Absent rather than zero where the price could not be had. */
export function usdProv(symbol: string, pricePerUnit: number, priceSource: string, pricedAt: string): Provenance {
  return {
    kind: "offchain",
    pclass: "offchain",
    summary: `${symbol} in USD — the amount at the price this asset was quoted at`,
    formula: "underlying amount × price per unit",
    via: `${priceSource} · ${pricedAt}`,
    verify: { kind: "none", text: "An off-chain price, with no on-chain anchor" },
    inputs: [
      { label: "price per unit", value: String(pricePerUnit), kind: "offchain", note: priceSource },
      {
        label: "priced at",
        value: pricedAt,
        kind: "offchain",
        note: "on a Base line this is the mainnet twin of the same asset",
      },
    ],
  };
}

/** A lifetime total over the position's own events — a sum of figures each of
 *  which traces to its own log. */
export function lifetimeProv(label: string, symbol: string, events: number, coords: AlchemixCoords): Provenance {
  return {
    kind: "chain-derived",
    pclass: "indexed",
    summary: `${label} — the total over the events on this page`,
    contract: alchemistContract(coords),
    via: `${ALCHEMIX_VIA} · ${events} event${events === 1 ? "" : "s"}`,
    formula: `the sum of every ${symbol} amount this position's events state`,
    verify: { kind: "rollup", text: "It rolls up the events on this page" },
    inputs: coordInputs(coords, [
      { label: "events counted", value: String(events), kind: "chain-derived" },
    ]),
  };
}
