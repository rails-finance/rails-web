"use client";

// One (market, wallet) position on Morpho Blue Base — card, Lifetime flows and
// whole-life timeline, stacked the way the Ethereum position page stacks them.
//
// The Ethereum explorer's detail page IS one of these: a position is a
// (market, wallet) pair, and that page renders exactly one. So does the Base
// position page (/base/morpho/<wallet>/<market>), which renders this section
// for the one market its route names, fed by the wallet's sweep instead of an
// index; the wallet page above it lists the cards and links here. The cards, the flows replay and
// the timeline body are the Ethereum ones, imported rather than reimplemented.
//
// Two lanes meet in the card. The REPLAY (the sweep) knows the history —
// collateral, borrowed principal, peaks, the liquidation record. The LIVE read
// knows the present — the debt with interest, the oracle, the health verdict.
// The adapter (morphoViewFromSweep) admits the live debt only when the live
// borrow-shares slot equals the replayed one exactly, which is the proof the
// sweep read every row; otherwise the interest split is gated with its reason.

import { useCallback, useMemo } from "react";

import { morphoExplorer } from "@/lib/morpho/explorer";
import { MorphoEventCard } from "@/components/protocol/morpho/morpho-event-card";
import {
  MorphoMenuRows,
  MorphoPositionCard,
  morphoCardIdentity,
} from "@/components/protocol/morpho/morpho-position-card";
import { PositionCard, type PositionCardExports, type PositionCardSlots } from "@/components/shared/position-card";
import { morphoBasePositionHref } from "@/lib/morpho-base/routes";
import {
  MorphoClosedPositionExplanation,
  MorphoPositionExplanation,
} from "@/components/protocol/morpho/morpho-position-explanation";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { MORPHO_FOLDER_REGISTER, MORPHO_LIQUIDATION_RUNS } from "@/lib/morpho/timeline-runs";
import { TimelineCoverageFooter } from "@/components/shared/timeline-coverage-footer";
import { boundaryFromChainCoverage } from "@/lib/shared/timeline-boundary";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { useTimelineSegment } from "@/hooks/useTimelineSegment";
import { eventsBelowLife, replaySegmentReads } from "@/lib/api/fetch-replay-segment";
import { WHOLE_HISTORY } from "@/lib/shared/timeline-opening-balance";
import { interleaveRowPlan, type GroupedTimelineFields } from "@/lib/shared/timeline-folder";
import { withFolderActors } from "@/lib/shared/timeline-folder-reductions";
import type { MorphoChainTimelineResponse } from "@/lib/api/fetch-morpho-base-timeline";
import type { ChainTimelineCoverage } from "@/lib/api/fetch-chain-timeline";
import type { MorphoSweptPosition } from "@/lib/api/fetch-morpho-base-timeline";
import type { MorphoChainPositionResponse } from "@/lib/api/fetch-morpho-position";
import { morphoViewFromSweep } from "@/lib/morpho/swept-position-view";
import { summariseExternalActors } from "@/lib/shared/external-actor";
import { isMorphoEvent } from "@/lib/shared/types/event-shape";
import { AssetAmount } from "@/components/shared/asset-amount";
import { CARD_VOCAB, notRecordedNote } from "@/lib/shared/card-vocab";
import { marketLabel } from "@/lib/morpho/asset-catalog";
import { LifetimeFlowsPanel } from "@/components/shared/lifetime-flows-panel";
import { LifetimeFlowsScrubber } from "@/components/shared/lifetime-flows-scrubber";
import { FlowFocusContext } from "@/components/shared/flow-focus-context";
import { MorphoFlowsNote, morphoFlowsContent } from "@/components/protocol/morpho/morpho-flows-note";
import { useMorphoFlows } from "@/hooks/useMorphoFlows";
import { fetchTimelineFolderMembers } from "@/lib/api/fetch-timeline-folder";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";

/** The contract the sweep read, for the footer's "from its first block" claim. */
const SOURCE_LABEL = "the Morpho Blue singleton on Base";

const TIMELINE_ROUTE = "/api/chain/morpho-base/timeline";
const FOLDER_ROUTE = "/api/chain/morpho-base/timeline/folder";

