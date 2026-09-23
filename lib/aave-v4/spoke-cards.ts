// Pure-logic helpers for building Aave V4 spoke selector cards. This app only
// ships aave-v4 (no aave-v3 / spark surface yet), so the multi-protocol guard
// collapses to an aave-v4 check, the context type is AaveV4Context, and the
// event type uses BaseActivityEvent's shape.
//
// Crucially, the risk datapoints here (HF, liq price, borrowing power,
// dominant-asset headroom %) derive from the events the API already returns
// plus the static LT lookup table — no on-chain reads are needed. Interest
// carry (computeAaveV4InterestPnl) additionally consumes chain-state balances.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AaveV4Context } from "@/lib/shared/types/protocols/aave-v4";
import { type PriceEntry, resolvePrice } from "@/lib/aave/prices";
import { pricesHaveLoaded, UNPRICED_DUST_TOKENS } from "@/lib/aave-v4/unpriced";
import { SPOKE_HUB, type HubTier } from "@/components/protocol/aave-v4/aave-v4-spoke-constants";
import { AAVE_V4_FALLBACK_LT } from "@/lib/aave-v4/liquidation-thresholds";
import { simulateAaveV4Position, computeSupplyBreakdown, type SupplyBreakdown } from "@/lib/aave-v4/utils/simulate";
import { effectiveBorrowAPR } from "@/lib/aave-v4/borrow-rate";

// ---- Types ----

interface DebtPoint {
  timestamp: number;
  debt: number;
  eventIndex: number;
}
interface FlowEvent {
  timestamp: number;
  amount: number;
  side: "supply" | "borrow";
  direction: "in" | "out";
  label: string;
  eventIndex: number;
}

export interface ReserveStats {
  symbol: string;
  supplied: number;
  withdrawn: number;
  borrowed: number;
  repaid: number;
  liquidatedDebt: number;
  liquidatedCollateral: number;
  liquidationCount: number;
  eventCount: number;
  collateralEnabled?: boolean;
  debtSeries: DebtPoint[];
  peakDebt: number;
  peakDebtTimestamp: number;
  peakSupply: number;
  flowEvents: FlowEvent[];
  /** Lifetime OUTFLOW value in USD at PRICE-AT-THE-TIME — each event valued at
   *  its own block price (ctx.price / ctx.debtPrice / ctx.collateralPrice),
   *  falling back to current only where no historic price exists. The inflow
   *  "Deposited/Borrowed (all time)" totals are derived downstream as current
   *  holding + these outflows, so a settled position's flow totals stay fixed
   *  while Deposited − Withdrawn = In Protocol still reconciles. */
  withdrawnUsd: number;
  repaidUsd: number;
  liquidatedDebtUsd: number;
  liquidatedCollateralUsd: number;
  /** Chain-state current balance for this reserve, when an on-chain read has
   *  been applied (see `patchReservesWithChain`). When absent, consumers
   *  derive current state from `supplied − withdrawn − liquidatedCollateral`.
   *  Keeping this separate from `supplied`/`withdrawn` preserves the lifetime
   *  totals the historical tower chart needs. */
  currentSupplied?: number;
  /** Chain-state current debt balance for this reserve. See `currentSupplied`. */
  currentBorrowed?: number;
  /** Chain-state liquidation threshold for this (spoke, reserve), when an
   *  on-chain read has been applied (see `patchReservesWithChain`). Undefined
   *  on purely event-derived reserves — the simulator then falls back to
   *  `AAVE_V4_FALLBACK_LT`. */
  lt?: number;
}

export interface AaveEconomicsResult {
  reserves: ReserveStats[];
  totalGasCostEth: number;
  totalGasCostUsd: number;
  eventCount: number;
  /** Distinct non-liquidation transaction count (COUNT DISTINCT txHash over
   *  owner-driven events). The Liquity-faithful "transactions" metric the card
   *  surfaces: unlike raw `eventCount` it isn't inflated by the supply+enable
   *  merge (two event rows, one tx, one timeline card) and it matches the
   *  timeline's per-tx "X OF Y" grouping. Liquidations are excluded — they're a
   *  liquidator's transaction, shown separately on the liquidation triangle. */
  txCount: number;
  firstTimestamp: number;
  lastTimestamp: number;
  /** The action of the life's LAST event (chronological). The closure
   *  mechanism derives from this — mirroring migration 057's terminal-event
   *  rule, so listing and detail attribute an ending the same way: a zeroed
   *  life whose final event is a liquidation ended in liquidation; one whose
   *  final event is the owner's withdraw was closed by the owner, however
   *  scarred the life before it (the scar is the triangle, not the ending). */
  lastAction: string;
  /** Largest the spoke's combined collateral ever was at a SINGLE moment, in
   *  USD at current prices — the running token balances across all reserves,
   *  summed and priced at every event, maxed over the timeline. This is a real
   *  high-water mark: unlike Σ(per-asset peak) it never exceeds a value the
   *  portfolio actually held, since per-asset peaks can occur at different times
   *  (and would sum to a moment that never existed). Event-derived history —
   *  the chain overlay deliberately doesn't recompute it. */
  peakSupplyUsd: number;
  /** Peak combined debt at a single moment, in USD at current prices. See
   *  `peakSupplyUsd`. */
  peakDebtUsd: number;
}

