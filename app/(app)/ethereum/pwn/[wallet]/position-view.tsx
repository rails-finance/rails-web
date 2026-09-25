"use client";

// PWN loan detail — a Tier 1 (chain-state) explorer: one view, the chain's own
// values. PWN's fixed interest (repay − principal) is a one-step
// chain-derived value over two on-chain loan terms.
// Per-value provenance lives with the page-level inspector (the per-card
// receipts pane retired in its favour). A PWN "position" is one
// discrete loan, so this page shows exactly ONE loan — the ?loan= id if present,
// else the wallet's most recent — with its principal/interest economics and the
// timeline sliced to that loan's own events. A wallet can be a party (lender OR
// borrower) to several loans; those are separate positions, each its own card on
// the /pwn listing. Everything replayed from the PWN events.

import { useCallback, useEffect, useMemo, useState } from "react";
import { INDEX_ROW_CEILING } from "@/lib/shared/timeline-row-ceiling";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isPwnEvent } from "@/lib/shared/types/event-shape";
import { fetchPwnPositions } from "@/lib/api/fetch-pwn-positions";
import { fetchPwnTimeline } from "@/lib/api/fetch-pwn-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import {
  TIMELINE_WINDOW_EVENTS,
  WHOLE_HISTORY,
  lifetimeFiguresKnown,
  type TimelineOpeningBalance,
  type TimelineWindow,
} from "@/lib/shared/timeline-opening-balance";
import { fetchPwnBundleContents, type PwnBundleAsset } from "@/lib/api/fetch-pwn-bundle";
import { isPwnBundler } from "@/lib/pwn/asset-catalog";
import type { PwnPositionSummary } from "@/lib/sources/api/pwn-positions";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { groupEventsByTx } from "@/lib/shared/explainer-prose";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { PwnEventCard } from "@/components/protocol/pwn/pwn-event-card";
import { PwnPositionCard, viewFromSummary } from "@/components/protocol/pwn/pwn-position-card";
import { PwnPositionExplanation } from "@/components/protocol/pwn/pwn-position-explanation";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { computePwnEconomics } from "@/lib/pwn/economics";
import { pwnEconomicsExplanation, pwnEconomicsContent } from "@/lib/pwn/economics-explanation";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle.
const PwnExportMenu = dynamic(() => import("@/components/protocol/pwn/pwn-export-menu").then((m) => m.PwnExportMenu), {
  ssr: false,
});

interface PwnLoanViewProps {
  /** Already lower-cased and address-shaped — the server route rejected
   *  anything else with a 404 before this component existed. */
  wallet: string;
  /** `?loan=`, decoded on the server so the document renders the loan the URL
   *  names rather than the latest one and then swapping after hydration. */
  loanParam: string | null;
  /** Every loan this wallet is a party to. `null` means the server could not
   *  seed the tail — see lib/pwn/position-page-data.ts for the one case where
   *  it deliberately does not. */
  initialSummaries: PwnPositionSummary[] | null;
  initialEvents: BaseActivityEvent[] | null;
  initialCutoffBlock: number | null;
  initialOpening: TimelineOpeningBalance | null;
}