export interface MorphoBasePositionSectionProps {
  wallet: string;
  pos: MorphoSweptPosition;
  /** The live read of this market's slots, when the wallet holds anything in
   *  it now; null for a position that has closed. */
  chain: MorphoChainPositionResponse | null;
  /** The sweep's coverage — one statement for the whole wallet, restated under
   *  each position's own list with that position's cap and undated counts. */
  coverage: ChainTimelineCoverage;
  /** True when the sweep read every block from the singleton's first — the
   *  only case the shared card and the Lifetime flows panel are entitled to. */
  sweptClean: boolean;
  /** Set when `wallet` is a catalogued MetaMorpho vault (the census — a
   *  floor, not a ceiling; lib/morpho-base/vault-catalog.ts) — its name and
   *  its own exposure page, resolved once on the server and threaded into the
   *  card below so this same address never falls back to bare hex here. */
  vaultOwner?: { name: string; href: string } | null;
  /** The route's answer for THIS position as ROWS (`?group=1&market=`,
   *  lib/morpho-base/timeline-folders.ts): `pos.events` are then the
   *  ungrouped ones and `rowPlan` puts the folders back between them. Null
   *  on a flat answer. */
  grouped?: MorphoChainTimelineResponse | null;
  /** The event route (rails-ops TO-DO-ui-jobs 236): the event's card in page
   *  mode with the shared column; no position card, no flows panel. */
  onEventPage?: boolean;
  /** The card ⋮'s export shapes (ui-jobs 308 point 2). */
  exports?: PositionCardExports | null;
}