export interface SpokeGroup {
  name: string;
  hub: HubTier;
  events: BaseActivityEvent[];
  result: AaveEconomicsResult;
  totalSupplyUsd: number;
  totalDebtUsd: number;
  /** Assets held here that no price source covers. They add nothing to the two
   *  totals above, so a surface printing either has to say it is partial and
   *  name these (RULE: Rails never invents a price — lib/aave-v4/unpriced.ts). */
  unpricedSymbols: string[];
  collRatio: number | null;
  isClosed: boolean;
  eventCount: number;
  txCount: number;
}

export interface AaveSpokeCardInfo {
  name: string;
  hub: HubTier;
  totalSupplyUsd: number;
  /** Assets held here that no price source covers — missing from every USD
   *  figure on the card. See `SpokeGroup.unpricedSymbols`. */
  unpricedSymbols: string[];
  /** Collateral value after each asset is weighted by its liquidation threshold
   *  — the portion that actually backs borrowing and the health factor (Σ
   *  coll×price×LT). Always ≤ totalSupplyUsd; the gap is the LT haircut. Other
   *  dashboards label THIS figure "Collateral"; Rails' headline "Collateral"
   *  shows the gross totalSupplyUsd, so the explanation panel states both. */
  weightedCollateralUsd: number;
  /** Collateral-only blended liquidation threshold — Σ(collateralUsd × lt) /
   *  Σ(collateralUsd) over collateral-enabled reserves, on the chain-state
   *  balance basis. Computed with the IDENTICAL formula `describeCollateral
   *  Exposure` uses (lib/aave-v4/position-exposure), so the exposure sentence
   *  ("…% blended liquidation threshold") and the position-explanation panel
   *  ("each asset counts only up to its liquidation threshold, ~…%") state the
   *  same number rather than two same-looking-but-differently-derived figures.
   *  null when there's no priced collateral. */
  blendedLt: number | null;
  totalDebtUsd: number;
  peakSupplyUsd: number;
  peakDebtUsd: number;
  collRatio: number | null;
  isClosed: boolean;
  eventCount: number;
  /** Distinct non-liquidation transaction count — see AaveEconomicsResult.txCount.
   *  This is what the card's activity tally renders (the "transactions" metric),
   *  matching Liquity's transactionCount and the timeline's per-tx grouping. */
  txCount: number;
  supplyingSymbols: string[];
  borrowingSymbols: string[];
  latestBorrowRate: number | null;
  /** Aave-native HF = weightedCollateralUsd / totalDebtUsd. null when no debt. */
  healthFactor: number | null;
  /** Liq price for the dominant collateral asset (largest USD share). null when
   *  no debt, single-asset can't reach liq, or there's no priced collateral. */
  liqPrice: { symbol: string; currentPrice: number; liqPrice: number; headroomPct: number } | null;
  /** Per-collateral-asset liq prices (full output of the simulator). Drives the
   *  stacked price-runway view below the active spoke card. Sorted by USD share
   *  desc so the runway stack reads dominant → minor. */
  assetLiqPrices: {
    symbol: string;
    address?: string;
    currentPrice: number;
    liqPrice: number | null;
    headroomPct: number | null;
    usdShare: number;
  }[];
  /** Remaining USD that can be borrowed before HF=1. */
  borrowingPowerUsd: number;
  /** True when the wallet has ever been liquidated on this spoke. Surfaces
   *  a red liquidation indicator alongside the status pill — the position may
   *  still be active afterwards, but the history is permanent. */
  wasLiquidated: boolean;
  /** True when the life's FINAL event is a liquidation — the ending, as
   *  opposed to the scar (wasLiquidated). Drives the closed card's outcome:
   *  a life partially liquidated and later wound down by the owner is
   *  "closed", not "liquidated" (migration 057's terminal-event rule). */
  endedByLiquidation: boolean;
  /** Lifetime count of liquidation events on this spoke (summed across
   *  reserves). Drives the red triangle + count indicator; >0 ⟺ wasLiquidated.
   *  Aave positions can be partially liquidated repeatedly, so the count is
   *  meaningful — mirrors Liquity's redemption-count indicator (different tier:
   *  red critical here, orange caution there). */
  liquidationCount: number;
  /** Supplies split into collateral-enabled vs not. The headline "Collateral"
   *  uses `collateralUsd`; non-collateral supplies are shown separately and never
   *  counted as collateral (they can't be seized and don't move HF). */
  supplyBreakdown: SupplyBreakdown;
  /** Chain-faithful lifetime interest carry — supply interest earned minus
   *  borrow interest paid. Present only when chain-state balances have been
   *  applied (see computeAaveV4InterestPnl); null otherwise. */
  interestPnl?: AaveV4InterestPnl | null;
  /** On-chain-oracle valuation of the headline totals — each the chain-state
   *  balance × Aave's own on-chain oracle price (see useAaveV4OraclePrices), so
   *  it survives On-chain-values as chain-derived. Each field is null unless
   *  EVERY contributing asset is oracle-priced (a partial total can't be
   *  asserted as read from the chain, so it middots via the DefiLlama figure). The
   *  whole object is absent when no chain-state balances / oracle prices are
   *  available (the derived DefiLlama view is unaffected). */
  onchainUsd?: { collateral: number | null; debt: number | null; supply: number | null };
}

/** Per-asset realized interest for the position, derived as
 *  `chain-state current balance − net principal moved`. Token figures are
 *  exact (no rate needed); USD is the token figure at the current price. */
