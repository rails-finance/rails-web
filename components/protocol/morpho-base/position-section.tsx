"use client";

// One (market, wallet) position on Morpho Blue Base — card, economics tower and
// whole-life timeline, stacked the way the Ethereum position page stacks them.
//
// The Ethereum explorer's detail page IS one of these: a position is a
// (market, wallet) pair, and that page renders exactly one. So does the Base
// position page (/base/morpho/<wallet>/<market>), which renders this section
// for the one market its route names, fed by the wallet's sweep instead of an
// index; the wallet page above it lists the cards and links here. The cards, the tower arithmetic and
// the timeline body are the Ethereum ones, imported rather than reimplemented.
//
// Two lanes meet in the card. The REPLAY (the sweep) knows the history —
// collateral, borrowed principal, peaks, the liquidation record. The LIVE read
// knows the present — the debt with interest, the oracle, the health verdict.
// The adapter (morphoViewFromSweep) admits the live debt only when the live
// borrow-shares slot equals the replayed one exactly, which is the proof the
// sweep read every row; otherwise the interest split is gated with its reason.

import { useMemo } from "react";

import { MorphoEventCard } from "@/components/protocol/morpho/morpho-event-card";
import { MorphoPositionCard } from "@/components/protocol/morpho/morpho-position-card";
import {
  MorphoClosedPositionExplanation,
  MorphoPositionExplanation,
} from "@/components/protocol/morpho/morpho-position-explanation";
import { MorphoRiskSlot } from "@/components/protocol/morpho/morpho-risk-slot";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { MORPHO_FOLDER_REGISTER, MORPHO_LIQUIDATION_RUNS } from "@/lib/morpho/timeline-runs";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
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
import { computeMorphoEconomics } from "@/lib/morpho/economics";
import { morphoEconomicsExplanation, morphoEconomicsContent } from "@/lib/morpho/economics-explanation";
import { morphoViewFromSweep } from "@/lib/morpho/swept-position-view";
import { MORPHO_BASE_TOWER_VOCABULARY } from "@/lib/morpho-base/position-provenance";
import { summariseExternalActors } from "@/lib/shared/external-actor";
import { isMorphoEvent } from "@/lib/shared/types/event-shape";
import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { LifecyclePill } from "@/components/shared/position-card-pills";
import { WalletPill } from "@/components/shared/wallet-pill";
import { StatValue, StatFootnote, StatDash } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { CARD_VOCAB, notRecordedNote } from "@/lib/shared/card-vocab";
import { marketLabel } from "@/lib/morpho/asset-catalog";

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
   *  only case the shared card and the tower's "all time" are entitled to. */
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
}

