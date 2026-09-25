"use client";

// Dolomite position detail — reference depth, chain-state-first, the
// 3-section anatomy (card → economics → timeline). The route is TWO segments
// because that is literally Account.Info = (owner, uint256 accountNumber):
// Dolomite is cross-margin WITHIN an account number and isolated ACROSS them,
// so one page per owner would assert a single collateralisation across
// accounts that are independently liquidated. /dolomite/[owner] alone 404s
// deliberately — no page exists for it.
//
// Every value is chain-direct or chain-derived: position state + timeline
// replayed from the captured margin-core events (the emitted newPar absolutes
// — the slot itself), and the risk surfaces (runway, margin card, the
// narration) read live from the core via /api/chain/dolomite/position —
// getAccountBalances (par + wei at the accruing index), the core's own raw
// and adjusted values, getAccountStatus, and ⚠️ the account's own margin line
// (getAccountRiskOverrideByAccount — the LST/ETH carve-out — else the global
// ratio, cross-checked against getMarginRatioForAccount). The first paint
// (card + tower + timeline from the index) never waits on RPC round-trips;
// the risk surfaces stream in when the read lands, and a chainStale response
// simply leaves them unrendered. The balance legs upgrade from the listing's
// market-state read to the live getAccountBalances wei when the chain read
// lands.

import { useCallback, useEffect, useMemo, useState } from "react";
import { DRAINED_ROW_CEILING } from "@/lib/shared/timeline-row-ceiling";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isDolomiteEvent } from "@/lib/shared/types/event-shape";
import { fetchDolomitePositions } from "@/lib/api/fetch-dolomite-positions";
import type { DolomitePositionSummary } from "@/lib/sources/api/dolomite-positions";
import { fetchDolomiteTimeline } from "@/lib/api/fetch-dolomite-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import {
  lifetimeFiguresKnown,
  TIMELINE_WINDOW_EVENTS,
  WHOLE_HISTORY,
  type TimelineOpeningBalance,
  type TimelineWindow,
} from "@/lib/shared/timeline-opening-balance";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";
import { fetchDolomiteChainPosition, type DolomiteChainResponse } from "@/lib/api/fetch-dolomite-position";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { DOLOMITE_LIQUIDATION_RUNS } from "@/lib/dolomite/timeline-runs";
import { groupEventsByTx } from "@/lib/shared/explainer-prose";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { DolomiteEventCard } from "@/components/protocol/dolomite/dolomite-event-card";
import {
  DolomitePositionCard,
  viewFromSummary,
  type DolomitePositionView,
} from "@/components/protocol/dolomite/dolomite-position-card";
import { DolomitePositionExplanation } from "@/components/protocol/dolomite/dolomite-position-explanation";
import { DolomiteRiskSlot } from "@/components/protocol/dolomite/dolomite-risk-slot";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import {
  computeDolomiteEconomics,
  dolomiteLifetimeWithOpening,
  computeDolomiteCardCaptions,
} from "@/lib/dolomite/economics";
import { dolomiteEconomicsExplanation, dolomiteEconomicsContent } from "@/lib/dolomite/economics-explanation";
import { normalizeAccountNumber } from "@/lib/dolomite/asset-catalog";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import type { PriceStripAsset } from "@/components/shared/price-strip";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { summariseExternalActors, withOpeningActors } from "@/lib/shared/external-actor";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle.
const DolomiteExportMenu = dynamic(
  () => import("@/components/protocol/dolomite/dolomite-export-menu").then((m) => m.DolomiteExportMenu),
  { ssr: false },
);

interface DolomitePositionViewProps {
  /** Already lower-cased and address-shaped — the server route rejected
   *  anything else with a 404 before this component existed. */
  owner: string;
  /** Canonical decimal form. The URL accepts decimal or 0x-hex and the API
   *  speaks decimal strings; the route normalises once, and NEVER through
   *  Number() — this is a uint256, often hash-derived past 2^53. */
  accountNumber: string;
  initialPosition: DolomitePositionSummary | null;
  /** `null` means the server could not read the tail; the effect below then
   *  reads it exactly as this page always did. An EMPTY array is a real answer
   *  — an account with no captured events — and seeds. */
  initialEvents: BaseActivityEvent[] | null;
  initialCutoffBlock: number | null;
  initialOpening: TimelineOpeningBalance | null;
}