export interface AaveV4AssetInterest {
  symbol: string;
  /** Supply interest earned, in underlying tokens (≥ 0 in normal operation). */
  supplyInterest: number;
  /** Borrow interest paid, in underlying tokens (≥ 0 in normal operation). */
  borrowInterest: number;
  supplyInterestUsd: number;
  borrowInterestUsd: number;
}

export interface AaveV4InterestPnl {
  /** Assets with a non-dust, reliable interest figure on at least one leg. */
  assets: AaveV4AssetInterest[];
  /** Σ supplyInterestUsd − Σ borrowInterestUsd across reliable assets — the
   *  net carry ("Total Earnings" analogue). Negative = paid more than earned. */
  netUsd: number;
  /** True when at least one priced asset produced a usable figure. */
  hasData: boolean;
  /** True when the position holds a chain-state balance whose principal isn't in
   *  the event record — a position opened via a swap aggregator / transfer-in
   *  (CowSwap / 1inch / Pendle) that skipped the standard Supply/Borrow event.
   *  Interest can't be computed for that leg; the UI surfaces a one-line reason
   *  rather than a confusing blank. May be true alongside hasData (a position
   *  that's partly aggregator-opened, partly indexed). */
  unattributed: boolean;
}

// Below this token threshold an interest leg is treated as zero — share-rounding
// and dust make sub-threshold figures meaningless. A leg more negative than this
// signals the event-derived principal is missing deposits/repays (indexer drift
// the chain-state balance can't repair), so we drop that leg as unreliable
// rather than show a nonsensical "negative interest earned".
const INTEREST_DUST_TOKENS = 1e-9;

/**
 * Interest on one leg (supply or borrow) of a reserve, with reliability gates.
 * `interest = current − netPrincipal` is exact only when we saw every flow
 * event for the leg; the gates drop the cases where we provably didn't:
 *
 *  - `current == null` → no chain-state balance, can't isolate interest.
 *  - `grossIn <= 0` → we never indexed any deposit/borrow here, yet a balance
 *    exists (aggregator-wrapped open — CowSwap/1inch/Pendle). Attributing the
 *    whole balance to "interest" would be nonsense, so bail. This is the common
 *    drift case the chain overlay exists for.
 *  - `interest < dust` → zero, or negative because principal events are missing.
 *  - `interest > grossIn` → more "interest" than total principal ever moved in:
 *    physically implausible (would need >100% cumulative yield), so it's missed
 *    principal, not interest — drop. Legit exited positions (withdrew principal
 *    + a little interest) stay well under this bound.
 */
function legInterest(current: number | undefined, netPrincipal: number, grossIn: number): number {
  if (current == null || grossIn <= 0) return 0;
  const interest = current - netPrincipal;
  if (interest < INTEREST_DUST_TOKENS) return 0;
  if (interest > grossIn) return 0;
  return interest;
}

/**
 * Chain-faithful interest carry for a position, computed per reserve as
 * `current balance (chain-state) − net principal (events)`:
 *
 *   supplyInterest = currentSupplied − (supplied − withdrawn − liquidatedCollateral)
 *   borrowInterest = currentBorrowed − (borrowed − repaid − liquidatedDebt)
 *
 * The token result is exact and needs no rate — it's literally "what you hold
 * now minus what you put in". USD is that token figure valued at the current
 * price (clearly a current-value view, not accrual-time). Requires reserves
 * that have been through `patchReservesWithChain` (so `currentSupplied` /
 * `currentBorrowed` are populated); without the chain overlay it returns null.
 *
 * Caveat surfaced to callers via `hasData`: the principal legs are
 * event-derived, so a leg that comes out implausibly negative (missed
 * deposit/repay events) is dropped rather than shown.
 */
export function computeAaveV4InterestPnl(
  reserves: ReserveStats[],
  prices: Record<string, PriceEntry | number>,
): AaveV4InterestPnl | null {
  // No chain overlay applied → we can't separate interest from principal. Bail
  // so callers fall back to showing nothing rather than an event-only guess.
  const hasChainTruth = reserves.some((r) => r.currentSupplied != null || r.currentBorrowed != null);
  if (!hasChainTruth) return null;

  const assets: AaveV4AssetInterest[] = [];
  let netUsd = 0;
  let hasData = false;
  let unattributed = false;

  for (const r of reserves) {
    const price = resolvePrice(r.symbol, prices);

    const netSupplyPrincipal = r.supplied - r.withdrawn - r.liquidatedCollateral;
    const netBorrowPrincipal = r.borrowed - r.repaid - r.liquidatedDebt;

    const supplyInterest = legInterest(r.currentSupplied, netSupplyPrincipal, r.supplied);
    const borrowInterest = legInterest(r.currentBorrowed, netBorrowPrincipal, r.borrowed);

    // Aggregator / transfer-in open: a chain-state balance exists on a leg but
    // we indexed no deposit/borrow for it, so its principal — and thus its
    // interest — is unknowable. Flag the clear-cut case (zero indexed principal,
    // non-dust balance) so the UI can explain the gap.
    if (r.currentSupplied != null && r.currentSupplied > INTEREST_DUST_TOKENS && r.supplied <= INTEREST_DUST_TOKENS) {
      unattributed = true;
    }
    if (r.currentBorrowed != null && r.currentBorrowed > INTEREST_DUST_TOKENS && r.borrowed <= INTEREST_DUST_TOKENS) {
      unattributed = true;
    }

    if (supplyInterest === 0 && borrowInterest === 0) continue;
    // No price source, no USD interest leg (RULE: Rails never invents a price —
    // lib/aave-v4/unpriced.ts). The carry this reserve earned is real but has no
    // dollar value to state, so it contributes nothing here instead of a figure
    // priced at a dollar a unit. The `unattributed` flag above is about
    // principal, not price, so it is raised before this point.
    if (price == null) continue;

    const supplyInterestUsd = supplyInterest * price;
    const borrowInterestUsd = borrowInterest * price;
    netUsd += supplyInterestUsd - borrowInterestUsd;
    if (price > 0) hasData = true;

    assets.push({ symbol: r.symbol, supplyInterest, borrowInterest, supplyInterestUsd, borrowInterestUsd });
  }

  // Nothing reliable to show and no gap to explain → let callers render nothing.
  if (assets.length === 0 && !unattributed) return null;
  return { assets, netUsd, hasData, unattributed };
}

