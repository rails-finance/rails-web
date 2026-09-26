// Alchemix V3 read shapes, as rails-server serves them.
// ----------------------------------------------------------------------------
// The source of truth is `api/src/routes/alchemix.ts` in rails-server-onboarding
// (`shapePosition` and `readCoverage`). These declarations mirror it; nothing
// here reshapes a figure, because every figure on that wire already carries the
// block it is true at and the grade it was settled under.
//
// THREE RULES THIS FILE ENCODES, so a surface built on it cannot break them.
//
// 1. THE GRADE IS PER LINE, NOT PER POSITION (rails-ops decisions/0032). A line
//    with no redemption replays wei-exact from the position's own events and is
//    graded `derived`. From a line's first redemption the replay is a lower
//    bound — a redemption moves every open position's debt at once with nothing
//    in the position's events to see — so the served figure is a `getCDP` read
//    at a block and is graded `read`. `unavailable` is a read-grade line with no
//    current reading for this position: then only `derivedLowerBound` is known,
//    and it is a floor, never the debt. `refused` is the reducer declining the
//    position outright; no figure is served rather than a wrong one. Base is
//    `derived` today; both Ethereum lines are `read`.
//
// 2. EARMARKED IS TRUE AT ONE BLOCK AND NO OTHER. It accrues every block, so it
//    is typed with its own `asOfBlock` and never as a bare amount. It must not
//    be carried forward, interpolated, or added to a debt figure read at another
//    block. History comes from the stored rows, each stating its own block.
//
// 3. NO V2 FIGURE BELONGS IN THIS SHAPE. Alchemix V2 closed on 2026-04-02 and
//    its frozen record is a separate read (rails-ops
//    `reference/alchemix-v2-frozen-record.md`). A V3 position is what a linked
//    V2 one BECAME, so adding the two debts double counts one obligation. There
//    is deliberately no field here for a V2 leg.

/** A wei-scale integer with the decimal reading of it beside it. `raw` is the
 *  integer the contract holds; `formatted` is it scaled by the token's decimals
 *  for display, and nothing computes from `formatted`. */
export interface AlchemixAmount {
  raw: string;
  formatted: number;
}

/** An amount that is only true at the block it was settled at. */
export interface AlchemixAmountAtBlock extends AlchemixAmount {
  asOfBlock: number | null;
}

/** The MYT's underlying, converted from the share count at the share price the
 *  reading carried. The share count's block and the share price's block are
 *  both on the wire because they need not be the same block. */
export interface AlchemixUnderlyingValue {
  symbol: string | null;
  decimals: number;
  address: string;
  raw: string;
  formatted: number;
  sharePriceAsOfBlock: number | null;
  sharePriceRaw: string;
}

/** A USD reading of the underlying. Absent rather than zero when the price lane
 *  could not answer. `pricedAt` is the address the price was asked for — on a
 *  Base line the mainnet twin of the same asset. */
export interface AlchemixUsdValue {
  usd: number;
  pricePerUnit: number;
  priceSource: string;
  pricedAt: string;
}

export interface AlchemixCollateral extends AlchemixAmountAtBlock {
  /** Collateral is held as MYT SHARES; the underlying is the conversion. */
  unit: "myt-shares";
  mytSymbol: string | null;
  underlying: AlchemixUnderlyingValue | null;
  usd: AlchemixUsdValue | null;
}

export type AlchemixGrade = "derived" | "read" | "unavailable" | "refused";

/** The replayed figures, which are what the position's own events alone can
 *  say. Present whenever the line carries the read grade. Past `validToBlock`
 *  they are a FLOOR, not the position's debt — a redemption below that block
 *  moved the debt with nothing in these events to see. */
export interface AlchemixDerivedLowerBound {
  debtRaw: string;
  collateralRaw: string;
  validToBlock: number;
  reducedToBlock: number;
}

export interface AlchemixFigures {
  grade: AlchemixGrade;
  /** The route's own sentence for this grade, in plain words. Rendered as
   *  given: the difference between the lines is a thing to say, not a chip. */
  gradeReason: string;
  basis: "event-replay" | "getCDP-at-block" | null;
  exactness: "wei-exact" | "within-one-wei" | null;
  debt: AlchemixAmountAtBlock | null;
  collateral: AlchemixCollateral | null;
  /** Earmarked debt at the block the reading was taken at, and at no other. */
  earmarked: AlchemixAmountAtBlock | null;
  derivedLowerBound: AlchemixDerivedLowerBound | null;
}

