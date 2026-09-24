// ============================================================================
// Chain-state overrides for Aave V4 spoke card + per-reserve stats
// ============================================================================
//
// The detail page's economics band (tower chart + runway stack + headline
// card) historically derived "current state" from the event-indexed running
// balances in ReserveStats. That math is sound but the inputs aren't — our
// indexer misses events that go through swap-aggregator wrappers, so the
// running balances can drift 10%+ from actual on-chain state. That drift
// flipped one wallet's listing HF from 1.02 (safe) to 0.98 (underwater) in
// the detail UI, contradicting both Aave's site and our own listing page.
//
// This module patches those derived numbers with the live chain state
// fetched from the spoke contract. History-derived fields (peakDebt,
// debtSeries, flowEvents, eventCount) are left intact — they describe what
// happened, not what's true now.

import type { AaveSpokeCardInfo, ReserveStats } from "./spoke-cards";
import type { AaveV4SpokePositionChainResponse } from "@/lib/api/fetch-aave-v4-spoke-position";
import { scaleChainBalance } from "@/lib/api/fetch-aave-v4-spoke-position";
import { calculateAaveV4Position, computeSupplyBreakdown, type CalcPositionInputs } from "./utils/position-calculation";
import { resolvePrice, type PriceEntry } from "@/lib/aave/prices";
import { pricesHaveLoaded } from "@/lib/aave-v4/unpriced";

/** Patch a ReserveStats[] so each row carries the chain-state current
 *  balance alongside the event-derived lifetime fields. Lifetime
 *  `supplied`/`withdrawn`/`borrowed`/`repaid` are preserved — the historical
 *  tower chart needs them to render the Deposited/Borrowed side-bars and
 *  the lifetime breakdown rows. Current state is exposed as `currentSupplied`
 *  / `currentBorrowed`, which consumers should prefer when computing
 *  what's-active-now.
 *
 *  Reserves that exist on chain but not in the event history (e.g. a new
 *  asset the wallet never moved in our indexer) are appended as minimal
 *  rows. Reserves in event history with no chain presence are kept (so
 *  history-only displays still see them) and their current balances are
 *  pinned to 0. */
export function patchReservesWithChain(
  reserves: ReserveStats[],
  chain: AaveV4SpokePositionChainResponse,
): ReserveStats[] {
  // Address lookup for ReserveStats by symbol. ReserveStats doesn't carry
  // address, so we resolve via the chain map (symbol → address). When a
  // symbol appears once in chain that's the only candidate; if it doesn't
  // appear at all we leave the existing event-derived numbers alone (with
  // a hint that they may be stale).
  const chainBySymbol = new Map<string, (typeof chain.reserves)[number]>();
  for (const r of chain.reserves) {
    if (!chainBySymbol.has(r.symbol)) chainBySymbol.set(r.symbol, r);
  }

  const seenChainAddrs = new Set<string>();
  const patched: ReserveStats[] = reserves.map((r) => {
    const c = chainBySymbol.get(r.symbol);
    if (!c) {
      // No chain row for this symbol → wallet has no current position in it
      // (or the symbol just doesn't exist on this spoke). Pin current state
      // to 0; keep lifetime history intact.
      return { ...r, currentSupplied: 0, currentBorrowed: 0 };
    }
    seenChainAddrs.add(c.address);
    return {
      ...r,
      currentSupplied: scaleChainBalance(c.supplyBalanceRaw, c.decimals),
      currentBorrowed: scaleChainBalance(c.debtBalanceRaw, c.decimals),
      collateralEnabled: c.isCollateral,
      lt: c.lt ?? undefined,
    };
  });

  // Append chain rows that the event history didn't know about. Common when
  // the indexer is behind on a brand-new reserve. Lifetime fields stay 0
  // since we never saw the supply/borrow events.
  for (const c of chain.reserves) {
    if (seenChainAddrs.has(c.address)) continue;
    const live = scaleChainBalance(c.supplyBalanceRaw, c.decimals);
    const debt = scaleChainBalance(c.debtBalanceRaw, c.decimals);
    if (live <= 0 && debt <= 0) continue;
    patched.push({
      symbol: c.symbol,
      supplied: 0,
      withdrawn: 0,
      borrowed: 0,
      repaid: 0,
      liquidatedDebt: 0,
      liquidatedCollateral: 0,
      liquidationCount: 0,
      eventCount: 0,
      collateralEnabled: c.isCollateral,
      debtSeries: [],
      peakDebt: 0,
      peakDebtTimestamp: 0,
      peakSupply: 0,
      flowEvents: [],
      withdrawnUsd: 0,
      repaidUsd: 0,
      liquidatedDebtUsd: 0,
      liquidatedCollateralUsd: 0,
      currentSupplied: live,
      currentBorrowed: debt,
      lt: c.lt ?? undefined,
    });
  }

  return patched;
}

/** Build a new `AaveSpokeCardInfo` whose headline numbers (HF, supply USD,
 *  debt USD, liq price, borrow power, asset liq prices, current symbols)
 *  come from the chain. History-only fields are passed through from the
 *  event-derived card. */