// ---- Guard ----

function isAaveV4Event(
  e: BaseActivityEvent,
): e is BaseActivityEvent & { context: { protocol: "aave-v4"; data: AaveV4Context } } {
  return e.context?.protocol === "aave-v4" && !!e.context?.data;
}

// ---- Calculation ----

export function calculateAaveEconomics(
  events: BaseActivityEvent[],
  eventIndexMap?: Map<string, number>,
  prices?: Record<string, PriceEntry | number>,
): AaveEconomicsResult | null {
  const aaveEvents = events.filter(isAaveV4Event);
  if (aaveEvents.length === 0) return null;

  const sorted = [...aaveEvents].sort((a, b) => a.timestamp - b.timestamp);

  // Distinct owner transactions: count unique txHashes excluding liquidations
  // (a liquidator's tx, surfaced on the triangle, not the owner's activity).
  // Counting transactions — not raw event rows — makes the tally immune to the
  // supply+enable merge (two rows, one tx, one card) and aligns it with the
  // timeline's per-tx "X OF Y" grouping. Fall back to event id when a row has
  // no txHash so it still counts once.
  const txSet = new Set<string>();
  for (const e of aaveEvents) {
    if (e.context.data.eventType === "liquidation") continue;
    txSet.add(e.txHash ?? e.id);
  }

  const reserveMap = new Map<string, ReserveStats>();
  let totalGasCostEth = 0;
  let totalGasCostUsd = 0;

  const runningDebt = new Map<string, number>();
  const runningSupply = new Map<string, number>();
  // Per-symbol price at that reserve's most-recent event ("price-at-the-time").
  // Populated from the historic price plumbed on each event's context
  // (ctx.price / ctx.collateralPrice / ctx.debtPrice, sourced from the MV's
  // at-or-before lookup). The peaks below are valued from this map so a settled
  // record stays fixed in the money of its era; current prices are only a
  // fallback for reserves whose events carry no historic price.
  const reservePrice = new Map<string, number>();
  // Portfolio-wide high-water marks: the largest the SUMMED running balances
  // (priced at the time — see reservePrice) ever reached at a single moment.
  // Tracked across the whole timeline rather than per-reserve so two assets that
  // peaked at different times don't add up to a portfolio value that never existed.
  let peakSupplyUsd = 0;
  let peakDebtUsd = 0;
  let fallbackSeq = 0;

  for (const event of sorted) {
    const ctx = event.context.data;
    const amount = parseFloat(ctx.amount ?? "0");
    const symbol = ctx.reserveSymbol ?? "?";
    fallbackSeq++;
    const eventSeq = eventIndexMap?.get(event.id) ?? fallbackSeq;

    // Capture the moved asset's price at THIS event's block. Non-liquidation
    // rows carry it on ctx.price; liquidation rows carry ctx.collateralPrice /
    // ctx.debtPrice and are handled in the liquidation case below.
    const movedPrice = ctx.price?.usd;
    if (movedPrice != null && movedPrice > 0) reservePrice.set(symbol, movedPrice);
    // Price for the moved asset AT THIS event, used to value lifetime outflows
    // at price-at-the-time. Prefer this event's historic price, else the
    // reserve's most-recent historic price. NO current-price fallback — per the
    // chain-state omission rule a historic figure must not be back-filled with a
    // live-market guess; an unpriceable event contributes 0 (omitted).
    const priceNow = movedPrice ?? reservePrice.get(symbol) ?? 0;

    if (event.gas) {
      totalGasCostEth += event.gas.gasCostEth || 0;
      totalGasCostUsd += event.gas.gasCostUsd || 0;
    }

    let stats = reserveMap.get(symbol);
    if (!stats) {
      stats = {
        symbol,
        supplied: 0,
        withdrawn: 0,
        borrowed: 0,
        repaid: 0,
        liquidatedDebt: 0,
        liquidatedCollateral: 0,
        liquidationCount: 0,
        eventCount: 0,
        debtSeries: [],
        peakDebt: 0,
        peakDebtTimestamp: 0,
        peakSupply: 0,
        flowEvents: [],
        withdrawnUsd: 0,
        repaidUsd: 0,
        liquidatedDebtUsd: 0,
        liquidatedCollateralUsd: 0,
      };
      reserveMap.set(symbol, stats);
      runningDebt.set(symbol, 0);
      runningSupply.set(symbol, 0);
    }
    stats.eventCount++;

    switch (ctx.eventType) {
      case "supply": {
        stats.supplied += amount;
        const supply = (runningSupply.get(symbol) ?? 0) + amount;
        runningSupply.set(symbol, supply);
        if (supply > stats.peakSupply) stats.peakSupply = supply;
        if (amount > 0)
          stats.flowEvents.push({
            timestamp: event.timestamp,
            amount,
            side: "supply",
            direction: "in",
            label: "Supply",
            eventIndex: eventSeq,
          });
        break;
      }
      case "withdraw": {
        stats.withdrawn += amount;
        stats.withdrawnUsd += amount * priceNow;
        runningSupply.set(symbol, Math.max(0, (runningSupply.get(symbol) ?? 0) - amount));
        if (amount > 0)
          stats.flowEvents.push({
            timestamp: event.timestamp,
            amount,
            side: "supply",
            direction: "out",
            label: "Withdraw",
            eventIndex: eventSeq,
          });
        break;
      }
      case "borrow":
        stats.borrowed += amount;
        runningDebt.set(symbol, (runningDebt.get(symbol) ?? 0) + amount);
        if (amount > 0)
          stats.flowEvents.push({
            timestamp: event.timestamp,
            amount,
            side: "borrow",
            direction: "in",
            label: "Borrow",
            eventIndex: eventSeq,
          });
        break;
      case "repay":
        stats.repaid += amount;
        stats.repaidUsd += amount * priceNow;
        runningDebt.set(symbol, (runningDebt.get(symbol) ?? 0) - amount);
        if (amount > 0)
          stats.flowEvents.push({
            timestamp: event.timestamp,
            amount,
            side: "borrow",
            direction: "out",
            label: "Repay",
            eventIndex: eventSeq,
          });
        break;
      case "liquidation": {
        // V4 liquidation events carry two assets:
        //   reserveSymbol  → the debt that was covered     (debtToCover)
        //   collateralSymbol → the collateral that was seized (liquidatedCollateralAmount)
        // The two amounts are denominated in different tokens, so they must
        // land on different ReserveStats records.
        const debtCovered = parseFloat(ctx.debtToCover ?? "0");
        const collSeized = parseFloat(ctx.liquidatedCollateralAmount ?? "0");
        const collSym = ctx.collateralSymbol;
        // Price-at-the-time for the two liquidation legs (ctx.price is null on
        // liquidation rows).
        if (ctx.debtPrice?.usd != null && ctx.debtPrice.usd > 0) reservePrice.set(symbol, ctx.debtPrice.usd);

        stats.liquidatedDebt += debtCovered;
        stats.liquidatedDebtUsd +=
          debtCovered * (ctx.debtPrice?.usd != null && ctx.debtPrice.usd > 0 ? ctx.debtPrice.usd : priceNow);
        stats.liquidationCount++;
        runningDebt.set(symbol, (runningDebt.get(symbol) ?? 0) - debtCovered);
        if (debtCovered > 0)
          stats.flowEvents.push({
            timestamp: event.timestamp,
            amount: debtCovered,
            side: "borrow",
            direction: "out",
            label: "Liquidate",
            eventIndex: eventSeq,
          });

        if (collSeized > 0) {
          // Collateral side lands on the seized asset's stats. When the
          // event omits collateralSymbol (older data), fall back to the
          // debt-side stats so the seizure isn't lost.
          let collStats = stats;
          if (collSym && collSym !== symbol) {
            let cs = reserveMap.get(collSym);
            if (!cs) {
              cs = {
                symbol: collSym,
                supplied: 0,
                withdrawn: 0,
                borrowed: 0,
                repaid: 0,
                liquidatedDebt: 0,
                liquidatedCollateral: 0,
                liquidationCount: 0,
                eventCount: 0,
                debtSeries: [],
                peakDebt: 0,
                peakDebtTimestamp: 0,
                peakSupply: 0,
                flowEvents: [],
                withdrawnUsd: 0,
                repaidUsd: 0,
                liquidatedDebtUsd: 0,
                liquidatedCollateralUsd: 0,
              };
              reserveMap.set(collSym, cs);
              runningDebt.set(collSym, 0);
              runningSupply.set(collSym, 0);
            }
            collStats = cs;
          }
          if (ctx.collateralPrice?.usd != null && ctx.collateralPrice.usd > 0)
            reservePrice.set(collStats.symbol, ctx.collateralPrice.usd);
          collStats.liquidatedCollateral += collSeized;
          collStats.liquidatedCollateralUsd +=
            collSeized *
            (ctx.collateralPrice?.usd != null && ctx.collateralPrice.usd > 0
              ? ctx.collateralPrice.usd
              : (reservePrice.get(collStats.symbol) ?? 0));
          runningSupply.set(collStats.symbol, Math.max(0, (runningSupply.get(collStats.symbol) ?? 0) - collSeized));
          collStats.flowEvents.push({
            timestamp: event.timestamp,
            amount: collSeized,
            side: "supply",
            direction: "out",
            label: "Liquidate",
            eventIndex: eventSeq,
          });
        }
        break;
      }
      default:
        if (ctx.eventType === "collateral_toggle") {
          stats.collateralEnabled = !!ctx.enabled;
        }
        break;
    }

    if (ctx.eventType === "borrow" || ctx.eventType === "repay" || ctx.eventType === "liquidation") {
      const debt = Math.max(0, runningDebt.get(symbol) ?? 0);
      stats.debtSeries.push({ timestamp: event.timestamp, debt, eventIndex: eventSeq });
      if (debt > stats.peakDebt) {
        stats.peakDebt = debt;
        stats.peakDebtTimestamp = event.timestamp;
      }
    }

    // Portfolio-wide high-water marks. Recompute the priced sum across all
    // reserves after each event (reserve counts are tiny) and keep the max —
    // this is a true single-instant peak, not a sum of per-asset peaks. Each
    // reserve is valued at its price-at-the-time (reservePrice); a reserve with
    // no historic price contributes 0 (omitted, not valued at a live price) per
    // the chain-state omission rule.
    const priceFor = (sym: string): number => reservePrice.get(sym) ?? 0;
    let supplyUsdNow = 0;
    for (const [sym, bal] of runningSupply) supplyUsdNow += Math.max(0, bal) * priceFor(sym);
    if (supplyUsdNow > peakSupplyUsd) peakSupplyUsd = supplyUsdNow;
    let debtUsdNow = 0;
    for (const [sym, bal] of runningDebt) debtUsdNow += Math.max(0, bal) * priceFor(sym);
    if (debtUsdNow > peakDebtUsd) peakDebtUsd = debtUsdNow;
  }

  return {
    reserves: [...reserveMap.values()],
    totalGasCostEth,
    totalGasCostUsd,
    eventCount: aaveEvents.length,
    txCount: txSet.size,
    firstTimestamp: sorted[0].timestamp,
    lastTimestamp: sorted[sorted.length - 1].timestamp,
    lastAction: sorted[sorted.length - 1].context.data.eventType,
    peakSupplyUsd,
    peakDebtUsd,
  };
}

