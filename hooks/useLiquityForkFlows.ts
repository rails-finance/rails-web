"use client";

// The Lifetime flows timeline for a Liquity V2 fork's Trove page (Ebisu,
// Asymmetry, Basedollar): the Trove's whole history replayed by
// lib/shared/liquity-flows.ts. A page that holds the whole history as events
// hands them over; a windowed or folder-served page reads the flat history
// once (the same read its CSV export makes), and a read the index's row
// ceiling cut short is a failed read, since a replay of part of a history
// would state the wrong lifetime. It also gives the page the value that ties
// the panel to the timeline (components/shared/flow-focus-context.tsx): the
// day's mark, Apply to timeline and each card's sum read the same replay.

import { forkMcrChanges } from "@/lib/shared/liquity-fork-changes";
import { withChanges } from "@/lib/shared/flows-changes";
import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import type { LiquityForkTroveChainResponse } from "@/lib/api/fetch-liquity-fork-position";
import {
  liquityFlowTimeline,
  liquityFocusEvents,
  liquityForkFlowEvents,
  type LiquityFlowEvent,
  type LiquityForkLevel,
} from "@/lib/shared/liquity-flows";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { PaceSource } from "@/lib/liquity-v2/redemption-pace";
import { useRedemptionPace } from "@/hooks/useRedemptionPace";

export interface LiquityForkFlowsInput {
  /** The page's events, when they are the whole history; null otherwise. */
  wholeEvents: BaseActivityEvent[] | null;
  /** Reads the whole flat history (the export's read). */
  fetchAll: () => Promise<{ events: BaseActivityEvent[]; missing: number }>;
  is: (e: BaseActivityEvent) => boolean;
  collSymbol: string | null;
  debtSymbol: string;
  open: boolean;
  chain: LiquityForkTroveChainResponse | null;
  /** The listing's branch price, where the live read has none. */
  price: number | null;
  surplusClaimed: boolean;
  /** The branch's minimum for the price view's level (ui-jobs 328 step 6);
   *  null leaves the price alone. */
  fork: LiquityForkLevel | null;
  /** The branch's redemptions per day, the protocol activity chart under the
   *  events (lib/liquity-v2/redemption-pace.ts); null draws none. */
  pace?: PaceSource | null;
}

export function useLiquityForkFlows(p: LiquityForkFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  events: LiquityFlowEvent[];
  focus: FlowFocusValue;
} {
  const [fetched, setFetched] = useState<{ events: BaseActivityEvent[] | null; read: FlowsRead }>({
    events: null,
    read: "reading",
  });
  const needRead = p.wholeEvents == null;
  const { fetchAll } = p;
  useEffect(() => {
    if (!needRead) return;
    let cancelled = false;
    fetchAll()
      .then(({ events, missing }) => {
        if (!cancelled) setFetched(missing > 0 ? { events: null, read: "failed" } : { events, read: "done" });
      })
      .catch((err) => {
        console.warn("Lifetime flows history not read:", err);
        if (!cancelled) setFetched({ events: null, read: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [needRead, fetchAll]);

  const source = p.wholeEvents ?? fetched.events;
  const { is } = p;
  const events = useMemo(() => (source ? liquityForkFlowEvents(source, is) : []), [source, is]);
  // Set on mount, so the server's render and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now() / 1000), []);
  const chain = p.chain;
  const livePrice = chain?.priceUsd ?? p.price ?? null;
  const baseTimeline = useMemo(() => {
    if (now == null || !p.collSymbol || events.length === 0) return null;
    return liquityFlowTimeline(events, {
      collSymbol: p.collSymbol,
      debtSymbol: p.debtSymbol,
      surplusClaimed: p.surplusClaimed,
      now,
      ...(p.fork ? { priceView: { collateralType: p.collSymbol, fork: p.fork } } : {}),
      live: p.open
        ? {
            price: livePrice,
            ...(chain
              ? {
                  coll: chain.entireColl,
                  debt: chain.entireDebt,
                  accruedInterest: chain.accruedInterest,
                  batchFee: chain.accruedBatchManagementFee,
                  redistColl: chain.redistCollGain,
                  redistDebt: chain.redistDebtGain,
                }
              : {}),
          }
        : null,
    });
  }, [events, p.collSymbol, p.debtSymbol, p.surplusClaimed, now, p.open, livePrice, chain, p.fork]);
  // The minimum's steps, marked on the events row (ruling 10).
  const changes = useMemo(() => (p.fork ? forkMcrChanges(p.fork) : []), [p.fork]);
  const changed = useMemo(() => withChanges(baseTimeline, changes), [baseTimeline, changes]);
  // The branch's redemptions over the life: to today, or to the close. The
  // chart starts shown where a redemption reached this Trove.
  const lifeDays = changed?.days;
  const pace = useRedemptionPace(
    p.pace ?? null,
    lifeDays?.length ? lifeDays[0].day : null,
    lifeDays?.length && now != null ? (p.open ? Math.floor(now / 86_400) : lifeDays[lifeDays.length - 1].day) : null,
  );
  const redeemed = events.some((e) => e.kind === "redemption");
  const timeline = useMemo(
    () => (changed && pace ? { ...changed, activity: { ...pace, explains: redeemed } } : changed),
    [changed, pace, redeemed],
  );
  const focusEvents = useMemo(
    () => (p.collSymbol ? liquityFocusEvents(events, p.collSymbol, p.debtSymbol) : []),
    [events, p.collSymbol, p.debtSymbol],
  );
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), timeline);
  return { timeline, read: now == null ? "reading" : p.wholeEvents != null ? "done" : fetched.read, events, focus };
}
