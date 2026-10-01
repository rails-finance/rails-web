"use client";

// The Lifetime flows timeline for a PWN loan page: the loan's rows replayed
// by lib/pwn/flows.ts. A page that holds the whole history hands its rows
// over; a windowed page reads the flat history once (the read its CSV export
// makes), and a read short of the whole history is a failed read, since a
// replay of part of a history would state the wrong lifetime. PWN runs no
// oracle and is not in the shared daily price store: nothing is priced, each
// side is stated in its own token. It also gives the page the value that ties
// the panel to the timeline (components/shared/flow-focus-context.tsx).

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { PwnPositionView } from "@/components/protocol/pwn/pwn-position-card";
import { loanDeadlineAt } from "@/lib/pwn/economics";
import {
  pwnFlowEvents,
  pwnFlowFacts,
  pwnFlowReplay,
  pwnFlowTimeline,
  pwnFocusEvents,
  type PwnFlowFacts,
  type PwnFlowLoan,
  type PwnFlowReplay,
} from "@/lib/pwn/flows";

export interface PwnFlowsInput {
  /** The loan's events, when they are the whole history; null otherwise. */
  wholeEvents: BaseActivityEvent[] | null;
  /** Reads the whole flat history; null where the page has no such read. */
  fetchAll: (() => Promise<{ events: BaseActivityEvent[]; missing: number }>) | null;
  view: PwnPositionView | null;
}

/** The loan's terms as the replay reads them; null where a figure it needs
 *  is missing (no credit decimals, no creation time). */
export function pwnFlowLoan(v: PwnPositionView | null): PwnFlowLoan | null {
  if (!v || !v.credit || !v.collateral || v.createdAt == null) return null;
  if (v.credit.decimalsUnread || v.credit.decimals == null || v.collateral.decimalsUnread) return null;
  const c = v.collateral;
  const nft = c.category === "ERC721" || c.category === "ERC1155";
  return {
    loanId: v.loanId,
    version: v.version,
    createdAt: v.createdAt,
    collSymbol: c.symbol,
    // An ERC-721 is one token; the index states its amount as 0.
    collAmount: c.category === "ERC721" ? 1 : c.amount,
    collTokenId: nft ? c.tokenId : null,
    creditSymbol: v.credit.symbol,
    creditDecimals: v.credit.decimals,
    principalRaw: v.credit.amountRaw,
    repayRaw: v.repayAmountRaw,
    apr: v.accruingInterestApr,
    fixedRaw: v.fixedInterestRaw ?? null,
    deadline: loanDeadlineAt(v),
  };
}

export function usePwnFlows(p: PwnFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: PwnFlowFacts | null;
  replay: PwnFlowReplay | null;
} {
  const [fetched, setFetched] = useState<{ events: BaseActivityEvent[] | null; read: FlowsRead }>({
    events: null,
    read: "reading",
  });
  const needRead = p.wholeEvents == null;
  const { fetchAll } = p;
  useEffect(() => {
    if (!needRead) return;
    if (!fetchAll) {
      setFetched({ events: null, read: "failed" });
      return;
    }
    let cancelled = false;
    setFetched({ events: null, read: "reading" });
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

  // The page rebuilds its loan view and rows on every render: the replay
  // keys on what they state, so it runs again only when that changes.
  const source = p.wholeEvents ?? fetched.events;
  const loanNow = pwnFlowLoan(p.view);
  const loanKey = loanNow ? JSON.stringify(loanNow) : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loan = useMemo(() => loanNow, [loanKey]);
  const rowsNow = source && loan ? pwnFlowEvents(source, loan.loanId) : null;
  const rowsKey = rowsNow ? rowsNow.map((r) => `${r.id}@${r.ts}`).join("|") : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => rowsNow, [rowsKey]);

  // Set on mount, so the server's render and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now() / 1000), []);
  const replay = useMemo(
    () => (rows && loan && now != null ? pwnFlowReplay(loan, rows, { now }) : null),
    [rows, loan, now],
  );
  const timeline = useMemo(() => (replay && now != null ? pwnFlowTimeline(replay, { now }) : null), [replay, now]);
  const focusEvents = useMemo(() => (replay && timeline ? pwnFocusEvents(replay) : []), [replay, timeline]);
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), timeline);
  const facts = useMemo(() => (replay && now != null ? pwnFlowFacts(replay, now) : null), [replay, now]);
  const read: FlowsRead =
    p.wholeEvents == null && fetched.read !== "done"
      ? fetched.read
      : now == null || p.view == null
        ? "reading"
        : "done";
  return { timeline, read, focus, facts, replay };
}