export function patchSpokeCardWithChain(
  card: AaveSpokeCardInfo,
  chain: AaveV4SpokePositionChainResponse,
  prices: Record<string, PriceEntry | number>,
): AaveSpokeCardInfo {
  // Build the calculation's inputs from chain reserves so per-asset liq prices use
  // the same balances Aave would. A reserve no source prices enters at zero:
  // that is the only weight a USD calculation can give a leg it cannot value.
  // Its name rides on `unpricedSymbols` below, so the totals can say they are
  // short of it.
  const calcInputs: CalcPositionInputs = {
    supplies: chain.reserves
      .filter((r) => scaleChainBalance(r.supplyBalanceRaw, r.decimals) > 0)
      .map((r) => ({
        symbol: r.symbol,
        amount: scaleChainBalance(r.supplyBalanceRaw, r.decimals),
        price: resolvePrice(r.symbol, prices) ?? 0,
        lt: r.lt ?? 0,
        collateralEnabled: r.isCollateral,
      })),
    debts: chain.reserves
      .filter((r) => scaleChainBalance(r.debtBalanceRaw, r.decimals) > 0)
      .map((r) => ({
        symbol: r.symbol,
        amount: scaleChainBalance(r.debtBalanceRaw, r.decimals),
        price: resolvePrice(r.symbol, prices) ?? 0,
      })),
  };
  const calc = calculateAaveV4Position(calcInputs);

  // Symbol lists from chain. supplyingSymbols = currently-active supplies
  // (positive balance), borrowingSymbols = currently-active debts.
  const supplyingSymbols = calcInputs.supplies.map((s) => s.symbol);
  const borrowingSymbols = calcInputs.debts.map((d) => d.symbol);

  // Dominant-collateral liq price = the largest USD supply with a valid
  // calculated liq price. Matches what the listing/detail headline expects.
  let liqPrice: AaveSpokeCardInfo["liqPrice"] = null;
  if (calc.totalDebtUsd > 0) {
    const withShare = calcInputs.supplies
      .map((s, i) => {
        const usd = s.amount * s.price;
        const lp = calc.assetLiqPrices[i];
        return { s, usd, lp };
      })
      .filter((x) => x.lp?.liqPrice != null && x.lp.liqPrice > 0)
      .sort((a, b) => b.usd - a.usd);
    if (withShare.length > 0) {
      const top = withShare[0];
      liqPrice = {
        symbol: top.s.symbol,
        currentPrice: top.s.price,
        liqPrice: top.lp.liqPrice!,
        headroomPct: top.lp.headroomPct ?? 0,
      };
    }
  }

  // Per-asset liq prices array, sorted by USD share desc, with addresses
  // resolved from the chain reserve list.
  const addrLookup = new Map<string, string>();
  for (const r of chain.reserves) addrLookup.set(r.symbol, r.address);
  const assetLiqPrices = calcInputs.supplies
    .map((s, i) => {
      const usd = s.amount * s.price;
      const totalSupplyUsd = calc.totalCollateralUsd || 1;
      return {
        symbol: s.symbol,
        address: addrLookup.get(s.symbol),
        currentPrice: s.price,
        liqPrice: calc.assetLiqPrices[i]?.liqPrice ?? null,
        headroomPct: calc.assetLiqPrices[i]?.headroomPct ?? null,
        usdShare: (usd / totalSupplyUsd) * 100,
      };
    })
    .sort((a, b) => b.usdShare - a.usdShare);

  // Use the chain's HF directly (not calc.healthFactor) — they should match
  // when inputs align, but chain HF includes V4-specific accounting (risk
  // premium, premium-shares, etc.) the calculation leaves out.
  const healthFactor = chain.healthFactor;

  // Recompute the collateral-only blended LT from the SAME chain LTs the liq
  // price and weighted collateral now use — Σ(collateralUsd × lt) / Σ(collateral
  // Usd) over collateral-enabled reserves. Without this it would stay the stale
  // event-derived value (the conservative 0.70 fallback when the indexer carried
  // no LT), so the exposure footnote ("…% blended liquidation threshold") would
  // contradict the chain-LT liq price shown alongside it. Falls back to the
  // event card's value only when there's no priced collateral to blend.
  let collValueUsd = 0;
  let collWeightedLtUsd = 0;
  for (const s of calcInputs.supplies) {
    if (!s.collateralEnabled || s.lt <= 0) continue;
    const usd = s.amount * s.price;
    collValueUsd += usd;
    collWeightedLtUsd += usd * s.lt;
  }
  const blendedLt = collValueUsd > 0 ? collWeightedLtUsd / collValueUsd : card.blendedLt;

  // RULE: Rails never invents a price (lib/aave-v4/unpriced.ts). A reserve with
  // no price source enters the calculation at zero — it keeps its place in the symbol
  // rows, because holding it is a fact of the chain read, and adds no dollars
  // to any total. Recomputed here on the chain basis (the event-derived list on
  // `card` was drawn from a different reserve set) so a surface printing one of
  // these totals can say it is partial and name what is missing.
  const unpricedSymbols = [
    ...new Set(
      (pricesHaveLoaded(prices) ? chain.reserves : [])
        .filter(
          (r) =>
            (scaleChainBalance(r.supplyBalanceRaw, r.decimals) > 0 ||
              scaleChainBalance(r.debtBalanceRaw, r.decimals) > 0) &&
            resolvePrice(r.symbol, prices) == null,
        )
        .map((r) => r.symbol),
    ),
  ];

  return {
    ...card,
    unpricedSymbols,
    totalSupplyUsd: calc.totalCollateralUsd,
    weightedCollateralUsd: calc.weightedCollateralUsd,
    blendedLt,
    totalDebtUsd: calc.totalDebtUsd,
    collRatio: calc.totalDebtUsd > 0 ? calc.totalCollateralUsd / calc.totalDebtUsd : null,
    supplyingSymbols,
    borrowingSymbols,
    healthFactor,
    liqPrice,
    assetLiqPrices,
    borrowingPowerUsd: calc.borrowCapacityUsd,
    supplyBreakdown: computeSupplyBreakdown(calcInputs.supplies),
    // Closed-position heuristic: chain says no supply AND no debt.
    isClosed: calcInputs.supplies.length === 0 && calcInputs.debts.length === 0,
  };
}