export function MorphoBasePositionSection({
  wallet,
  pos,
  chain,
  coverage,
  sweptClean,
  vaultOwner = null,
  grouped = null,
  onEventPage = false,
  exports = null,
}: MorphoBasePositionSectionProps) {
  const events = useMemo(() => pos.events.filter(isMorphoEvent), [pos.events]);

  const servedRows = useMemo(
    () => (grouped?.grouped && grouped.rowPlan ? interleaveRowPlan(grouped.rowPlan, events) : undefined),
    [grouped, events],
  );
  /** The folders, whole and unfiltered. The card's counts and the peaks need
   *  nothing from them: the route replayed every row before it grouped, and
   *  those figures ride the replay. The Lifetime flows panel opens them. */
  const servedFolders = useMemo(
    () => (servedRows ? servedRows.flatMap((row) => (row.kind === "folder" ? [row.folder] : [])) : null),
    [servedRows],
  );
  const groupedTail = useMemo<GroupedTimelineFields | null>(
    () =>
      grouped?.grouped && grouped.rowPlan && grouped.eventsServed != null
        ? {
            grouped: true,
            rowPlan: grouped.rowPlan,
            eventsServed: grouped.eventsServed,
            boundBy: grouped.boundBy ?? null,
          }
        : null,
    [grouped],
  );

  // The month read (hooks/useTimelineSegment.ts): a month the preload does
  // not hold is sliced from the route's replay (`&market=&from=&to=`), whose
  // running figures are the whole replay's. Months below a seed's cut have no
  // day counts, so the grid draws them and refuses the click; the boundary
  // card states them.
  const segmentReads = useMemo(
    () => replaySegmentReads(TIMELINE_ROUTE, wallet, { market: pos.marketId }),
    [wallet, pos.marketId],
  );
  // The Lifetime flows panel (lib/morpho/flows.ts), drawn under the rule the
  // card follows: only a sweep that read every block.
  const borrowerSide =
    pos.peakCollateral > 0 || pos.peakBorrowed > 0 || pos.lifetime.deposited > 0 || pos.lifetime.borrowed > 0;
  const flowsOn = sweptClean;
  const live = chain && !chain.chainStale ? chain : null;
  // The whole history: the drawn rows where they are all of it; a grouped
  // answer's folders opened (the export's read); a position cut below its
  // newest rows has no read here, and the panel says it was not read.
  const whole = !servedFolders?.length && !pos.omitted?.count;
  const fetchAll = useCallback(async () => {
    const all: BaseActivityEvent[] = [...events];
    for (const f of servedFolders ?? []) {
      const opened = await fetchTimelineFolderMembers({
        path: FOLDER_ROUTE,
        params: { wallet, market: pos.marketId },
        folder: f.responseId,
      });
      all.push(...opened.events);
    }
    all.sort((a, b) => a.blockNumber - b.blockNumber);
    return { events: all, missing: 0 };
  }, [events, servedFolders, wallet, pos.marketId]);
  const flowLive = useMemo(
    () =>
      live
        ? {
            price: live.oraclePrice > 0 ? live.oraclePrice : null,
            coll: live.collateral,
            debt: live.currentDebt,
            supply: live.currentSupply,
            borrowApr: live.borrowApr,
            supplyApr: live.supplyApr,
          }
        : null,
    [live],
  );
  const flows = useMorphoFlows({
    wholeEvents: flowsOn && whole ? events : null,
    fetchAll: flowsOn && !pos.omitted?.count ? fetchAll : null,
    marketId: pos.marketId,
    chainId: MORPHO_BASE_CHAIN_ID,
    loanSymbol: flowsOn && !pos.loanDecimalsUnread ? pos.loanSymbol : null,
    collSymbol: pos.collateralDecimalsUnread ? null : pos.collateralSymbol,
    loanAddress: pos.loanToken,
    collAddress: pos.collateralToken,
    lltv: pos.lltv,
    open: morphoViewFromSweep(pos, wallet, chain).status === "open",
    live: flowLive,
  });

  const { tl, segments, readFolderMembers } = useTimelineSegment({
    events,
    groupedTail,
    servedRows,
    servedFolders,
    opening: null,
    lifeBelow: grouped?.belowByDay,
    eventsBelowLife: eventsBelowLife(pos.omitted?.count, grouped?.belowByDay),
    // This position's rows before the trim, so numbering runs over its whole
    // history (rails-ops decision 0019).
    olderCount: pos.omitted?.count ?? 0,
    historyWindow: WHOLE_HISTORY,
    isEvent: isMorphoEvent,
    readGrouped: segmentReads.readGrouped,
    readFlat: segmentReads.readFlat,
    folderPath: FOLDER_ROUTE,
    folderParams: { wallet, market: pos.marketId },
    storageKey: `morpho-base-${pos.marketId}-${wallet}`,
    protocolKey: "morpho",
    // Navigated by the Lifetime flows chart's "Show timeline to": no Dates.
    dates: !flowsOn,
  });

  const view = useMemo(() => morphoViewFromSweep(pos, wallet, chain), [pos, wallet, chain]);

  // Who executed this position's events — the same externalActor() verdict
  // each card renders on its spine, reduced over the drawn history.
  const externalActivity = useMemo(
    () =>
      withFolderActors(
        summariseExternalActors(
          events.map((e) => ({ txFrom: e.context.data.txFrom, poolCaller: e.context.data.caller, wallet: e.wallet })),
        ),
        servedFolders,
      ),
    [events, servedFolders],
  );

  // This position's own statement: the wallet-wide sweep facts, with the cap
  // and the undated count that apply to THIS list rather than to the wallet.
  const ownCoverage = useMemo<ChainTimelineCoverage>(
    () => ({
      ...coverage,
      firstEventAt: pos.firstEventAt,
      omitted: pos.omitted,
      undated: pos.undated,
    }),
    [coverage, pos.firstEventAt, pos.omitted, pos.undated],
  );

  return (
    <FlowFocusContext.Provider value={flowsOn ? flows.focus : null}>
      <section className="space-y-6">
        {/* A market the wallet only ever LENT in gets the slot card (open) or a
          plain closing statement (closed), not the shared card: that card's
          grammar is a borrower's — collateral against debt, peaks of each —
          and would read "nothing ever borrowed against its collateral" over a
          position that never had collateral. */}
        {!onEventPage &&
          sweptClean &&
          !borrowerSide &&
          (live ? (
            <MorphoLenderOpenCard p={live} surface="detail" vault={vaultOwner} exports={exports} />
          ) : (
            <LenderClosedCard pos={pos} wallet={wallet} surface="detail" vault={vaultOwner} exports={exports} />
          ))}
        {!onEventPage && sweptClean && borrowerSide && (
          <MorphoPositionCard
            v={{ ...view, vaultOwner }}
            surface="detail"
            viewHref={tl.viewHref}
            session="morpho-base"
            // The LTV, the rate and the room to borrow from the live market read.
            live={chain}
            exports={exports}
            explanation={
              view.status !== "open" ? (
                <MorphoClosedPositionExplanation
                  v={view}
                  events={events}
                  folders={servedFolders}
                  // The counts are stated only where the rows and folders drawn are the whole history.
                  {...(events.length + (servedFolders ?? []).reduce((n, f) => n + f.count, 0) === view.eventCount
                    ? {
                        eventCount: view.eventCount,
                        liquidationCount:
                          events.filter((e) => e.context.data.eventType === "liquidation").length +
                          (servedFolders ?? []).reduce(
                            (n, f) => n + (f.counts.find((c) => c.key === "liquidation")?.count ?? 0),
                            0,
                          ),
                      }
                    : {})}
                />
              ) : live ? (
                <MorphoPositionExplanation
                  chain={live}
                  txCount={view.txCount}
                  // The counts are stated only where the drawn rows are the whole history.
                  {...(events.length === view.eventCount && !servedFolders?.length
                    ? {
                        eventCount: view.eventCount,
                        liquidationCount: events.filter((e) => e.context.data.eventType === "liquidation").length,
                      }
                    : {})}
                  everLiquidated={view.everLiquidated}
                  externalActivity={externalActivity}
                />
              ) : undefined
            }
          />
        )}

        {/* Lifetime flows: the bars and the line over the position's replay
          (lib/morpho/flows.ts), in the loan token, in place of the tower
            (TO-DO-ui-jobs 206). */}
        {!onEventPage && flowsOn && (
          <LifetimeFlowsPanel
            scrubber={flows.timeline ? <LifetimeFlowsScrubber timeline={flows.timeline} /> : null}
            read={flows.read}
            explanation={
              <div className="space-y-2 text-sm text-rb-500">
                <MorphoFlowsNote
                  facts={flows.facts}
                  loanSymbol={pos.loanSymbol}
                  collSymbol={pos.collateralSymbol}
                  name="Morpho Blue on Base"
                />
              </div>
            }
            learnMore={morphoFlowsContent("Morpho Blue on Base")}
          />
        )}

        <ChainTruthTimeline
          tl={tl}
          // Both grouping paths: the spec groups a flat answer in the browser,
          // the register draws the folders the route served.
          runs={MORPHO_LIQUIDATION_RUNS}
          folderRegister={MORPHO_FOLDER_REGISTER}
          readFolderMembers={readFolderMembers}
          segments={segments}
          persistKeyPrefix="morpho"
          eventPage={(slot) =>
            morphoExplorer.eventPage({
              ...slot,
              marketId: pos.marketId,
              marketLabel: pos.marketLabel,
              wallet,
              deployment: "base",
            })
          }
          closed={view.status !== "open"}
          toolbarLeading={
            <TimelineActivityHeader
              events={events}
              folders={servedFolders}
              closed={view.status !== "open"}
              firstAt={pos.firstEventAt}
            />
          }
          emptyLabel={
            sweptClean
              ? "No events to show for this market."
              : "No events to show — the sweep could not read this wallet's history."
          }
          footer={<TimelineCoverageFooter coverage={ownCoverage} sourceLabel={SOURCE_LABEL} />}
          // On a grouped answer the list covers `eventsServed`; a month read
          // holds no card, the grid holding the other months.
          boundary={
            tl.historyWindow.state === "span"
              ? null
              : boundaryFromChainCoverage(ownCoverage, groupedTail ? groupedTail.eventsServed : events.length)
          }
          renderCard={(event, meta) =>
            isMorphoEvent(event) ? (
              <MorphoEventCard event={event} eventNumber={meta.eventNumber} isLast={meta.isLast} />
            ) : null
          }
        />
      </section>
    </FlowFocusContext.Provider>
  );
}

