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

// ── What a redemption cleared for one position ──────────────────────────────
//
// A `Redemption` log carries one line-wide uint256 and attributes nothing, so
// the per-position figure is A DIFFERENCE OF TWO READINGS: this position's debt
// at the redemption's block, subtracted from its debt at the reading before it.
// Both blocks ride in the receipt because the figure is the span between them.
// The receipt's kind is `chain-derived` for the subtraction and its class is
// `state`, because both operands are contract slots read at a block — the
// nearest a figure can stand to chain state while still being arithmetic.

/** The debt one redemption cleared for this position, from the two readings it
 *  sits between. */
export function debtClearedFromReadingsProv(
  symbol: string,
  raw: string,
  fromBlock: number,
  atBlock: number,
  coords: AlchemixCoords,
): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    summary: `${symbol} this redemption cleared here — this position's debt read at two blocks, one either side of it`,
    contract: alchemistContract(coords),
    via: `getCDP(${coords.tokenId}) at blocks ${fromBlock} and ${atBlock}`,
    formula: `debt at block ${fromBlock} − debt at block ${atBlock}`,
    verify: {
      kind: "recompute",
      text: `Call getCDP(${coords.tokenId}) at blocks ${fromBlock} and ${atBlock} and take the difference`,
    },
    source: { block: atBlock },
    inputs: coordInputs(coords, [
      { label: "debt read before", value: `block ${fromBlock}`, kind: "chain" },
      { label: "debt read at the redemption", value: `block ${atBlock}`, kind: "chain" },
      {
        label: "what the log gives",
        value: "one line-wide amount, no position named",
        kind: "chain",
        note: "which is why the figure comes from the readings",
      },
    ]),
    scaling: { raw, from: "call", places: 18, why: `${symbol} carries 18 decimals` },
  };
}

/** The total a RUN of redemptions cleared for this position — the sum of each
 *  member's own difference. Summing is sound because a cleared amount is a flow
 *  between two blocks; nothing else on this protocol's timeline may be summed
 *  across a run, and an earmarked figure never may. `stated` counts the members
 *  whose figure could be read, and is short of `count` on a run the total does
 *  not cover whole. */
export function clearedRunProv(
  symbol: string,
  raw: string,
  count: number,
  stated: number,
  range: string,
  coords: AlchemixCoords,
): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    summary: `${symbol} this run cleared here — the sum of what each redemption in it cleared for this position`,
    contract: alchemistContract(coords),
    via: `getCDP(${coords.tokenId}) either side of each redemption in the run`,
    formula: `Σ (debt before − debt at) over ${stated} redemption${stated === 1 ? "" : "s"}`,
    verify: { kind: "rollup", text: "It rolls up the redemptions in this run, each with its own receipt" },
    inputs: coordInputs(coords, [
      { label: "redemptions in the run", value: `${count}, ${range}`, kind: "chain" },
      {
        label: "of those, read",
        value: String(stated),
        kind: "chain",
        note: stated === count ? "every one" : "the total covers these and stops there",
      },
    ]),
    scaling: { raw, from: "call", places: 18, why: `${symbol} carries 18 decimals` },
  };
}

// ── What the vault did for the collateral ───────────────────────────────────
//
// The same class of figure as the redemption subtraction above: a SUM OF
// DIFFERENCES OF READINGS, not a rate and not a projection. The share count is
// constant between two consecutive readings — every block that can move it is
// itself a reading boundary — so each interval contributes shares × the move in
// the share price, and the receipt names the span because the figure is true
// for that span and no other. It is signed, and the receipt says so: a vault
// share can lose value.

/** The underlying the collateral gained or lost from the MYT's share price
 *  moving, summed over the readings in a block range. */
export function collateralAppreciationProv(
  symbol: string,
  raw: string,
  decimals: number,
  fromBlock: number,
  toBlock: number,
  intervals: number,
  readings: number,
  coords: AlchemixCoords,
): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    summary: `${symbol} the collateral gained or lost from the vault's share price moving — this position's shares against each step the share price took`,
    contract: { name: "Metavault (MYT)" },
    formula: "Σ shares × (share price at the later reading − share price at the earlier one)",
    via: `${readings} readings of getCDP(${coords.tokenId}) and the MYT's share price, blocks ${fromBlock} to ${toBlock}`,
    verify: {
      kind: "recompute",
      text: `Take each pair of consecutive readings between blocks ${fromBlock} and ${toBlock} and sum the moves`,
    },
    source: { block: toBlock },
    inputs: coordInputs(coords, [
      { label: "first reading", value: `block ${fromBlock}`, kind: "chain" },
      { label: "last reading", value: `block ${toBlock}`, kind: "chain" },
      {
        label: "steps summed",
        value: `${intervals} of ${readings} readings`,
        kind: "chain",
        note: "the share count holds still across each one, so each step is a share-price move alone",
      },
      {
        label: "sign",
        value: "the figure can be negative",
        kind: "offchain",
        note: "a vault share can lose value, so this is what the price did and never a promised yield",
      },
    ]),
    scaling: { raw, from: "call", places: decimals, why: `${symbol} carries ${decimals} decimals` },
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
