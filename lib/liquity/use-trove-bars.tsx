"use client";

/**
 * Per-trove bar data for the inline collateral/debt bars in event card headers.
 *
 * Walks the event list, groups by trove, and for every event that mutates the
 * position emits the current and previous state in **native units** (collateral
 * in ETH/wstETH/rETH, debt in BOLD), plus a per-bar scale = the trove's
 * lifetime peak across all events. Native units are used because we don't have
 * historical-price-at-block enrichment yet — switching to USD with a shared
 * scale would need that threaded in upstream.
 *
 * Bars are emitted for redemption and liquidation events too: from the
 * trove's own POV, a redemption shifts the position just as much as the
 * owner's own action. Rate-only operations (setBatchManagerAnnualInterestRate,
 * adjustTroveInterestRate that doesn't move money) carry zero deltas and so
 * render with a single underlying balance bar — the change bar collapses to
 * empty, which itself communicates "nothing moved here".
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { BaseActivityEvent } from "@/lib/shared/types/activity";
import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import { FORK_ALL_IDS } from "@/lib/shared/fork-config";
import type { PositionBarData } from "@/components/shared/position-bar";

const LiquityTroveBarsContext = createContext<Map<string, PositionBarData> | null>(null);

type LiquityTroveEvent = BaseActivityEvent & {
  context: { protocol: string; data: LiquityContext };
};

function isLiquityTroveEvent(e: BaseActivityEvent): e is LiquityTroveEvent {
  const p = e.context?.protocol;
  if (p !== "liquity-v2-troves" && !FORK_ALL_IDS.has(p as string)) return false;
  return !!e.context?.data && typeof (e.context.data as LiquityContext).troveId === "string";
}

function buildBarMap(events: BaseActivityEvent[]): Map<string, PositionBarData> {
  const map = new Map<string, PositionBarData>();

  // Group by (protocol, troveId) — fork troves can collide on troveId across protocols
  const byTrove = new Map<string, LiquityTroveEvent[]>();
  for (const e of events) {
    if (!isLiquityTroveEvent(e)) continue;
    const key = `${e.context.protocol}:${e.context.data.troveId}`;
    let arr = byTrove.get(key);
    if (!arr) {
      arr = [];
      byTrove.set(key, arr);
    }
    arr.push(e);
  }

  for (const [, troveEvents] of byTrove) {
    troveEvents.sort((a, b) => a.blockNumber - b.blockNumber || a.timestamp - b.timestamp);

    // Walk chronologically and resolve each event's post-state. The Sieve
    // loader populates stateAfter from a TroveUpdated snapshot lookup, but
    // some events fall through to ZERO_STATE when neither the snapshot nor
    // the loader's synthetic reconstruction catches them. We derive forward
    // by applying troveOperation deltas to a running tally — this matches
    // what the loader does internally and gives correct bars even when the
    // snapshot data is missing.
    type StateRow = { id: string; coll: number; debt: number; debtFromOp: number | null };
    const states: StateRow[] = [];
    let collScale = 0;
    let debtScale = 0;
    let runningColl = 0;
    let runningDebt = 0;
    for (const e of troveEvents) {
      const ctx = e.context.data;
      const isClose = ctx.operation === "closeTrove" || ctx.operation === "liquidate";

      let coll = ctx.stateAfter?.coll ?? 0;
      let debt = ctx.stateAfter?.debt ?? 0;
      const stateLooksMissing = coll === 0 && debt === 0 && !isClose;

      if (stateLooksMissing) {
        // Re-derive from running state + this event's deltas
        const op = ctx.troveOperation;
        if (op) {
          coll = Math.max(0, runningColl + (op.collChangeFromOperation || 0) + (op.collIncreaseFromRedist || 0));
          debt = Math.max(
            0,
            runningDebt +
              (op.debtChangeFromOperation || 0) +
              (op.debtIncreaseFromRedist || 0) +
              (op.debtIncreaseFromUpfrontFee || 0),
          );
        } else {
          // No operation deltas (e.g. rate-only adjustment) — carry forward
          coll = runningColl;
          debt = runningDebt;
        }
      } else if (isClose) {
        coll = 0;
        debt = 0;
      }

      // Operation-level debt delta (excludes passive interest accrual). For
      // redemption/liquidation events the transformer populates this with
      // the redeemed/seized amount, so the change bar tracks how much of
      // the position the third-party action actually shifted.
      const debtFromOp = ctx.troveOperation?.debtChangeFromOperation ?? null;

      states.push({ id: e.id, coll, debt, debtFromOp });
      runningColl = coll;
      runningDebt = debt;

      if (coll > collScale) collScale = coll;
      if (debt > debtScale) debtScale = debt;
    }

    if (collScale <= 0 && debtScale <= 0) continue;

    // Walk forward, emitting bars for every event. The collDelta is the
    // signed shift from the prior event's coll; the debtDelta uses the
    // operation-level value when available (falls back to the running diff
    // for events without troveOperation).
    let prevColl = 0;
    let prevDebt = 0;
    for (const s of states) {
      const debtDelta = s.debtFromOp ?? s.debt - prevDebt;
      map.set(s.id, {
        coll: s.coll,
        debt: s.debt,
        collDelta: s.coll - prevColl,
        debtDelta,
        collScale,
        debtScale,
      });
      prevColl = s.coll;
      prevDebt = s.debt;
    }
  }

  return map;
}

export function LiquityTroveBarsProvider({ events, children }: { events: BaseActivityEvent[]; children: ReactNode }) {
  const map = useMemo(() => buildBarMap(events), [events]);
  return <LiquityTroveBarsContext.Provider value={map}>{children}</LiquityTroveBarsContext.Provider>;
}

export function useLiquityTroveBars(eventId: string): PositionBarData | null {
  const map = useContext(LiquityTroveBarsContext);
  if (!map) return null;
  return map.get(eventId) ?? null;
}
