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

import type { RedemptionNet } from "@/lib/alchemix/redemption-net";
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

/** The collateral one redemption took from this position, from the same two
 *  readings the cleared debt is taken from. Only built where the reading before
 *  it is the one `debtClearedFromReadings` names, so the two figures always
 *  span the same pair of blocks. */
export function collateralTakenFromReadingsProv(
  symbol: string,
  raw: string,
  fromBlock: number,
  atBlock: number,
  coords: AlchemixCoords,
): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    summary: `${symbol} this redemption took from this position's collateral — the share count read at two blocks, one either side of it`,
    contract: alchemistContract(coords),
    via: `getCDP(${coords.tokenId}) at blocks ${fromBlock} and ${atBlock}`,
    formula: `collateral at block ${fromBlock} − collateral at block ${atBlock}`,
    verify: {
      kind: "recompute",
      text: `Call getCDP(${coords.tokenId}) at blocks ${fromBlock} and ${atBlock} and take the difference`,
    },
    source: { block: atBlock },
    inputs: coordInputs(coords, [
      { label: "collateral read before", value: `block ${fromBlock}`, kind: "chain" },
      { label: "collateral read at the redemption", value: `block ${atBlock}`, kind: "chain" },
      {
        label: "where it went",
        value: "the line's Transmuter",
        kind: "chain",
        note: "it backs the debt the redemption cleared",
      },
    ]),
    scaling: { raw, from: "call", places: 18, why: `${symbol} carries 18 decimals` },
  };
}

/** The collateral a RUN of redemptions took from this position, summed the
 *  way `clearedRunProv` sums the debt. */
export function takenRunProv(
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
    summary: `${symbol} this run took from this position's collateral — the sum over each redemption in it`,
    contract: alchemistContract(coords),
    via: `getCDP(${coords.tokenId}) either side of each redemption in the run`,
    formula: `Σ (collateral before − collateral at) over ${stated} redemption${stated === 1 ? "" : "s"}`,
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

/** The change on one axis between the reading before a card and the reading at
 *  it: two readings, subtracted. On set-aside the two readings are true at
 *  their own blocks, and the receipt names both. */
export function readingChangeProv(
  label: string,
  symbol: string,
  fromBlock: number,
  atBlock: number,
  coords: AlchemixCoords,
): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    summary: `${label} change — this position read at block ${fromBlock} and again at block ${atBlock}`,
    contract: alchemistContract(coords),
    via: `getCDP(${coords.tokenId}) at blocks ${fromBlock} and ${atBlock}`,
    formula: `${label.toLowerCase()} after − ${label.toLowerCase()} before`,
    verify: {
      kind: "recompute",
      text: `Call getCDP(${coords.tokenId}) at blocks ${fromBlock} and ${atBlock} and take the difference`,
    },
    source: { block: atBlock },
    inputs: coordInputs(coords, [
      { label: `${label.toLowerCase()} before`, value: "", kind: "chain", note: `read at block ${fromBlock}` },
      { label: `${label.toLowerCase()} after`, value: "", kind: "chain", note: `read at block ${atBlock}` },
    ]),
  };
}

// ── What the position read as at one event's block ──────────────────────────
//
// A READING, NOT AN ACCUMULATION. The sweep stores a `getCDP` result at every
// block a position's own events could move it and at every line `Redemption`,
// so the figure served beside an event is what the chain answered at that
// block. Adding the position's own deltas would not reach it: a redemption
// moves debt line-wide and names no position, so the events are short by
// whatever the redemptions took.
//
// THE RECEIPT NAMES THE BLOCK AND WHAT ELSE SHARES IT. One reading covers every
// event in its block, so `eventsInBlock` rides in the trace: at 1 the figure is
// this event's alone, above 1 it is the state after all of them, and the
// receipt says which rather than leaving a reader to assume the first.

/** One axis of the reading taken at an event's block. `eventsInBlock` is how
 *  many of this position's events that one reading covers. */
