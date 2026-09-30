"use client";

// The Lifetime flows timeline for a Liquity V2 fork's Trove page (Ebisu,
// Asymmetry, Basedollar): the Trove's whole history replayed by
// lib/shared/liquity-flows.ts. A page that holds the whole history as events
// hands them over; a windowed or folder-served page reads the flat history
// once (the same read its CSV export makes), and a read the index's row
// ceiling cut short is a failed read, since a replay of part of a history
// would state the wrong lifetime.

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import type { LiquityForkTroveChainResponse } from "@/lib/api/fetch-liquity-fork-position";
import { liquityFlowTimeline, liquityForkFlowEvents, type LiquityFlowEvent } from "@/lib/shared/liquity-flows";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";

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
}

export function useLiquityForkFlows(p: LiquityForkFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  events: LiquityFlowEvent[];
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
  const [now] = useState(() => Date.now() / 1000);
  const chain = p.chain;
  const livePrice = chain?.priceUsd ?? p.price ?? null;
  const timeline = useMemo(() => {
    if (!p.collSymbol || events.length === 0) return null;
    return liquityFlowTimeline(events, {
      collSymbol: p.collSymbol,
      debtSymbol: p.debtSymbol,
      surplusClaimed: p.surplusClaimed,
      now,
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
  }, [events, p.collSymbol, p.debtSymbol, p.surplusClaimed, now, p.open, livePrice, chain]);
  return { timeline, read: p.wholeEvents != null ? "done" : fetched.read, events };
}