export interface AlchemixActivity {
  firstEventBlock: number;
  lastEventBlock: number;
  reducedToBlock: number;
}

export interface AlchemixChainReading {
  blockNumber: number;
  stale: boolean;
  isLive: boolean;
  refreshedAt: string | null;
  mytSharePriceRaw: string | null;
}

export type AlchemixPositionStatus = "open" | "closed" | "refused" | "unknown";

/** One Alchemist position, keyed by (lineKey, tokenId) — a token id is unique
 *  only inside its line, so both halves travel together everywhere. */
export interface AlchemixPositionSummary {
  lineKey: string;
  chainId: number;
  chainName: string | null;
  tokenId: string;
  owner: string | null;
  syntheticSymbol: string;
  lineDisplayName: string;
  status: AlchemixPositionStatus;
  refusedReason: string | null;
  positionUrl: string | null;
  figures: AlchemixFigures;
  activity: AlchemixActivity;
  chainReading: AlchemixChainReading | null;
}

/** What a line answers about its own completeness. The route states coverage
 *  rather than implying it, and the grade here is the grade every position on
 *  the line carries. */
export interface AlchemixLineCoverage {
  lineKey: string;
  chainId: number;
  chainName: string | null;
  syntheticSymbol: string;
  displayName: string;
  indexedToBlock: number | null;
  grade: "derived" | "read";
  firstRedemptionBlock: number | null;
  redemptionCount: number;
  /** A redemption whose getCDP sweep has not run: the readings on this line do
   *  not yet cover every block at which debt could have stepped. */
  unsweptRedemptions: number;
  staleHeadReadings: number;
  lastRefreshedAt: string | null;
}

export interface AlchemixPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/** The positions listing as the backend serves it. A refusal is
 *  `{ success: false, error }` and never carries `data`. */
export interface AlchemixPositionsResponse {
  success: true;
  data: AlchemixPositionSummary[];
  pagination: AlchemixPagination;
  coverage: { lines: AlchemixLineCoverage[] };
  notes: { earmarked: string };
}

// ── One Alchemist position: the three reads its page makes ───────────────────
//
// `/api/alchemix/position/:lineKey/:tokenId` carries the same
// `AlchemixPositionSummary` the listing serves, so the page and the row state
// one thing. `/timeline` carries the position's events in the shared
// `BaseActivityEvent` shape. `/state` is the live `getCDP` read, and it is the
// only place a CURRENT earmarked figure may come from: earmarked accrues on
// every block, so a stored figure is true at its own block and nowhere else.

/** One position, with the coverage its line answers for. */
export interface AlchemixPositionResponse {
  success: true;
  data: AlchemixPositionSummary;
  coverage: { lines: AlchemixLineCoverage[] };
  notes: { earmarked: string };
}

/** The position's events, newest first, windowed on `limit`/`offset`. The
 *  events are typed at the call site against `BaseActivityEvent` so this
 *  module stays free of the event-shape import graph. */
export interface AlchemixTimelineData<TEvent> {
  lineKey: string;
  tokenId: string;
  chainId: number;
  owner: string | null;
  positionKind: "alchemist";
  events: TEvent[];
}

export interface AlchemixTimelineResponse<TEvent> {
  success: true;
  data: AlchemixTimelineData<TEvent>;
  pagination: AlchemixPagination;
  notes: { lineScopedEvents: string };
}

/** The collateral leg of a live read. One `asOfBlock` covers the whole reading
 *  and sits on the payload, not on each figure: all three come from one call at
 *  one block, which is what makes earmarked safe to show beside debt HERE and
 *  nowhere else. The share price carries its own block all the same, because
 *  the conversion to the underlying need not have been read at that block. */
export interface AlchemixLiveCollateral extends AlchemixAmount {
  unit: "myt-shares";
  mytSymbol: string | null;
  underlying: AlchemixUnderlyingValue | null;
  usd: AlchemixUsdValue | null;
}

export interface AlchemixLiveState {
  lineKey: string;
  tokenId: string;
  chainId: number;
  /** The block all three figures below were read at. */
  asOfBlock: number;
  source: "getCDP";
  cache: "fresh" | "stale" | "miss";
  readAt: string;
  debt: AlchemixAmount | null;
  collateral: AlchemixLiveCollateral;
  earmarked: AlchemixAmount | null;
}

export interface AlchemixStateResponse {
  success: true;
  data: AlchemixLiveState;
  notes: { earmarked: string };
}