/**
 * Harden a set of reserves for the no-chain-state fallback (chain RPC overlay
 * failed → `chainStale`, or the chain fetch was skipped/errored → no
 * chainPosition at all). In that path the only collateral signal is the
 * indexed `collateral_toggle` events that set `collateralEnabled`. Aave V4
 * makes collateral an explicit opt-in that emits a toggle event, so a supplied
 * reserve we never saw an enable-toggle for (`collateralEnabled === undefined`)
 * is resolved to NOT collateral rather than assumed-enabled.
 *
 * This keeps the fallback HF / borrowing-power / liq-price from crediting
 * collateral we can't confirm — the conservative direction for a risk read.
 * Reserves carrying an explicit enable/disable toggle keep that observed value.
 *
 * Only the fallback uses this: when the live chain read is available, the patch path
 * overwrites `collateralEnabled` with the on-chain `isCollateral` flag, which
 * is authoritative.
 */
export function resolveFallbackCollateral(reserves: ReserveStats[]): ReserveStats[] {
  return reserves.map((r) => ({ ...r, collateralEnabled: r.collateralEnabled ?? false }));
}

// ---- Spoke grouping ----

export function groupBySpoke(
  events: BaseActivityEvent[],
  eventIndexMap?: Map<string, number>,
  prices?: Record<string, PriceEntry | number>,
): SpokeGroup[] {
  const spokeMap = new Map<string, BaseActivityEvent[]>();
  for (const e of events) {
    if (!isAaveV4Event(e)) continue;
    const spoke = e.context.data.spokeName ?? "Main";
    const list = spokeMap.get(spoke) ?? [];
    list.push(e);
    spokeMap.set(spoke, list);
  }

  const groups: SpokeGroup[] = [];
  for (const [name, spokeEvents] of spokeMap) {
    const result = calculateAaveEconomics(spokeEvents, eventIndexMap, prices);
    if (!result) continue;
    // RULE: Rails never invents a price (lib/aave-v4/unpriced.ts). A reserve no
    // source prices adds nothing to either total; its symbol rides along so the
    // surfaces that print these figures can say the total is partial and name
    // what is missing.
    const unpricedSymbols: string[] = [];
    for (const r of pricesHaveLoaded(prices) ? result.reserves : []) {
      const held = Math.max(0, r.supplied - r.withdrawn) + Math.max(0, r.borrowed - r.repaid);
      if (held > UNPRICED_DUST_TOKENS && resolvePrice(r.symbol, prices) == null) unpricedSymbols.push(r.symbol);
    }
    const totalSupplyUsd = result.reserves.reduce(
      (s, r) => s + Math.max(0, r.supplied - r.withdrawn) * (resolvePrice(r.symbol, prices) ?? 0),
      0,
    );
    const totalDebtUsd = result.reserves.reduce(
      (s, r) => s + Math.max(0, r.borrowed - r.repaid) * (resolvePrice(r.symbol, prices) ?? 0),
      0,
    );
    groups.push({
      name,
      hub: SPOKE_HUB[name] ?? "Core",
      events: spokeEvents,
      result,
      totalSupplyUsd,
      totalDebtUsd,
      unpricedSymbols,
      collRatio: totalDebtUsd > 0 && totalSupplyUsd > 0 ? (totalSupplyUsd / totalDebtUsd) * 100 : null,
      isClosed: totalSupplyUsd < 1 && totalDebtUsd < 1,
      eventCount: result.eventCount,
      txCount: result.txCount,
    });
  }

  return groups.sort((a, b) => {
    if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1;
    return b.totalSupplyUsd - a.totalSupplyUsd;
  });
}