export default function PwnLoanView({
  wallet,
  loanParam,
  initialSummaries,
  initialEvents,
  initialCutoffBlock,
  initialOpening,
}: PwnLoanViewProps) {
  // Keyed on the timeline, not the roster: a wallet party to no PWN loan is a
  // real answer the server can seed, and its `initialSummaries` is empty.
  const seeded = initialEvents != null;
  const [summaries, setSummaries] = useState<PwnPositionSummary[]>(initialSummaries ?? []);
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  // The checkpoint model. The timeline fetch asks for a WINDOW of the wallet's
  // most recent events; the response names the block the window opened at, and
  // everything below it arrives as a declared opening balance from the
  // /summary twin. PWN's deepest wallet today holds a few dozen events — far
  // under TIMELINE_WINDOW_EVENTS — so `cutoffBlock` comes back null and this
  // page reads exactly as it did before for every real position.
  const [cutoffBlock, setCutoffBlock] = useState<number | null>(initialCutoffBlock);
  const [opening, setOpening] = useState<TimelineOpeningBalance | null>(initialOpening);
  const [openingFailed, setOpeningFailed] = useState(false);
  const [loading, setLoading] = useState(!seeded);

  // Mount. A seeded view already holds the tail and leaves this alone; an
  // unseeded one reads it exactly as this page always did.
  useEffect(() => {
    if (seeded || !wallet) return;
    (async () => {
      setLoading(true);
      try {
        // Fetch every loan this wallet is a party to (not limit:1) so ?loan= can
        // resolve to any of them; the timeline carries all the loans' events.
        const [pData, tData] = await Promise.all([
          fetchPwnPositions({ wallet, limit: 100 }),
          fetchPwnTimeline(wallet, { recent: TIMELINE_WINDOW_EVENTS }),
        ]);
        setSummaries(pData.data);

        // ⚠️ THE WINDOW IS CUT AT THE WALLET; THIS PAGE RENDERS ONE LOAN.
        // rails-server keys `?recent=N` and its /summary twin on the wallet
        // (lender OR borrower OR tx_from), and the summary's `totalEvents`,
        // `byAction`, `byDay` and `firstTimestamp` describe every loan the
        // wallet is a party to. This page's position is one LOAN, and the list
        // below is sliced to it — so on a wallet with more than one loan those
        // figures are about a different position than the rows they sit above:
        // the numbering would offset this loan's cards by another loan's event
        // count, the filter menu would count another loan's rows, and the
        // tenure would name the wallet's first loan rather than this one.
        //
        // Where the wallet is party to exactly one loan the two grains coincide
        // and every seeded surface is exact, so the window stands. Otherwise the
        // whole history is fetched, as it was before — one extra request, and
        // only on a wallet deep enough to have been windowed at all. The deepest
        // PWN owner in the index holds 77 events against a 1,000-event window,
        // so this costs nothing today and exists to keep the arithmetic right
        // if PWN ever grows. Windowing a multi-loan wallet needs a per-loan
        // cutoff on both backend routes; until then the page refuses.
        const loanScoped = (tData.cutoffBlock ?? null) != null && pData.data.length !== 1;
        const rows = loanScoped ? await fetchPwnTimeline(wallet) : tData;
        setEvents(rows.events ?? []);
        setCutoffBlock(rows.cutoffBlock ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, [wallet, seeded]);

  // The opening balance — the second of the windowed page's two requests, and
  // deliberately not merged into the first: the rows land and the list is
  // readable while this is in flight, and every whole-history figure declares
  // itself unknown until it arrives rather than stating the window's
  // arithmetic as a lifetime. A failure is a stated failure for the same
  // reason. PWN has no lifetime Σ and no actor split — both arrive omitted in
  // the response — so there is no merge to seed downstream of this; the tenure,
  // the numbering offset and both filter menus' counts are all this unlocks.
  useEffect(() => {
    // A seeded opening balance is already the answer — re-requesting it would
    // blank the whole-history figures for a round trip and put them back
    // unchanged. Only a server-side failure leaves it null with a cutoff block
    // set, which is exactly the case this still covers.
    if (opening != null) return;
    setOpeningFailed(false);
    if (cutoffBlock == null) return;
    const ac = new AbortController();
    fetchTimelineOpeningBalance({
      path: "/api/pwn/timeline/summary",
      params: { wallet },
      cutoffBlock,
      signal: ac.signal,
    })
      .then((data) => setOpening(data))
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setOpeningFailed(true);
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, cutoffBlock]);

  const historyWindow = useMemo<TimelineWindow>(() => {
    if (cutoffBlock == null) return WHOLE_HISTORY;
    if (opening) return { state: "ready", cutoffBlock, opening };
    return { state: openingFailed ? "failed" : "pending", cutoffBlock, opening: null };
  }, [cutoffBlock, opening, openingFailed]);

  // Which loan this page shows: the ?loan= id if it resolves, else the wallet's
  // most recently created loan. Old links without ?loan land on the latest.
  const selected =
    (loanParam ? summaries.find((s) => s.loanId === loanParam) : undefined) ??
    [...summaries].sort((a, b) => (b.createdBlock ?? 0) - (a.createdBlock ?? 0))[0];
  const selectedLoanId = selected?.loanId ?? null;

  // Bundle collateral overlay: when the collateral is the PWN Token Bundler's
  // ERC-1155, resolve what the bundle wrapped — the bundler's own
  // tokensInBundle(id) read at the loan's creation block (the bundle empties
  // when unwrapped after close). Additive: while in flight / on failure the
  // card simply shows "PWN Bundle #id". Detail page only — no listing reads.
  const bundleKey =
    selected?.collateral &&
    isPwnBundler(selected.collateral.address) &&
    selected.collateral.tokenId != null &&
    selected.createdBlock != null
      ? `${selected.collateral.tokenId}@${selected.createdBlock}`
      : null;
  const [bundle, setBundle] = useState<{ key: string; assets: PwnBundleAsset[] } | null>(null);
  useEffect(() => {
    if (!bundleKey) return;
    const [bundleId, block] = bundleKey.split("@");
    let cancelled = false;
    fetchPwnBundleContents({ bundleId, block: Number(block) })
      .then((r) => {
        if (!cancelled) setBundle({ key: bundleKey, assets: r.assets });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bundleKey]);

  const view = selected
    ? {
        ...viewFromSummary(selected),
        bundleContents: bundle && bundle.key === bundleKey ? bundle.assets : undefined,
      }
    : null;

  // Slice the timeline to the selected loan so each loan shows only its own
  // events; the export serializer wants them oldest-first.
  const pwnEvents = events
    .filter(isPwnEvent)
    .filter((e) => selectedLoanId == null || e.context.data.loanId === selectedLoanId)
    .sort((a, b) => a.blockNumber - b.blockNumber);
  // The CSV is the export whose purpose IS the rows, so on a windowed page it
  // fetches the whole history at click time rather than handing over the window
  // under a whole-history filename. It is narrowed to the SAME life/loan the
  // page is showing, so the spreadsheet covers the position on screen.
  const fetchAllHistory = useCallback(
    async () =>
      await (async () => {
        const res = await fetchPwnTimeline(wallet);
        const served = res.events ?? [];
        return {
          events: served
            .filter(isPwnEvent)
            .filter((e) => selectedLoanId == null || e.context.data.loanId === selectedLoanId)
            .sort((a, b) => a.blockNumber - b.blockNumber),
          missing: Math.max((res.rowCeiling?.total ?? served.length) - served.length, 0),
        };
      })(),
    [wallet, selectedLoanId],
  );
  // The tx-sibling seam: each card reaches its same-tx peers so a minted / burned
  // custody card can cross-reference the economic event it accompanies.
  const siblingsByTx = groupEventsByTx(pwnEvents);
  const tl = useTimelineEvents(pwnEvents, {
    storageKey: `pwn-${wallet}-${selectedLoanId ?? "all"}`,
    protocolKey: "pwn",
    window: historyWindow,
  });

  return (
    <div className="py-8 space-y-6">
      {/* showStamp={false}: PWN has no chain overlay — a recency stamp would
          assert a freshness the page doesn't have. */}
      <DetailTopRow session="pwn" wallet={wallet} showStamp={false}>
        {/* A window survives here only on a single-loan wallet: with more loans
            the page refetches the whole history, because PWN's timeline route
            takes no per-loan cutoff and a wallet-grained opening balance cannot
            be split across loans. So where the scope note below appears, the
            wallet's history IS this loan's. */}
        {view && (
          <PwnExportMenu
            view={view}
            events={pwnEvents}
            wallet={wallet}
            csvFilename={`pwn-loan-${view.loanId}-activity.csv`}
            fetchAllEvents={historyWindow.state === "whole" ? undefined : fetchAllHistory}
            history={markdownHistoryScope(historyWindow, pwnEvents)}
            scopeNote={exportScopeNote(historyWindow, pwnEvents, "this loan's whole history")}
          />
        )}
      </DetailTopRow>

      {loading ? (
        <DetailBodySkeleton />
      ) : !view ? (
        <div className="text-sm text-rb-500">No loan captured for this wallet.</div>
      ) : (
        <>
          <PwnPositionCard
            v={view}
            receipts
            viewHref={tl.viewHref}
            explanation={<PwnPositionExplanation v={view} wallet={wallet} />}
          />
          {view.status === "open" &&
            (() => {
              const towerData = computePwnEconomics(view);
              return (
                <ChainTruthTower
                  data={towerData}
                  title={`Loan #${view.loanId} · Lifetime flows`}
                  explanation={pwnEconomicsExplanation(towerData)}
                  learnMore={pwnEconomicsContent()}
                />
              );
            })()}
          <ChainTruthTimeline
            csvExportCeiling={INDEX_ROW_CEILING}
            // Matches `PwnEventCard`'s own `persistKey={`pwn:${event.id}`}` —
            // lets pinned mode (the per-event share route) force a landed
            // card's detail panel open on its first mount.
            persistKeyPrefix="pwn"
            closed={view.status !== "open"}
            tl={tl}
            // Tenure-first header (the V4 spoke treatment): when this LOAN
            // actually opened, not when the wallet's window does — `firstAt`
            // only overrides the tenure toward an EARLIER timestamp, so on the
            // no-op path (every real PWN wallet today) this is inert.
            toolbarLeading={
              <TimelineActivityHeader
                events={pwnEvents}
                closed={view.status !== "open"}
                firstAt={opening?.firstTimestamp}
                tenurePending={!lifetimeFiguresKnown(historyWindow)}
              />
            }
            renderCard={(event, meta) =>
              isPwnEvent(event) ? (
                <PwnEventCard
                  event={event}
                  eventNumber={meta.eventNumber}
                  isFirst={meta.isFirst}
                  isLast={meta.isLast}
                  siblings={siblingsByTx.get(event.txHash) ?? [event]}
                />
              ) : null
            }
          />
          <ProvInspectorLayer />
        </>
      )}
    </div>
  );
}
