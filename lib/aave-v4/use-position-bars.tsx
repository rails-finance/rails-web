"use client";

/**
 * Per-spoke bar data for the inline collateral/debt bars under Aave V4 event
 * headers. Aave V4 positions are multi-asset (multiple supply reserves and
 * multiple debt reserves per spoke), so `coll`/`debt` are USD totals
 * aggregated from the event's `allSupplies`/`allDebts` snapshots via the
 * prices map. Scale is the spoke's lifetime peak (max of coll and debt USD
 * values seen across the wallet's own events in that spoke).
 *
 * Relies on the `isAaveV4Event` discriminator and `resolvePrice` semantics.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAaveV4Event } from "@/lib/shared/types/event-shape";
import type { PositionBarData } from "@/components/shared/position-bar";
import { resolvePrice, type PriceEntry } from "@/lib/aave/prices";
import { usePrices } from "@/lib/shared/prices-context";

const AaveV4BarsContext = createContext<Map<string, PositionBarData> | null>(null);

function usdTotal(
  entries: { symbol: string; amount: string; price?: { usd: number } }[] | undefined,
  prices?: Record<string, PriceEntry | number>,
): number {
  if (!entries) return 0;
  let sum = 0;
  for (const e of entries) {
    const amt = parseFloat(e.amount);
    if (!isFinite(amt) || amt <= 0) continue;
    // Prefer the per-row historic price (block-anchored) when the server
    // shipped one. Fall back to the global prices map so legacy payloads
    // and any reserve outside the categorical allowlist still contribute
    // something — better an approximate scale than a flat zero.
    const price = e.price?.usd ?? resolvePrice(e.symbol, prices) ?? 0;
    sum += amt * price;
  }
  return sum;
}

function buildBarMap(
  events: BaseActivityEvent[],
  prices?: Record<string, PriceEntry | number>,
): Map<string, PositionBarData> {
  const map = new Map<string, PositionBarData>();

  // Group by spoke. Each spoke is an independent position — scale + running
  // totals are computed per-spoke so a large position on one spoke doesn't
  // wash out bar readings on a smaller one.
  const bySpoke = new Map<string, (BaseActivityEvent & { _coll: number; _debt: number })[]>();
  for (const e of events) {
    if (!isAaveV4Event(e)) continue;
    const spoke = e.context.data.spokeName ?? "Main";
    const coll = usdTotal(e.context.data.allSupplies, prices);
    const debt = usdTotal(e.context.data.allDebts, prices);
    const row = Object.assign({}, e, { _coll: coll, _debt: debt });
    const arr = bySpoke.get(spoke) ?? [];
    arr.push(row);
    bySpoke.set(spoke, arr);
  }

  for (const [, spokeEvents] of bySpoke) {
    spokeEvents.sort((a, b) => a.blockNumber - b.blockNumber || a.timestamp - b.timestamp);

    let collScale = 0;
    let debtScale = 0;
    for (const s of spokeEvents) {
      if (s._coll > collScale) collScale = s._coll;
      if (s._debt > debtScale) debtScale = s._debt;
    }
    if (collScale <= 0 && debtScale <= 0) continue;

    let prevColl = 0;
    let prevDebt = 0;
    for (const s of spokeEvents) {
      map.set(s.id, {
        coll: s._coll,
        debt: s._debt,
        collDelta: s._coll - prevColl,
        debtDelta: s._debt - prevDebt,
        collScale,
        debtScale,
      });
      prevColl = s._coll;
      prevDebt = s._debt;
    }
  }

  return map;
}

export function AaveV4BarsProvider({ events, children }: { events: BaseActivityEvent[]; children: ReactNode }) {
  const prices = usePrices();
  const map = useMemo(() => buildBarMap(events, prices), [events, prices]);
  return <AaveV4BarsContext.Provider value={map}>{children}</AaveV4BarsContext.Provider>;
}

export function useAaveV4Bars(eventId: string): PositionBarData | null {
  const map = useContext(AaveV4BarsContext);
  if (!map) return null;
  return map.get(eventId) ?? null;
}