// USD threshold for asset-icon dust filtering — keeps the open-card icons
// consistent with the chart breakdown and prevents token-unit thresholds from
// stripping genuinely-valued dust on one asset while keeping rounding-zero on
// another.
const SPOKE_ICON_USD_MIN = 1;

/** The symbols a card's icon row shows for one leg, largest first. The row says
 *  WHAT is held, so a holding no source prices belongs on it — the USD dust
 *  floor can't judge one, so it clears a token floor instead and sorts last
 *  (RULE: Rails never invents a price — lib/aave-v4/unpriced.ts). */
function heldSymbols(
  reserves: ReserveStats[],
  amountOf: (r: ReserveStats) => number,
  prices?: Record<string, PriceEntry | number>,
): string[] {
  return reserves
    .map((r) => {
      const amount = amountOf(r);
      const price = resolvePrice(r.symbol, prices);
      return { symbol: r.symbol, amount, usd: price == null ? null : amount * price };
    })
    .filter((r) => (r.usd == null ? r.amount > UNPRICED_DUST_TOKENS : r.usd > SPOKE_ICON_USD_MIN))
    .sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1))
    .map((r) => r.symbol);
}

export function buildSpokeCards(
  spokeGroups: SpokeGroup[],
  prices?: Record<string, PriceEntry | number>,
): AaveSpokeCardInfo[] {
  return spokeGroups.map((g) => {
    // Portfolio-wide single-instant high-water marks (computed in
    // calculateAaveEconomics over the running balances) — NOT a sum of per-asset
    // peaks, which would overstate by combining peaks from different moments.
    const peakSupplyUsd = g.result.peakSupplyUsd;
    const peakDebtUsd = g.result.peakDebtUsd;
    const liveSupplying = heldSymbols(g.result.reserves, (r) => Math.max(0, r.supplied - r.withdrawn), prices);
    const liveBorrowing = heldSymbols(g.result.reserves, (r) => Math.max(0, r.borrowed - r.repaid), prices);
    const supplyingSymbols =
      liveSupplying.length > 0 ? liveSupplying : heldSymbols(g.result.reserves, (r) => r.peakSupply, prices);
    const borrowingSymbols =
      liveBorrowing.length > 0 ? liveBorrowing : heldSymbols(g.result.reserves, (r) => r.peakDebt, prices);

    // Most-recent borrow rate on this spoke — the true per-block on-chain rate
    // (effectiveBorrowAPR prefers allDebts[].borrowAPR, falls back to inferred).
    let spokeBorrowRate: number | null = null;
    for (const e of [...g.events].reverse()) {
      if (!isAaveV4Event(e)) continue;
      const apr = effectiveBorrowAPR(e.context.data);
      if (apr) {
        spokeBorrowRate = parseFloat(apr) * 100;
        break;
      }
    }

    // Every simulated figure (borrowing power, health factor, liquidation
    // price) weighs legs against each other in USD, so a leg with no price
    // source can't be simulated and stays out (RULE: Rails never invents a
    // price — lib/aave-v4/unpriced.ts).
    const simSupplies = g.result.reserves
      .map((r) => {
        const netSupply = Math.max(0, r.supplied - r.withdrawn);
        if (netSupply <= 0.0001) return null;
        const price = resolvePrice(r.symbol, prices);
        if (price == null) return null;
        // Chain-state LT when the reserve has been chain-patched; otherwise the
        // conservative fallback (no per-spoke table any more — see liquidation-thresholds).
        const lt = r.lt ?? AAVE_V4_FALLBACK_LT;
        const collateralEnabled = r.collateralEnabled ?? true;
        return { symbol: r.symbol, amount: netSupply, price, lt, collateralEnabled };
      })
      .filter(Boolean) as { symbol: string; amount: number; price: number; lt: number; collateralEnabled: boolean }[];
    const simDebts = g.result.reserves
      .map((r) => {
        const netDebt = Math.max(0, r.borrowed - r.repaid);
        if (netDebt <= 0.0001) return null;
        const price = resolvePrice(r.symbol, prices);
        if (price == null) return null;
        return { symbol: r.symbol, amount: netDebt, price };
      })
      .filter(Boolean) as { symbol: string; amount: number; price: number }[];

    const simResult = simulateAaveV4Position({ supplies: simSupplies, debts: simDebts });

    let liqPrice: AaveSpokeCardInfo["liqPrice"] = null;
    if (simResult.totalDebtUsd > 0 && simSupplies.length > 0) {
      const dominant = [...simSupplies].sort((a, b) => b.amount * b.price - a.amount * a.price)[0];
      const liq = simResult.assetLiqPrices.find((a) => a.symbol === dominant.symbol);
      if (liq && liq.liqPrice != null && liq.liqPrice > 0 && liq.headroomPct != null) {
        liqPrice = {
          symbol: liq.symbol,
          currentPrice: liq.currentPrice,
          liqPrice: liq.liqPrice,
          headroomPct: liq.headroomPct,
        };
      }
    }

    const usdBySym = new Map<string, number>();
    for (const s of simSupplies) usdBySym.set(s.symbol, s.amount * s.price);
    const assetLiqPrices = simResult.assetLiqPrices
      .map((a) => ({
        symbol: a.symbol,
        currentPrice: a.currentPrice,
        liqPrice: a.liqPrice,
        headroomPct: a.headroomPct,
        usdShare: usdBySym.get(a.symbol) ?? 0,
      }))
      .sort((a, b) => b.usdShare - a.usdShare);

    const liquidationCount = g.result.reserves.reduce((n, r) => n + r.liquidationCount, 0);
    const wasLiquidated = liquidationCount > 0;

    // Collateral-only blended LT on the chain-state basis — same formula as the
    // exposure sentence (describeCollateralExposure) so the two readouts agree.
    // Σ(collateralUsd × lt) / Σ(collateralUsd) over collateral-enabled reserves,
    // using currentSupplied when chain-patched and the same net-supply fallback
    // and LT-fallback the exposure component uses.
    let collValueUsd = 0;
    let collWeightedLtUsd = 0;
    for (const r of g.result.reserves) {
      if (!(r.collateralEnabled ?? true)) continue;
      const amount = r.currentSupplied ?? Math.max(0, r.supplied - r.withdrawn - r.liquidatedCollateral);
      if (amount <= 0) continue;
      // A USD-weighted blend can't weigh an unpriced reserve, so it is left out
      // of both sums (RULE: lib/aave-v4/unpriced.ts).
      const price = resolvePrice(r.symbol, prices);
      if (price == null) continue;
      const usd = amount * price;
      collValueUsd += usd;
      collWeightedLtUsd += usd * (r.lt ?? AAVE_V4_FALLBACK_LT);
    }
    const blendedLt = collValueUsd > 0 ? collWeightedLtUsd / collValueUsd : null;

    return {
      name: g.name,
      hub: g.hub,
      totalSupplyUsd: g.totalSupplyUsd,
      unpricedSymbols: g.unpricedSymbols,
      weightedCollateralUsd: simResult.weightedCollateralUsd,
      blendedLt,
      totalDebtUsd: g.totalDebtUsd,
      peakSupplyUsd,
      peakDebtUsd,
      collRatio: g.collRatio,
      isClosed: g.isClosed,
      eventCount: g.eventCount,
      txCount: g.txCount,
      supplyingSymbols,
      borrowingSymbols,
      latestBorrowRate: spokeBorrowRate,
      healthFactor: simResult.healthFactor,
      liqPrice,
      assetLiqPrices,
      borrowingPowerUsd: simResult.borrowCapacityUsd,
      wasLiquidated,
      endedByLiquidation: g.result.lastAction === "liquidation",
      liquidationCount,
      supplyBreakdown: computeSupplyBreakdown(simSupplies),
    };
  });
}

