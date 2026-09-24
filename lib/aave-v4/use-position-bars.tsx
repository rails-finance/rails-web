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
 *
 * RULE: Rails never invents a price (lib/aave-v4/unpriced.ts). A holding with
 * no price joins neither the bar nor its scale; its symbol rides along in
 * `unpriced` so the slot can say the bar leaves it out.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AaveV4Context, BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAaveV4Event } from "@/lib/shared/types/event-shape";
import type { PositionBarData } from "@/components/shared/position-bar";
import { resolvePrice, type PriceEntry } from "@/lib/aave/prices";
import { usePrices } from "@/lib/shared/prices-context";
import { pricesHaveLoaded, UNPRICED_DUST_TOKENS } from "@/lib/aave-v4/unpriced";

export interface AaveV4BarData extends PositionBarData {
  /** Holdings each side's bar leaves out because no price source covers them.
   *  Named only once the live price map has answered; before that a leg with
   *  no historic price is pending, not missing. */
  unpriced: { coll: string[]; debt: string[] };
}

const AaveV4BarsContext = createContext<Map<string, AaveV4BarData> | null>(null);

/** The event's primary price for its changed asset (`price`, or a
 *  liquidation's `collateralPrice` / `debtPrice`): the same fallback the
 *  detail panel's rows use when a row's own historic price is absent, so the
 *  bar and the card above it price a leg the same way. */
function primaryPrice(d: AaveV4Context, symbol: string): number | undefined {
  if (d.eventType === "liquidation") {
    if (symbol === d.collateralSymbol) return d.collateralPrice?.usd;
    if (symbol === d.reserveSymbol) return d.debtPrice?.usd;
    return undefined;
  }
  return symbol === d.reserveSymbol ? d.price?.usd : undefined;
}

function usdTotal(
  entries: { symbol: string; amount: string; price?: { usd: number } }[] | undefined,
  d: AaveV4Context,
  prices: Record<string, PriceEntry | number> | undefined,
  mapAnswered: boolean,
): { usd: number; excluded: string[] } {
  const out = { usd: 0, excluded: [] as string[] };
  if (!entries) return out;
  for (const e of entries) {
    const amt = parseFloat(e.amount);
    if (!isFinite(amt) || amt <= 0) continue;
    // Prefer the per-row historic price (block-anchored) when the server
    // shipped one, then the event's primary price for the changed asset; the
    // live map stands in for a legacy payload without either.
    const price = e.price?.usd ?? primaryPrice(d, e.symbol) ?? resolvePrice(e.symbol, prices);
    if (price != null) out.usd += amt * price;
    else if (mapAnswered && amt > UNPRICED_DUST_TOKENS) out.excluded.push(e.symbol);
  }
  return out;
}

function buildBarMap(
  events: BaseActivityEvent[],
  prices?: Record<string, PriceEntry | number>,
): Map<string, AaveV4BarData> {
  const map = new Map<string, AaveV4BarData>();
  const mapAnswered = pricesHaveLoaded(prices);

  // Group by spoke. Each spoke is an independent position — scale + running
  // totals are computed per-spoke so a large position on one spoke doesn't
  // wash out bar readings on a smaller one.
  type Row = BaseActivityEvent & { _coll: number; _debt: number; _unpriced: AaveV4BarData["unpriced"] };
  const bySpoke = new Map<string, Row[]>();
  for (const e of events) {
    if (!isAaveV4Event(e)) continue;
    const spoke = e.context.data.spokeName ?? "Main";
    const coll = usdTotal(e.context.data.allSupplies, e.context.data, prices, mapAnswered);
    const debt = usdTotal(e.context.data.allDebts, e.context.data, prices, mapAnswered);
    const row = Object.assign({}, e, {
      _coll: coll.usd,
      _debt: debt.usd,
      _unpriced: { coll: coll.excluded, debt: debt.excluded },
    });
    const arr = bySpoke.get(spoke) ?? [];
    arr.push(row);
    bySpoke.set(spoke, arr);
  }

  for (const [, spokeEvents] of bySpoke) {
    spokeEvents.sort((a, b) => a.blockNumber - b.blockNumber || a.timestamp - b.timestamp);

    let collScale = 0;
    let debtScale = 0;
    let anyUnpriced = false;
    for (const s of spokeEvents) {
      if (s._coll > collScale) collScale = s._coll;
      if (s._debt > debtScale) debtScale = s._debt;
      if (s._unpriced.coll.length > 0 || s._unpriced.debt.length > 0) anyUnpriced = true;
    }
    // A spoke with nothing priced draws no bars, unless something was left
    // out: then the empty bars stand with the statement of what is missing.
    if (collScale <= 0 && debtScale <= 0 && !anyUnpriced) continue;

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
        unpriced: s._unpriced,
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

export function useAaveV4Bars(eventId: string): AaveV4BarData | null {
  const map = useContext(AaveV4BarsContext);
  if (!map) return null;
  return map.get(eventId) ?? null;
}
