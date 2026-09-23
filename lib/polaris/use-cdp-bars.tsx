"use client";

/**
 * Per-CDP bar data for the inline collateral / debt bars under a Polaris
 * event header (the shared PositionBar, components/shared/position-bar.tsx).
 *
 * Modelled on lib/liquity/use-trove-bars.tsx but simpler: every Polaris touch
 * and liquidation row carries its resulting figures (`_newColl`, `_newDebt`)
 * and the lag columns (`collBefore`, `debtBefore`) on the row itself, so there
 * is no forward replay and no missing-state fallback. Per row, in native
 * units (pETH, the market's stablecoin):
 *
 *   coll / debt        the resulting figures
 *   collDelta / debtDelta   the WHOLE before-to-after shift (new − before),
 *                      which on Polaris includes the settled PSM share, the
 *                      interest and the reward alongside the holder's own
 *                      legs. That is what the detail grid's transition states,
 *                      so bar and grid agree.
 *   collScale / debtScale   the CDP's lifetime maxima over its rows, so a
 *                      bar reads as a share of the position at its largest.
 *
 * A transfer row gets no entry: custody moved, nothing else. The hook returns
 * null with no provider mounted, so a card rendered on its own (a per-event
 * share route) draws no bars rather than throwing.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isPolarisEvent } from "@/lib/shared/types/event-shape";
import type { PositionBarData } from "@/components/shared/position-bar";

const PolarisCdpBarsContext = createContext<Map<string, PositionBarData> | null>(null);

const num = (s?: string): number | null => {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export function buildPolarisBarMap(events: BaseActivityEvent[]): Map<string, PositionBarData> {
  const map = new Map<string, PositionBarData>();
  type Row = { id: string; coll: number; debt: number; collDelta: number; debtDelta: number };
  const rows: Row[] = [];
  let collScale = 0;
  let debtScale = 0;
  for (const e of events) {
    if (!isPolarisEvent(e)) continue;
    const d = e.context.data;
    if (d.eventType === "transfer") continue;
    const coll = num(d.newColl);
    const debt = num(d.newDebt);
    if (coll == null || debt == null) continue;
    const collBefore = num(d.collBefore) ?? 0;
    const debtBefore = num(d.debtBefore) ?? 0;
    rows.push({ id: e.id, coll, debt, collDelta: coll - collBefore, debtDelta: debt - debtBefore });
    if (coll > collScale) collScale = coll;
    if (debt > debtScale) debtScale = debt;
  }
  if (collScale <= 0 && debtScale <= 0) return map;
  for (const r of rows)
    map.set(r.id, {
      coll: r.coll,
      debt: r.debt,
      collDelta: r.collDelta,
      debtDelta: r.debtDelta,
      collScale,
      debtScale,
    });
  return map;
}

export function PolarisCdpBarsProvider({ events, children }: { events: BaseActivityEvent[]; children: ReactNode }) {
  const map = useMemo(() => buildPolarisBarMap(events), [events]);
  return <PolarisCdpBarsContext.Provider value={map}>{children}</PolarisCdpBarsContext.Provider>;
}

export function usePolarisCdpBars(eventId: string): PositionBarData | null {
  const map = useContext(PolarisCdpBarsContext);
  if (!map) return null;
  return map.get(eventId) ?? null;
}
