"use client";

// Frankencoin position detail — chain-state-first, the 3-section anatomy
// (card → economics → timeline + the challenge forensics card). The route is
// ONE segment because a position IS its own contract — the address is the
// page key; the owner is shown on the card and honored through every
// OwnershipTransferred.
//
// THE CHAIN OVERLAY IS THE PRIMARY TRUTH here (the 0006 carve-out): the card,
// the risk strips and the narration all read the Position contract's own
// slots at head via /api/chain/frankencoin/position — collateral balance,
// minted, the owner-declared price → liq. price, the fee frame, the
// lifecycle clocks, the live challenge state. The indexed backend contributes
// what head state cannot say — the DENIED lifecycle (PositionDenied is not
// head-observable), the challenge tallies, and the event timeline — and while
// that index is still being filled, its surfaces state PENDING plainly rather
// than fabricate.
//
// Risk grammar (NO health factor, none invented): challenge status + the
// owner-declared liq. price + the expiration countdown + the cooldown. Units
// are native everywhere; no dollar renders on this page.

import { useCallback, useEffect, useMemo, useState } from "react";
import { DRAINED_ROW_CEILING } from "@/lib/shared/timeline-row-ceiling";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isFrankencoinEvent } from "@/lib/shared/types/event-shape";
import { fetchFrankencoinPositions } from "@/lib/api/fetch-frankencoin-positions";
import { fetchFrankencoinTimeline } from "@/lib/api/fetch-frankencoin-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import {
  lifetimeFiguresKnown,
  TIMELINE_WINDOW_EVENTS,
  WHOLE_HISTORY,
  type TimelineOpeningBalance,
  type TimelineWindow,
} from "@/lib/shared/timeline-opening-balance";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";
import { fetchFrankencoinChainPosition, type FrankencoinChainResponse } from "@/lib/api/fetch-frankencoin-position";
import type { FrankencoinPositionSummary } from "@/lib/sources/api/frankencoin-positions";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { FRANKENCOIN_AUCTION_RUNS } from "@/lib/frankencoin/timeline-runs";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { FrankencoinEventCard } from "@/components/protocol/frankencoin/frankencoin-event-card";
import {
  FrankencoinPositionCard,
  viewFromChain,
  mergeChainAndSummary,
  viewFromSummary,
  type FrankencoinPositionView,
} from "@/components/protocol/frankencoin/frankencoin-position-card";
import { FrankencoinPositionExplanation } from "@/components/protocol/frankencoin/frankencoin-position-explanation";
import { FrankencoinChallengeCard } from "@/components/protocol/frankencoin/frankencoin-challenge-card";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { computeFrankencoinEconomics, frankencoinLifetimeWithOpening } from "@/lib/frankencoin/economics";
import { frankencoinEconomicsExplanation, frankencoinEconomicsContent } from "@/lib/frankencoin/economics-explanation";
import { normalizePositionAddress } from "@/lib/frankencoin/asset-catalog";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { PriceStrip } from "@/components/shared/price-strip";
import { RiskFooterStrip, RiskFigure } from "@/components/shared/risk-footer-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle.
const FrankencoinExportMenu = dynamic(
  () => import("@/components/protocol/frankencoin/frankencoin-export-menu").then((m) => m.FrankencoinExportMenu),
  { ssr: false },
);

interface FrankencoinPositionViewProps {
  /** The position's own contract address, normalised by the server route — a
   *  Frankencoin position IS its contract, so this is the identity, not the
   *  owner. Anything that is not an address answered 404. */
  position: string;
  initialSummary: FrankencoinPositionSummary | null;
  /** The index lane's history. `null` means the server could not read it, and
   *  the effect below reads it exactly as this page always did — the index
   *  surfaces stay in their explicit PENDING state until it lands. An EMPTY
   *  array is a real answer and seeds. */
  initialEvents: BaseActivityEvent[] | null;
  initialCutoffBlock: number | null;
  initialOpening: TimelineOpeningBalance | null;
}