export function buildAaveV4SpokeCards(
  events: BaseActivityEvent[],
  eventIndexMap: Map<string, number> | undefined,
  prices: Record<string, PriceEntry | number> | undefined,
): AaveSpokeCardInfo[] {
  const groups = groupBySpoke(events, eventIndexMap, prices);
  return buildSpokeCards(groups, prices);
}

export interface LiquidationBuffer {
  /** Uniform collateral drop, as a %, that takes the spoke to a 1.0 health
   *  factor: `1 − 1/HF`. null when there's no debt / no HF. */
  dropPct: number | null;
  /** HF ≤ 1 — already liquidatable. */
  liquidatable: boolean;
  /** Present only when collateral is a SINGLE asset, where the buffer pins to a
   *  concrete liquidation price. Derived chain-state from HF (`currentPrice /
   *  HF`) — no LT table — so it can't disagree with the health factor. */
  single: { symbol: string; currentPrice: number; liqPrice: number } | null;
}

/**
 * The one coherent liquidation read for an Aave V4 spoke, derived from the
 * chain health factor — used by the position card's stat, the liquidation
 * runway, and the explanation prose so all three tell the same story.
 *
 * Health factor is Aave's own liquidation trigger (liquidates at 1.0), so the
 * universal headroom is the uniform collateral drop that reaches it: `1 − 1/HF`.
 *
 * Mode is set by how many assets are ENABLED AS COLLATERAL — the only assets a
 * liquidation can seize, and the only ones that move the health factor:
 *   • exactly one → `single` is set: we surface that asset's concrete liquidation
 *     PRICE (clearer than a %). Derived chain-state as `currentPrice / HF` — no LT
 *     table — so it can't disagree with the health factor. This also covers a
 *     position with one collateral asset plus other plain (non-collateral)
 *     supplies, since those don't back the loan or affect liquidation.
 *   • two or more → `single` is null: we show the `1 − 1/HF` percentage instead,
 *     because a single asset's solo liq price holds the others fixed and so
 *     systematically OVERSTATES safety for a correlated basket.
 *
 * Collateral-enabled is read off `assetLiqPrices`: a non-collateral supply has a
 * null `liqPrice` (the simulator returns null for assets that don't back debt).
 */