export function stateAtBlockFromReadingProv(
  label: string,
  symbol: string,
  raw: string | null,
  atBlock: number,
  eventsInBlock: number,
  coords: AlchemixCoords,
  decimals = 18,
): Provenance {
  const shared = eventsInBlock > 1;
  return {
    kind: "chain",
    pclass: "state",
    summary: `${label} — this position read from the Alchemist at block ${atBlock}`,
    contract: alchemistContract(coords),
    via: `getCDP(${coords.tokenId}) at block ${atBlock}`,
    verify: { kind: "recompute", text: `Call getCDP(${coords.tokenId}) at block ${atBlock}` },
    source: { block: atBlock },
    inputs: coordInputs({ ...coords, blockNumber: atBlock }, [
      {
        label: "what the figure is",
        value: "one reading of the Alchemist at this block",
        kind: "chain",
        note: "a redemption moves debt across the whole line, so the position's own events cannot reach this figure",
      },
      {
        label: "this position's events in the block",
        value: String(eventsInBlock),
        kind: "chain",
        note: shared
          ? "the reading covers all of them, so it is the state after the last of them"
          : eventsInBlock === 1
            ? "this event alone, so the reading is its state-after"
            : "none — the block belongs to a line-scope event, and the reading is the state after it",
      },
      // The two unit caveats the card face used to carry in prose, each on the
      // receipt of the figure it governs and nowhere else.
      ...(label === "Collateral"
        ? [
            {
              label: "what this counts",
              value: `${symbol} shares`,
              kind: "chain" as const,
              note: "the vault share count",
            },
          ]
        : []),
      ...(label === "Set aside for repayment"
        ? [
            {
              label: "how long it holds",
              value: `block ${atBlock} only`,
              kind: "chain" as const,
              note: "it grows block by block as the Transmuter's stakes mature (decisions/0032 point 6), so it holds at this block alone",
            },
          ]
        : []),
    ]),
    scaling: raw ? { raw, from: "call", places: decimals, why: `${symbol} carries ${decimals} decimals` } : undefined,
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
  refused: "nothing: the reducer declined this position",
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
    scaling: raw
      ? { raw, from: readGraded ? "call" : "log", places: decimals, why: `${symbol} carries ${decimals} decimals` }
      : undefined,
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
        value: `debt, collateral and set aside for repayment at block ${asOfBlock}`,
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
    inputs: coordInputs(coords, [{ label: "events counted", value: String(events), kind: "chain-derived" }]),
  };
}

// ── The position's health ───────────────────────────────────────────────────

/** The collateralisation: `totalValue(tokenId)` over the debt, both at one
 *  block. `totalValue` is the collateral in debt-token units, where the
 *  contract counts one unit of the underlying as one unit of debt. */
export function collateralisationProv(
  collateralValueRaw: string,
  debtRaw: string,
  asOfBlock: number,
  coords: AlchemixCoords,
): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    summary: "Collateralisation — the collateral in the underlying over the debt, at one block",
    contract: alchemistContract(coords),
    formula: "totalValue(tokenId) ÷ debt",
    via: `totalValue(${coords.tokenId}) and getCDP(${coords.tokenId}) at block ${asOfBlock}`,
    verify: {
      kind: "recompute",
      text: `Call totalValue(${coords.tokenId}) and getCDP(${coords.tokenId}) at block ${asOfBlock} and divide`,
    },
    source: { block: asOfBlock },
    inputs: coordInputs(coords, [
      {
        label: "collateral value",
        value: collateralValueRaw,
        kind: "chain",
        note: "totalValue: the vault shares in the underlying, one underlying counted as one unit of debt, 18 decimals",
      },
      { label: "debt", value: debtRaw, kind: "chain", note: "getCDP's debt, 18 decimals" },
    ]),
  };
}

/** One of the line's two ratios, read from the Alchemist at the reading's
 *  block. Both have setters, so neither is a constant. */