export default function FrankencoinPositionView({
  position,
  initialSummary,
  initialEvents,
  initialCutoffBlock,
  initialOpening,
}: FrankencoinPositionViewProps) {
  // Keyed on the timeline, not the row: a position the index has not captured
  // is a real answer the server can seed, and its `initialSummary` is null.
  const indexSeeded = initialEvents != null;
  const [chain, setChain] = useState<FrankencoinChainResponse | null>(null);
  const [chainSettled, setChainSettled] = useState(false);
  const [summary, setSummary] = useState<FrankencoinPositionSummary | null>(initialSummary);
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  const [indexPending, setIndexPending] = useState(!indexSeeded);
  // The checkpoint model. The timeline fetch asks for a WINDOW of the most
  // recent events; on a position that needs one, the response names the block
  // the window opened at and everything below it arrives as a declared opening
  // balance from the /summary twin. On a position that does not — every
  // Frankencoin position observed so far — `cutoffBlock` comes back null, no
  // second request is made and the page is byte-for-byte what it was.
  const [cutoffBlock, setCutoffBlock] = useState<number | null>(initialCutoffBlock);
  const [opening, setOpening] = useState<TimelineOpeningBalance | null>(initialOpening);
  const [openingFailed, setOpeningFailed] = useState(false);

  // The chain lane — the position's own slots at head, the page's primary
  // truth. It renders the card on its own; the index enriches it.
  useEffect(() => {
    if (!position) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchFrankencoinChainPosition({ position });
        if (!cancelled) {
          if (!data.chainStale) setChain(data);
          setChainSettled(true);
        }
      } catch {
        if (!cancelled) setChainSettled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [position]);

  // The index lane — history + the facts head state cannot say (DENIED, the
  // challenge tallies). The backend is being filled in parallel: a failure
  // leaves these surfaces in their explicit PENDING state, never fabricated.
  // A seeded view already holds the index lane and leaves this alone; an
  // unseeded one reads it exactly as this page always did.
  useEffect(() => {
    if (indexSeeded || !position) return;
    let cancelled = false;
    (async () => {
      try {
        const [pData, tData] = await Promise.all([
          fetchFrankencoinPositions({ position, limit: 1 }),
          fetchFrankencoinTimeline(position, { recent: TIMELINE_WINDOW_EVENTS }),
        ]);
        if (!cancelled) {
          setSummary(pData.data[0] ?? null);
          setEvents(tData.events ?? []);
          setCutoffBlock(tData.cutoffBlock ?? null);
          setIndexPending(false);
        }
      } catch (err) {
        // The chain lane above is independent and still reads.
        console.error("frankencoin detail index fetch failed:", err);
        if (!cancelled) setIndexPending(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [position, indexSeeded]);

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
      path: "/api/frankencoin/timeline/summary",
      params: { position },
      cutoffBlock,
      signal: ac.signal,
    })
      .then((data) => setOpening(data))
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setOpeningFailed(true);
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, cutoffBlock]);

  const historyWindow = useMemo<TimelineWindow>(() => {
    if (cutoffBlock == null) return WHOLE_HISTORY;
    if (opening) return { state: "ready", cutoffBlock, opening };
    return { state: openingFailed ? "failed" : "pending", cutoffBlock, opening: null };
  }, [cutoffBlock, opening, openingFailed]);

  // Chain-first view, index-merged when it lands; index-only as the fallback
  // while RPC is down.
  const view = useMemo<FrankencoinPositionView | null>(() => {
    if (chain) {
      const v = viewFromChain(chain);
      return summary ? mergeChainAndSummary(v, summary) : v;
    }
    return summary ? viewFromSummary(summary) : null;
  }, [chain, summary]);

  const frankEvents = useMemo(() => events.filter(isFrankencoinEvent), [events]);

  const tl = useTimelineEvents(frankEvents, {
    storageKey: `frankencoin-${position}`,
    protocolKey: "frankencoin",
    window: historyWindow,
  });

  // ⚠️ On a windowed page every lifetime surface must read the MERGED history,
  // not the window's. `lifetimeEvents` is undefined until the opening balance
  // is known, and the tower treats an absent event list as "no lifetime layer"
  // rather than as an empty one — so it states nothing while it cannot state
  // the whole, which is the only correct answer between the two requests.
  const lifetimeKnown = lifetimeFiguresKnown(historyWindow);
  const lifetimeEvents = lifetimeKnown ? frankEvents : undefined;
  const precomputedLifetime = useMemo(
    () => frankencoinLifetimeWithOpening(frankEvents, opening),
    [frankEvents, opening],
  );

  // The CSV is the export whose purpose IS the rows, so on a windowed page it
  // fetches the whole history at click time rather than handing over the
  // window under a whole-history filename.
  const fetchAllHistory = useCallback(async () => {
    const res = await fetchFrankencoinTimeline(position);
    const served = (res.events ?? []).filter(isFrankencoinEvent);
    // The proxy's page cap, passed through rather than absorbed: a download
    // that is short must not happen at all.
    return {
      events: served,
      missing: Math.max((res.totalEvents ?? served.length) - served.length, 0),
    };
  }, [position]);

  if (position == null) {
    return (
      <div className="py-8">
        <p className="text-sm text-rb-500">Not a Frankencoin position — the key is not a contract address.</p>
      </div>
    );
  }

  const loading = !chainSettled && view == null;

  return (
    <div className="py-8 space-y-6">
      <DetailTopRow session="frankencoin">
        {view && (
          <FrankencoinExportMenu
            position={position}
            view={view}
            chain={chain}
            events={frankEvents}
            csvFilename={`frankencoin-${position.slice(0, 10)}-activity.csv`}
            fetchAllEvents={historyWindow.state === "whole" ? undefined : fetchAllHistory}
            history={markdownHistoryScope(historyWindow, frankEvents)}
            scopeNote={exportScopeNote(historyWindow, frankEvents, "this position's whole history")}
          />
        )}
      </DetailTopRow>

      {loading ? (
        <DetailBodySkeleton />
      ) : view == null ? (
        <div className="text-sm text-rb-500">
          Nothing readable at this address — not a Frankencoin Position contract, or the chain read is unavailable.
        </div>
      ) : (
        <>
          <FrankencoinPositionCard
            v={view}
            receipts
            viewHref={tl.viewHref}
            // The context strip riding the heading-button row: the live
            // challenge state and the cooldown — the risk grammar's own
            // surfaces, from the position's slots at head.
            rowExtra={
              chain && view.status !== "closed" && ((chain.challengedAmount ?? 0) > 0 || chain.cooldownActive) ? (
                <RiskFooterStrip>
                  {(chain.challengedAmount ?? 0) > 0 && (
                    <RiskFigure caution>
                      Under challenge — {chain.challengedAmount} {view.collateralSymbol} in auction
                    </RiskFigure>
                  )}
                  {chain.cooldownActive && chain.cooldownUntil != null && (
                    <RiskFigure>
                      minting cooldown until{" "}
                      {new Date(chain.cooldownUntil * 1000).toLocaleDateString("en-GB", {
                        timeZone: "UTC",
                        day: "numeric",
                        month: "short",
                      })}
                    </RiskFigure>
                  )}
                </RiskFooterStrip>
              ) : undefined
            }
            // Everything describing the CURRENT on-chain position lives on
            // the card: the Explanation heading-button holds the narration —
            // mounted when the live read landed.
            explanation={
              chain ? (
                <FrankencoinPositionExplanation
                  chain={chain}
                  openedAt={summary?.openedAt}
                  challengeCount={summary?.challengeCount}
                  denied={summary?.status === "denied"}
                  txCount={summary?.txCount}
                />
              ) : undefined
            }
          />

          {(() => {
            const towerData = computeFrankencoinEconomics(view, lifetimeEvents, precomputedLifetime);
            return (
              <ChainTruthTower
                data={towerData}
                explanation={frankencoinEconomicsExplanation(towerData)}
                learnMore={frankencoinEconomicsContent()}
              />
            );
          })()}

          {/* The challenge forensics card — grouped by (hub, challenge
              number), slices within; renders only when history carries
              challenges. On a windowed page it reads the loaded rows alone —
              a challenge older than the window is summarised in the counts
              above the timeline, not re-narrated here. No observed position
              is deep enough to reach that case. */}
          <FrankencoinChallengeCard
            events={frankEvents}
            positionOpen={chain ? !chain.isClosed : summary ? summary.status === "open" : null}
          />

          {indexPending && frankEvents.length === 0 ? (
            <div className="rounded-2xl border border-rb-300/40 dark:border-rb-700/40 bg-raised px-5 py-4 text-sm text-rb-500">
              Event history pending — the indexed backend for this explorer is still being filled. Everything above is
              read live from the position contract at the latest block.
            </div>
          ) : (
            <ChainTruthTimeline
              csvExportCeiling={DRAINED_ROW_CEILING}
              // Matches `FrankencoinEventCard`'s own `persistKey={`frankencoin:${event.id}`}` —
              // lets pinned mode (the per-event share route) force a landed
              // card's detail panel open on its first mount.
              persistKeyPrefix="frankencoin"
              closed={view.status !== "open"}
              tl={tl}
              runs={FRANKENCOIN_AUCTION_RUNS}
              toolbarLeading={
                <TimelineActivityHeader
                  events={frankEvents}
                  closed={view.status !== "open"}
                  // When the position actually opened, not when the window
                  // does.
                  firstAt={opening?.firstTimestamp}
                  tenurePending={!lifetimeFiguresKnown(historyWindow)}
                />
              }
              renderCard={(event, meta) =>
                isFrankencoinEvent(event) ? (
                  <FrankencoinEventCard
                    event={event}
                    eventNumber={meta.eventNumber}
                    isFirst={meta.isFirst}
                    isLast={meta.isLast}
                  />
                ) : null
              }
            />
          )}
          <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
          <ProvInspectorLayer />
        </>
      )}
    </div>
  );
}