export default function DolomitePositionView({
  owner,
  accountNumber,
  initialPosition,
  initialEvents,
  initialCutoffBlock,
  initialOpening,
}: DolomitePositionViewProps) {
  // Keyed on the timeline, not the row: an account Dolomite has never seen is a
  // real answer the server can seed, and its `initialPosition` is null.
  const seeded = initialEvents != null;
  const [view, setView] = useState<DolomitePositionView | null>(() =>
    initialPosition ? viewFromSummary(initialPosition) : null,
  );
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  // The checkpoint model. The timeline fetch asks for a WINDOW of the most
  // recent events; on an account that needs one, the response names the block
  // the window opened at and everything below it arrives as a declared opening
  // balance from the /summary twin. On an account that does not — the
  // overwhelming majority — `cutoffBlock` comes back null, no second request
  // is made and the page is byte-for-byte what it was.
  const [cutoffBlock, setCutoffBlock] = useState<number | null>(initialCutoffBlock);
  const [opening, setOpening] = useState<TimelineOpeningBalance | null>(initialOpening);
  const [openingFailed, setOpeningFailed] = useState(false);
  const [loading, setLoading] = useState(!seeded);
  const [chain, setChain] = useState<DolomiteChainResponse | null>(null);
  // Standing display framing (risk view) — a global preference, so the
  // reader's choice on one position carries to the next.

  // Mount. A seeded view already holds the tail and leaves this alone; an
  // unseeded one reads it exactly as this page always did.
  useEffect(() => {
    if (seeded || !owner || accountNumber == null) return;
    (async () => {
      setLoading(true);
      try {
        const [pData, tData] = await Promise.all([
          fetchDolomitePositions({ owner, accountNumber, limit: 1 }),
          fetchDolomiteTimeline(owner, accountNumber, { recent: TIMELINE_WINDOW_EVENTS }),
        ]);
        const summary = pData.data[0] ?? null;
        setView(summary ? viewFromSummary(summary) : null);
        setEvents(tData.events ?? []);
        setCutoffBlock(tData.cutoffBlock ?? null);
      } catch (err) {
        // A down index leaves the page in its explicit not-found state; the
        // chain lane below is independent and still reads.
        console.error("dolomite detail index fetch failed:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [owner, accountNumber, seeded]);

  // The opening balance — the second of the windowed page's two requests, and
  // deliberately not merged into the first: the rows land and the list is
  // readable while this is in flight, and every whole-history figure declares
  // itself unknown until it arrives rather than stating the window's
  // arithmetic as a lifetime. A failure is a stated failure for the same
  // reason.
  useEffect(() => {
    // A seeded opening balance is already the answer — only a server-side
    // failure leaves it null with a cutoff block set, which is exactly the
    // case this still covers.
    if (opening != null) return;
    setOpeningFailed(false);
    if (cutoffBlock == null) return;
    const ac = new AbortController();
    fetchTimelineOpeningBalance({
      path: "/api/dolomite/timeline/summary",
      params: { owner, accountNumber },
      cutoffBlock,
      signal: ac.signal,
    })
      .then((data) => setOpening(data))
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setOpeningFailed(true);
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, accountNumber, cutoffBlock]);

  const historyWindow = useMemo<TimelineWindow>(() => {
    if (cutoffBlock == null) return WHOLE_HISTORY;
    if (opening) return { state: "ready", cutoffBlock, opening };
    return { state: openingFailed ? "failed" : "pending", cutoffBlock, opening: null };
  }, [cutoffBlock, opening, openingFailed]);

  // The live per-account read (balances at the accruing index, the core's own
  // values, the account's own margin line) — off the critical path; a failure
  // returns chainStale and the risk surfaces simply stay unrendered.
  useEffect(() => {
    if (!owner || accountNumber == null) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchDolomiteChainPosition({ owner, accountNumber });
        if (!cancelled && !data.chainStale) setChain(data);
      } catch {
        // Index-derived surfaces already render; the risk layer just stays off.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, accountNumber]);

  // Upgrade the balance legs to the live getAccountBalances wei when the
  // chain read landed — same slots, one head, exact integers.
  const liveView = useMemo<DolomitePositionView | null>(() => {
    if (!view || !chain || view.status !== "open") return view;
    const upgrade = (legs: DolomitePositionView["supplies"], side: 1 | -1) =>
      legs.map((l) => {
        const m = chain.balances.find((b) => b.marketId === l.marketId);
        // Upgrade only when the live leg sits on the SAME side of zero — a
        // sign flip since the index snapshot is a real state change the
        // replayed row should keep narrating until the index catches up.
        if (!m || Math.sign(m.wei) !== side) return l;
        return { ...l, current: Math.abs(m.wei), currentRaw: m.weiRaw.replace("-", "") };
      });
    return { ...view, supplies: upgrade(view.supplies, 1), borrows: upgrade(view.borrows, -1) };
  }, [view, chain]);

  const dolomiteEvents = useMemo(() => events.filter(isDolomiteEvent), [events]);
  // The tx-sibling seam: each card reaches its same-tx legs so the liquidation
  // narrator (the debt leg) can name the collateral seized on a sibling leg.
  const siblingsByTx = useMemo(() => groupEventsByTx(dolomiteEvents), [dolomiteEvents]);

  // Who executed this account's events — the SAME externalActor() verdict each
  // event card renders on its spine (txFrom vs the leg's own party), reduced
  // over the whole history so the Explanation can state it once. Derived from
  // the events already on the page; no new field on the position response.
  const externalActivity = useMemo(
    () =>
      summariseExternalActors(
        dolomiteEvents.map((e) => ({
          txFrom: e.context.data.txFrom,
          poolCaller: e.context.data.caller,
          wallet: e.wallet,
        })),
      ),
    [dolomiteEvents],
  );

  // On a windowed page the opening balance's own split is added: rails-server
  // reconstructs the same externalActor(txFrom, caller) verdict against the
  // owner, with no action exclusions — exactly this reduction — so both
  // halves judge on the same fact and never count one event twice.
  const externalActivityWithOpening = useMemo(
    () => withOpeningActors(externalActivity, opening?.actors, opening?.totalEvents ?? 0),
    [externalActivity, opening],
  );

  const tl = useTimelineEvents(dolomiteEvents, {
    storageKey: `dolomite-${owner}-${accountNumber}`,
    protocolKey: "dolomite",
    window: historyWindow,
  });

  // ⚠️ On a windowed page every lifetime surface must read the MERGED history,
  // not the window's. `lifetimeEvents` is undefined until the opening balance
  // is known, and the tower treats an absent event list as "no lifetime layer"
  // rather than as an empty one — so it states nothing while it cannot state
  // the whole, which is the only correct answer between the two requests.
  const lifetimeKnown = lifetimeFiguresKnown(historyWindow);
  const lifetimeEvents = lifetimeKnown ? dolomiteEvents : undefined;
  const precomputedLifetime = useMemo(
    () =>
      dolomiteLifetimeWithOpening(dolomiteEvents, opening, (marketId) => {
        const rows = [...(view?.supplies ?? []), ...(view?.borrows ?? [])];
        return rows.find((r) => r.marketId === marketId)?.symbol;
      }),
    [dolomiteEvents, opening, view],
  );

  // The CSV is the export whose purpose IS the rows, so on a windowed page it
  // fetches the whole history at click time rather than handing over the
  // window under a whole-history filename.
  const fetchAllHistory = useCallback(async () => {
    const res = await fetchDolomiteTimeline(owner, accountNumber);
    const served = (res.events ?? []).filter(isDolomiteEvent);
    // The proxy's page cap, passed through rather than absorbed: a download
    // that is short must not happen at all.
    return {
      events: served,
      missing: Math.max((res.totalEvents ?? served.length) - served.length, 0),
    };
  }, [owner, accountNumber]);

  const captions = liveView ? computeDolomiteCardCaptions(liveView) : null;

  // The top row's price dropdown: the core's own oracle price of each
  // market the account currently touches, deduped by token.
  const stripAssets = useMemo<PriceStripAsset[]>(() => {
    if (!chain || chain.chainStale) return [];
    const seen = new Set<string>();
    const out: PriceStripAsset[] = [];
    for (const b of chain.balances) {
      if (seen.has(b.token)) continue;
      seen.add(b.token);
      if (typeof b.priceUsd === "number" && b.priceUsd > 0)
        out.push({ symbol: b.symbol, address: b.token, price: b.priceUsd });
    }
    return out;
  }, [chain]);

  if (accountNumber == null) {
    return (
      <div className="py-8">
        <p className="text-sm text-rb-500">Not a Dolomite account — the account number is not a uint256.</p>
      </div>
    );
  }

  return (
    <div className="py-8 space-y-6">
      <DetailTopRow session="dolomite" wallet={owner} assets={stripAssets}>
        {liveView && (
          <DolomiteExportMenu
            owner={owner}
            accountNumber={accountNumber}
            view={liveView}
            chain={chain}
            events={dolomiteEvents}
            csvFilename={`dolomite-${owner.slice(0, 10)}-${accountNumber.slice(0, 8)}-activity.csv`}
            fetchAllEvents={historyWindow.state === "whole" ? undefined : fetchAllHistory}
            history={markdownHistoryScope(historyWindow, dolomiteEvents)}
            scopeNote={exportScopeNote(historyWindow, dolomiteEvents, "this account's whole history")}
          />
        )}
      </DetailTopRow>

      {loading ? (
        <DetailBodySkeleton />
      ) : (
        <>
          {liveView && (
            <DolomitePositionCard
              v={liveView}
              receipts
              viewHref={tl.viewHref}
              captions={captions ?? undefined}
              // The risk slot rides the card's heading-button row (the Aave
              // V3 treatment): the Display menu plus the chosen risk picture
              // — liquidation runway (ratio = the core's own adjusted supply
              // ÷ adjusted borrow, line = the ACCOUNT's own requirement, the
              // risk override where one is set) or the margin-ratio view
              // (the same requirement read as a capacity bar). Whatever it
              // draws is on the card face and in the card's receipts scope,
              // so the Provenance list stays 1:1 with the face figures.
              rowExtra={
                chain && liveView.status === "open" && chain.collateralization != null ? (
                  <DolomiteRiskSlot chain={chain} />
                ) : undefined
              }
              // The Explanation is now pure layman prose about those same
              // face figures — no secondary figure-strips. The margin card
              // is absorbed into the risk slot above; the per-market rate
              // rows it used to carry live on the market view.
              // Passed whatever the status and before the chain read lands:
              // the pane, and the copy-view link at its foot, mount with the
              // card. A closed account, or an open one whose read is pending,
              // narrates nothing.
              explanation={
                <DolomitePositionExplanation
                  chain={liveView.status === "open" ? chain : null}
                  liquidationCount={liveView.liquidationCount}
                  txCount={liveView.txCount}
                  externalActivity={externalActivityWithOpening}
                />
              }
            />
          )}
          {liveView &&
            (() => {
              const towerData = computeDolomiteEconomics(liveView, lifetimeEvents, precomputedLifetime);
              return (
                <ChainTruthTower
                  data={towerData}
                  explanation={dolomiteEconomicsExplanation(towerData)}
                  learnMore={dolomiteEconomicsContent()}
                />
              );
            })()}
          <ChainTruthTimeline
            csvExportCeiling={DRAINED_ROW_CEILING}
            // Matches `DolomiteEventCard`'s own `persistKey={`dolomite:${event.id}`}`
            // — lets pinned mode (the per-event share route) force a landed
            // card's detail panel open on its first mount.
            persistKeyPrefix="dolomite"
            closed={liveView ? liveView.status !== "open" : undefined}
            tl={tl}
            runs={DOLOMITE_LIQUIDATION_RUNS}
            toolbarLeading={
              liveView ? (
                <TimelineActivityHeader
                  events={dolomiteEvents}
                  closed={liveView.status !== "open"}
                  // When the account actually opened, not when the window does.
                  firstAt={opening?.firstTimestamp}
                  tenurePending={!lifetimeFiguresKnown(historyWindow)}
                />
              ) : undefined
            }
            renderCard={(event, meta) =>
              isDolomiteEvent(event) ? (
                <DolomiteEventCard
                  event={event}
                  eventNumber={meta.eventNumber}
                  isFirst={meta.isFirst}
                  isLast={meta.isLast}
                  siblings={siblingsByTx.get(event.txHash) ?? [event]}
                  accountNumber={accountNumber ?? undefined}
                />
              ) : null
            }
          />
          {/* Ambient oracle-price pill, fixed bottom-right. */}
          <ProvInspectorLayer />
        </>
      )}
    </div>
  );
}