export function lineRatioProv(
  getter: "minimumCollateralization" | "collateralizationLowerBound",
  raw: string,
  asOfBlock: number,
  coords: AlchemixCoords,
): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    summary:
      getter === "minimumCollateralization"
        ? "Minimum collateralisation — a mint or a withdrawal must leave the position above it"
        : "Liquidation line — at or below it, anyone may liquidate the position",
    contract: alchemistContract(coords),
    via: `${getter}() at block ${asOfBlock}`,
    verify: { kind: "recompute", text: `Call ${getter}() on the Alchemist at block ${asOfBlock}` },
    source: { block: asOfBlock },
    inputs: coordInputs(coords, [
      { label: getter, value: raw, kind: "chain", note: "1e18 is 100%; governance can change it" },
    ]),
    scaling: { raw, from: "call", places: 16, why: "a 1e18-scaled ratio, shown as a percentage" },
  };
}

/** How many liquidations the line has had, counted over the captured logs. */
export function lineLiquidationsProv(count: number, throughBlock: number | null, coords: AlchemixCoords): Provenance {
  return {
    kind: "chain-derived",
    pclass: "indexed",
    summary: "Liquidations on this line — every Liquidated and BatchLiquidated log captured",
    contract: alchemistContract(coords),
    via: `${ALCHEMIX_VIA}${throughBlock != null ? ` · to block ${throughBlock}` : ""}`,
    verify: { kind: "rollup", text: "It counts the line's captured liquidation logs" },
    source: { block: throughBlock ?? undefined },
    inputs: coordInputs(coords, [{ label: "liquidations", value: String(count), kind: "chain-derived" }]),
  };
}

// ── Redemption net, share price, distance to liquidation ─────────────────────

const fmtUnits = (raw: string, places: number, max = 6) => {
  const n = Number(raw) / 10 ** places;
  return n.toLocaleString("en-US", { maximumFractionDigits: max });
};

/** One redemption's net for this position, in the underlying
 *  (lib/alchemix/redemption-net): the debt cleared at one underlying each, less
 *  the shares taken at the share price read at the redemption's block. */
export function redemptionNetProv(
  n: Extract<RedemptionNet, { status: "stated" }>,
  syntheticSymbol: string,
  mytSymbol: string,
  underlyingSymbol: string,
  coords: AlchemixCoords,
): Provenance {
  const price = fmtUnits(n.sharePriceRaw, n.underlyingDecimals, 8);
  return {
    kind: "chain-derived",
    pclass: "state",
    summary: `Net for this position — the ${syntheticSymbol} debt cleared, valued at 1 ${underlyingSymbol} each as the protocol counts it, less the ${mytSymbol} taken, valued at the share price read at the redemption's block`,
    contract: alchemistContract(coords),
    via: `getCDP(${coords.tokenId}) at blocks ${n.fromBlock} and ${n.atBlock}, and the ${mytSymbol} share price at block ${n.atBlock}`,
    formula:
      `${fmtUnits(n.clearedRaw, 18)} ${syntheticSymbol} × 1 − ${fmtUnits(n.takenRaw, 18)} ${mytSymbol} × ${price} ${underlyingSymbol} ` +
      `= ${fmtUnits(n.clearedRaw, 18)} − ${fmtUnits(n.takenValueRaw, 18)} = ${fmtUnits(n.netRaw, 18)} ${underlyingSymbol}`,
    verify: { kind: "recompute", text: "Recompute it from the debt cleared, the collateral taken and the share price" },
    source: { block: n.atBlock },
    inputs: coordInputs(coords, [
      {
        label: "debt cleared",
        value: n.clearedRaw,
        kind: "chain",
        note: `getCDP debt at ${n.fromBlock} − at ${n.atBlock}`,
      },
      {
        label: "collateral taken",
        value: n.takenRaw,
        kind: "chain",
        note: `getCDP collateral at ${n.fromBlock} − at ${n.atBlock}, in ${mytSymbol} shares`,
      },
      {
        label: "share price",
        value: n.sharePriceRaw,
        kind: "chain",
        note: `convertToAssets(1e18) at block ${n.atBlock}, ${n.underlyingDecimals} decimals of ${underlyingSymbol}`,
      },
    ]),
  };
}