const lenderPct = (v: number): string => `${(v * 100).toFixed(2)}%`;

/** A market the wallet only ever LENT in, read live: one headline, Supplied,
 *  and its rate in the panel. Supply and its rate are a slot the singleton
 *  always answers fresh, so this draws the live chain read alone; nothing here
 *  comes from the replay. */
export function MorphoLenderOpenCard({
  p,
  surface = "listing",
  vault = null,
  exports,
}: {
  p: MorphoChainPositionResponse;
  /** `detail` on the position page; `listing` in a row. */
  surface?: "detail" | "listing";
  /** Set when `p.user` is a catalogued MetaMorpho vault — see
   *  MorphoBasePositionSection. */
  vault?: { name: string; href: string } | null;
  /** The ⋮'s export shapes on the position page. */
  exports?: PositionCardExports | null;
}) {
  const identity = morphoCardIdentity({
    market: marketLabel(p.loanSymbol, p.collateralSymbol, p.lltv === 0),
    lltv: p.lltv,
    listingOwner: surface === "detail" ? undefined : { wallet: p.user, session: "morpho-base", vault },
  });
  const heads = [
    {
      id: "supplied",
      label: "Supplied",
      // The market params are two addresses and this row holds them, so the
      // chip is handed the loan token: Morpho being permissionless, the house
      // symbol table cannot find "stkWELL".
      value: <AssetAmount value={p.currentSupply} symbol={p.loanSymbol} address={p.loanToken} />,
    },
  ];
  const slots: PositionCardSlots =
    surface === "detail"
      ? {
          surface: "detail",
          status: null,
          heads,
          identity,
          counters: null,
          explainer: { body: null },
          learnMore: null,
          menu: {
            leading: () => (
              <MorphoMenuRows marketId={p.marketId} pagePath={morphoBasePositionHref(p.user, p.marketId)} />
            ),
            exports: exports ?? null,
          },
          panel: [
            [
              {
                id: "supply-rate",
                label: "Supply rate",
                value: `${lenderPct(p.supplyApr)} APR`,
                tip: "The rate the market's lenders earn now, read live from the market: its borrow rate times the share of supply lent out, less the market's fee.",
              },
            ],
            [],
          ],
        }
      : { surface: "listing", status: null, heads, identity, counters: null, menu: null };
  return <PositionCard slots={slots} />;
}