export function liquidationBuffer(spoke: AaveSpokeCardInfo): LiquidationBuffer {
  return liquidationBufferFrom(spoke.healthFactor, spoke.totalDebtUsd, spoke.assetLiqPrices);
}

/**
 * Primitive form of {@link liquidationBuffer} over the minimal inputs, so the
 * listing card (which holds a raw simulator result, not an AaveSpokeCardInfo)
 * gets identical behaviour. `assetLiqPrices` entries with a non-null `liqPrice`
 * are the collateral-enabled assets.
 */
export function liquidationBufferFrom(
  healthFactor: number | null,
  totalDebtUsd: number,
  assetLiqPrices: { symbol: string; currentPrice: number; liqPrice: number | null }[],
): LiquidationBuffer {
  if (healthFactor == null || totalDebtUsd <= 0) return { dropPct: null, liquidatable: false, single: null };
  if (healthFactor <= 1) return { dropPct: 0, liquidatable: true, single: null };

  const dropPct = (1 - 1 / healthFactor) * 100;
  const collateral = assetLiqPrices.filter((a) => a.liqPrice != null && a.currentPrice > 0);
  let single: LiquidationBuffer["single"] = null;
  if (collateral.length === 1) {
    const a = collateral[0];
    single = { symbol: a.symbol, currentPrice: a.currentPrice, liqPrice: a.currentPrice / healthFactor };
  }
  return { dropPct, liquidatable: false, single };
}