/** The position's redemptions' nets summed. */
export function redemptionNetTotalProv(
  netRaw: string,
  counted: number,
  underlyingSymbol: string,
  coords: AlchemixCoords,
): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    summary: `Net for this position across its redemptions, in ${underlyingSymbol} — the sum of each redemption's net`,
    contract: alchemistContract(coords),
    via: `getCDP(${coords.tokenId}) either side of each redemption, and the share price at each redemption's block`,
    formula: `Σ (debt cleared × 1 − shares taken × share price) over ${counted} redemption${counted === 1 ? "" : "s"} = ${fmtUnits(netRaw, 18)} ${underlyingSymbol}`,
    verify: { kind: "rollup", text: "It rolls up the redemptions on the timeline, each with its own receipt" },
    inputs: coordInputs(coords, [{ label: "redemptions summed", value: String(counted), kind: "chain" }]),
  };
}

/** The MYT's share price: one share in the underlying, read at a block. */
export function sharePriceProv(
  mytSymbol: string,
  underlyingSymbol: string,
  raw: string,
  decimals: number,
  asOfBlock: number | null,
  mytAddress: string | null,
  coords: AlchemixCoords,
): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    summary: `${mytSymbol} share price — what one share is worth in ${underlyingSymbol}, which moves as the vault earns or loses`,
    contract: { name: `${mytSymbol} (Morpho Vault V2)`, ...(mytAddress ? { address: mytAddress } : {}) },
    via: `convertToAssets(1e18)${asOfBlock != null ? ` at block ${asOfBlock}` : ""}`,
    verify: {
      kind: "recompute",
      text: `Call convertToAssets(1e18) on the ${mytSymbol} vault${asOfBlock != null ? ` at block ${asOfBlock}` : ""}`,
    },
    source: { block: asOfBlock ?? undefined },
    inputs: coordInputs(coords),
    scaling: { raw, from: "call", places: decimals, why: `${underlyingSymbol} carries ${decimals} decimals` },
  };
}

/** How far the share price could fall before the liquidation line. */
export function liquidationDistanceProv(
  collateralizationRaw: string,
  lowerBoundRaw: string,
  fall: number,
  asOfBlock: number,
  coords: AlchemixCoords,
): Provenance {
  const pct = (raw: string) => `${(Number(raw) / 1e16).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;
  return {
    kind: "chain-derived",
    pclass: "state",
    summary:
      "Distance to liquidation — the fall in the vault's share price that would take this position to the liquidation line. Debt and collateral are counted in one underlying, so the ratio moves with the share price alone",
    contract: alchemistContract(coords),
    via: `totalValue(${coords.tokenId}), getCDP(${coords.tokenId}) and collateralizationLowerBound() at block ${asOfBlock}`,
    formula: `1 − ${pct(lowerBoundRaw)} ÷ ${pct(collateralizationRaw)} = ${(fall * 100).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`,
    verify: { kind: "recompute", text: "Recompute it from the collateralisation and the liquidation line beside it" },
    source: { block: asOfBlock },
    inputs: coordInputs(coords, [
      {
        label: "collateralisation",
        value: collateralizationRaw,
        kind: "chain",
        note: "totalValue ÷ debt, 1e18 is 100%",
      },
      { label: "collateralizationLowerBound", value: lowerBoundRaw, kind: "chain", note: "1e18 is 100%" },
    ]),
  };
}

/** The net's absence: the reading at the redemption's block carries no share
 *  price, so the collateral taken has no value in the underlying there. */
export function redemptionNetUnavailableProv(atBlock: number, coords: AlchemixCoords): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    summary:
      "Net not stated — the reading at this redemption's block carries no share price, so the collateral taken cannot be valued in the underlying there",
    contract: alchemistContract(coords),
    via: `getCDP(${coords.tokenId}) at block ${atBlock}, with no share price beside it`,
    verify: { kind: "none", text: "There is no figure to check" },
    source: { block: atBlock },
    inputs: coordInputs(coords),
  };
}