/** A lender-only market the wallet has fully left. The replay carries the
 *  lifetime SUMS (supplied, withdrawn) and no peak balance, so the headline
 *  states that no peak is on record for this lane. */
export function LenderClosedCard({
  pos,
  wallet,
  surface = "listing",
  vault = null,
  exports,
}: {
  pos: MorphoSweptPosition;
  wallet: string;
  /** `detail` on the position page; `listing` in a row. */
  surface?: "detail" | "listing";
  /** Set when `wallet` is a catalogued MetaMorpho vault — see
   *  MorphoBasePositionSection. */
  vault?: { name: string; href: string } | null;
  /** The ⋮'s export shapes on the position page. */
  exports?: PositionCardExports | null;
}) {
  const detail = surface === "detail";
  const common = {
    status: { word: "Closed", tone: "muted" as const },
    heads: [{ id: "peak-supply", label: CARD_VOCAB.peakSupply, value: null, sub: notRecordedNote("wallet") }],
    identity: morphoCardIdentity({
      market: pos.marketLabel,
      lltv: pos.lltv,
      listingOwner: detail ? undefined : { wallet, session: "morpho-base", vault },
    }),
    counters: {
      lastActivityAt: pos.lastTs,
      eventCount: pos.txCount,
      liquidated: pos.everLiquidated,
      ...(detail ? { order: "age-last" as const } : {}),
    },
    outcome: { word: "Closed", dates: pos.lastTs ? [{ at: pos.lastTs }] : undefined },
  };
  const slots: PositionCardSlots = detail
    ? {
        ...common,
        surface: "detail",
        explainer: { body: null },
        learnMore: null,
        menu: {
          leading: () => (
            <MorphoMenuRows marketId={pos.marketId} pagePath={morphoBasePositionHref(wallet, pos.marketId)} />
          ),
          exports: exports ?? null,
        },
      }
    : { ...common, surface: "listing", menu: null };
  return <PositionCard slots={slots} />;
}