export function MorphoBasePositionSection({
  wallet,
  pos,
  chain,
  coverage,
  sweptClean,
  vaultOwner = null,
  grouped = null,
}: MorphoBasePositionSectionProps) {
  const events = useMemo(() => pos.events.filter(isMorphoEvent), [pos.events]);

  const servedRows = useMemo(
    () => (grouped?.grouped && grouped.rowPlan ? interleaveRowPlan(grouped.rowPlan, events) : undefined),
    [grouped, events],
  );
  /** The folders, whole and unfiltered. The tower, the card's counts and the
   *  peaks need nothing from them: the route replayed every row before it
   *  grouped, and those figures ride the replay. */
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

  // The tower is borrower-scoped, as on Ethereum: collateral against debt. A
  // market the wallet only ever LENT in has neither, and an empty tower would
  // assert a borrowable axis the position never used.
  const borrowerSide =
    pos.peakCollateral > 0 || pos.peakBorrowed > 0 || pos.lifetime.deposited > 0 || pos.lifetime.borrowed > 0;
  const towerData = useMemo(
    () =>
      borrowerSide
        ? computeMorphoEconomics(view, undefined, MORPHO_BASE_TOWER_VOCABULARY, {
            deposited: pos.lifetime.deposited,
            collateralWithdrawn: pos.lifetime.collateralWithdrawn,
            collateralLiquidated: pos.lifetime.collateralLiquidated,
            borrowed: pos.lifetime.borrowed,
            repaid: pos.lifetime.repaid,
            // Set where every row carried the market's totals (the index):
            // T3 then states the interest the debt accrued over its life.
            interest: pos.lifetime.interest,
            lastDebtAfter: pos.lifetime.lastDebtAfter,
          })
        : null,
    [borrowerSide, view, pos.lifetime],
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

  const live = chain && !chain.chainStale ? chain : null;

  return (
    <section className="space-y-6">
      {/* A market the wallet only ever LENT in gets the slot card (open) or a
          plain closing statement (closed), not the shared card: that card's
          grammar is a borrower's — collateral against debt, peaks of each —
          and would read "nothing ever borrowed against its collateral" over a
          position that never had collateral. */}
      {sweptClean &&
        !borrowerSide &&
        (live ? (
          <MorphoLenderOpenCard p={live} receipts vault={vaultOwner} />
        ) : (
          <LenderClosedCard pos={pos} wallet={wallet} receipts vault={vaultOwner} />
        ))}
      {sweptClean && borrowerSide && (
        <MorphoPositionCard
          v={{ ...view, vaultOwner }}
          receipts
          viewHref={tl.viewHref}
          session="morpho-base"
          rowExtra={
            view.status === "open" && live && live.healthFactor != null && live.healthFactor > 0 ? (
              <MorphoRiskSlot chain={live} />
            ) : undefined
          }
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

      {sweptClean && towerData && (
        <ChainTruthTower
          data={towerData}
          explanation={morphoEconomicsExplanation(towerData, { onBase: true, lltv: view.lltv, badDebt: view.badDebt })}
          learnMore={morphoEconomicsContent({ onBase: true })}
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
            <MorphoEventCard event={event} eventNumber={meta.eventNumber} isFirst={meta.isFirst} isLast={meta.isLast} />
          ) : null
        }
      />
    </section>
  );
}

const lenderPct = (v: number): string => `${(v * 100).toFixed(2)}%`;

/** A market the wallet only ever LENT in, read live — the shared primitives,
 *  since the shared card's grammar is a borrower's and has no supply axis to
 *  place a lending-only holding on. Supply and its rate are a slot the
 *  singleton always answers fresh, so this draws the live chain read alone;
 *  nothing here comes from the replay. */
export function MorphoLenderOpenCard({
  p,
  receipts = false,
  vault = null,
}: {
  p: MorphoChainPositionResponse;
  receipts?: boolean;
  /** Set when `p.user` is a catalogued MetaMorpho vault — see
   *  MorphoBasePositionSection. */
  vault?: { name: string; href: string } | null;
}) {
  return (
    <PositionCardShell receipts={receipts}>
      <OpenPositionStats
        statusPill={
          receipts ? (
            <span className="font-bold px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
              Supply only
            </span>
          ) : (
            <LifecyclePill status="open" />
          )
        }
        leadingIdentity={
          <span className="flex items-center gap-2 text-xs font-semibold text-rb-500">
            <WalletPill
              wallet={p.user}
              ensName={null}
              filterProtocol="morpho-base"
              bookmarkProtocol="morpho-base"
              vault={vault}
            />
            <span>
              {marketLabel(p.loanSymbol, p.collateralSymbol, p.lltv === 0)}
              {p.lltv > 0 && <span className="ml-2 text-rb-400">LLTV {(p.lltv * 100).toFixed(1)}%</span>}
            </span>
          </span>
        }
        identity={<PositionCardMeta />}
        columns={[
          {
            label: CARD_VOCAB.supply,
            value: (
              <StatValue>
                {/* The market params ARE two addresses and this row already
                    holds them, so the chip is handed the loan token rather
                    than left to find "stkWELL" in the house symbol table —
                    which, Morpho being permissionless, it cannot. */}
                <AssetAmount value={p.currentSupply} symbol={p.loanSymbol} address={p.loanToken} />
              </StatValue>
            ),
            footnote: <StatFootnote>earning {lenderPct(p.supplyApr)}</StatFootnote>,
          },
        ]}
      />
    </PositionCardShell>
  );
}

/** A lender-only market the wallet has fully left — the shared terminal-card
 *  primitives. The replay carries the lifetime SUMS (supplied, withdrawn),
 *  not a peak balance, so the column states what it honestly can: no peak is
 *  on record for this lane, and the footnote says so rather than putting a
 *  sum under a "highest recorded" label it never earned. */
export function LenderClosedCard({
  pos,
  wallet,
  receipts = false,
  vault = null,
}: {
  pos: MorphoSweptPosition;
  wallet: string;
  receipts?: boolean;
  /** Set when `wallet` is a catalogued MetaMorpho vault — see
   *  MorphoBasePositionSection. */
  vault?: { name: string; href: string } | null;
}) {
  const note = <div className="text-xs mt-0.5 text-rb-500">{notRecordedNote("wallet")}</div>;
  return (
    <PositionCardShell receipts={receipts}>
      <ClosedPositionStats
        outcome="closed"
        leadingIdentity={
          <span className="flex items-center gap-2 text-xs font-semibold text-rb-500">
            <WalletPill
              wallet={wallet}
              ensName={null}
              filterProtocol="morpho-base"
              bookmarkProtocol="morpho-base"
              vault={vault}
            />
            <span>
              {pos.marketLabel}
              {pos.lltv > 0 && <span className="ml-2 text-rb-400">LLTV {(pos.lltv * 100).toFixed(1)}%</span>}
            </span>
          </span>
        }
        identity={
          <PositionCardMeta lastActivityAt={pos.lastTs} eventCount={pos.txCount} liquidated={pos.everLiquidated} />
        }
        closedAt={pos.lastTs ?? undefined}
        collateralLabel={CARD_VOCAB.peakSupply}
        collateral={<StatDash />}
        collateralFootnote={note}
      />
    </PositionCardShell>
  );
}
