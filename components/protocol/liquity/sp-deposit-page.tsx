"use client";

// A stability-pool deposit's page on Liquity V2 or one of its forks
// (lib/liquity-v2/sp-deployment.ts; Asymmetry, Basedollar, Ebisu), in the three sections
// (rails-ops standards/detail-page-anatomy.md) on Polaris's deposit shell
// (app/(app)/sepolia/polaris/stability-pool/[market]/[id]/deposit-view.tsx):
// the card, the Lifetime flows panel (lib/liquity-v2/sp-flow-timelines.ts,
// decision 0022 as amended 17 Nov 2026), the shared timeline with "Since its
// last touch" in its head slot. The branch pool's getters at head (the
// deployment's chain read, `dep.chainApi`: /api/chain/<deployment>/stability-pool)
// are the card's figures and the flows' pending legs; the index holds the history and the sums. A life longer than
// one read draws the newest SP_FIRST_READ rows with a boundary card, and the
// flows read the life's day rows (/stability-pool/flows/daily). Under
// `event/<id>` the page draws one operation on the shared event page (P4).
// What each liquidation did to the deposit between its touches
// (/stability-pool/liquidations) is a note row per closed stretch and a
// section of the "Since its last touch" row (sp-liquidations.tsx). On Ebisu,
// whose admin withdrew the pools' collateral (`coll_withdrawn_at_block`), the
// newest place that shows gains carries one line saying so.
// A fork's shut-down branch (ui-jobs 608, 612) reads "Shut down" on the card
// with one line on the shutdown and the pools' collateral.

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { FlowHuesContext, PAID_IN_HUES } from "@/components/shared/lifetime-flows-tip";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { sboldDepositorVault } from "@/lib/liquity-v2/sbold";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { LifetimeFlowsPanel, type FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { LifetimeFlowsScrubber } from "@/components/shared/lifetime-flows-scrubber";
import {
  FlowFocusContext,
  useFlowFocusRoot,
  useFlowFocusValue,
  FlowsStoreContext,
} from "@/components/shared/flow-focus-context";
import { CHAIN_TRUTH_DISPLAY_ITEMS, TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import { boldPriceReason, boldStripAsset, useBoldPrice } from "@/lib/liquity-v2/use-bold-price";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { liquityV2SpSizeDims } from "@/lib/liquity-v2/timeline-size";
import { Prov } from "@/components/shared/provenance";
import { LiquityV2DepositCard } from "@/components/protocol/liquity/sp-deposit-card";
import { LiquityV2DepositEventCard } from "@/components/protocol/liquity/sp-event-card";
import { LiquityV2DepositFlowsNote, liquityV2DepositFlowsContent } from "@/components/protocol/liquity/sp-flows-note";
import { LiquityV2DepositSinceTouchRow } from "@/components/protocol/liquity/sp-since-touch";
import { SpOpenStretchLiquidations } from "@/components/protocol/liquity/sp-liquidations";
import {
  spBranchCheck,
  spLiquidationNotes,
  spNotesOnRows,
  statedWithdrawalBlock,
} from "@/lib/liquity-v2/sp-liquidations";
import { fetchLiquityV2DepositChain, type LiquityV2DepositChain } from "@/lib/api/fetch-liquity-v2-sp-chain";
import { spPoolOf, spWalletHref, type SpDeployment } from "@/lib/liquity-v2/sp-deployment";
import { useBranchShutdown } from "@/hooks/useBranchShutdown";
import type { BranchShutdownState } from "@/lib/liquity-fork/shutdown";
import {
  recordedShutdown,
  shutdownDateProv,
  shutdownDay,
  withdrawalDateProv,
} from "@/lib/shared/liquity-family-shutdown";
import { liquityFamilyTerms } from "@/lib/liquity/ltv";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { depositLifetime, depositNow, depositNowFromChain, priceUnits } from "@/lib/liquity-v2/sp-math";
import { spDepositFlows, spDepositFlowsFromDays } from "@/lib/liquity-v2/sp-flow-timelines";
import { SP_FIRST_READ, spTimelineEvent, SP_WHOLE_LIFE_READ } from "@/lib/liquity-v2/sp-timeline-events";
import { spFeedProv } from "@/lib/liquity-v2/sp-provenance";
import { liquityV2DepositEventPage } from "@/lib/liquity-v2/sp-explorer";
import { boundaryFromLimit } from "@/lib/shared/timeline-boundary";
import { decodeEventId } from "@/lib/shared/page-metadata";
import {
  readLiquityV2Sp,
  type LiquityV2DepositDay,
  type LiquityV2DepositDaysResponse,
  type LiquityV2DepositEventRow,
  type LiquityV2DepositLiquidationsResponse,
  type LiquityV2DepositTimelineResponse,
} from "@/lib/sources/api/liquity-v2-sp";

export function SpDepositPage({
  dep,
  branch,
  depositor,
  initial,
}: {
  dep: SpDeployment;
  /** The branch symbol, as the routes key it. */
  branch: string;
  depositor: string;
  initial: LiquityV2DepositTimelineResponse<string> | null;
}) {
  const coll = spPoolOf(dep, branch);
  const S = dep.stable.symbol;
  const v2 = dep.id === "liquity-v2";
  const api = { api: dep.api };
  const [data, setData] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [chain, setChain] = useState<LiquityV2DepositChain | null>(null);
  const [chainSettled, setChainSettled] = useState(false);
  // BOLD's price is Liquity V2's strip alone; a fork's stablecoin has no read.
  const boldPrice = useBoldPrice(v2 ? undefined : null);
  // A fork's branch shutdown (ui-jobs 612): the catalog's record, the live read confirming it.
  const shutdown = useBranchShutdown(dep.id, branch, !v2);
  // The event route draws the timeline alone, its card in page mode.
  const rawEventId = useParams<{ eventId?: string }>()?.eventId;
  const onEventPage = rawEventId != null;

  // The index lane, where the server's read did not answer.
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    readLiquityV2Sp<LiquityV2DepositTimelineResponse<string>>(
      "stability-pool/timeline",
      {
        collateralType: branch,
        wallet: depositor,
        order: "desc",
        limit: String(SP_FIRST_READ),
      },
      api,
    )
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
    // `api` is the deployment's, fixed for the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, branch, depositor]);

  const row = data?.position ?? null;
  const open = row?.status === "open";
  const total = data?.totalEvents ?? 0;

  // The chain lane: the pool's getters at head, for an open deposit.
  useEffect(() => {
    if (!open) {
      setChainSettled(true);
      return;
    }
    let cancelled = false;
    fetchLiquityV2DepositChain(branch, depositor, dep)
      .then((c) => !cancelled && !c.chainStale && setChain(c))
      .catch(() => undefined)
      .finally(() => !cancelled && setChainSettled(true));
    return () => {
      cancelled = true;
    };
  }, [open, branch, depositor, dep]);

  // What each liquidation did to the deposit between its touches
  // (/stability-pool/liquidations). Any answer but a 200 — the route absent
  // on the api, a 503 before the capture has a tip or while the branch's
  // replay does not hold — leaves the page as it is without it. A deployment
  // whose record says it serves no such route reads nothing.
  const [liqRead, setLiqRead] = useState<LiquityV2DepositLiquidationsResponse<string> | null>(null);
  useEffect(() => {
    if (!dep.liquidations) return;
    let cancelled = false;
    readLiquityV2Sp<LiquityV2DepositLiquidationsResponse<string>>(
      "stability-pool/liquidations",
      { collateralType: branch, wallet: depositor },
      api,
    )
      .then((d) => !cancelled && Array.isArray(d?.stretches) && setLiqRead(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // `api` is the deployment's, fixed for the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, depositor, dep.liquidations]);
  // The admin's withdrawal the page states: the answer's block where the
  // catalog's record names the same one (statedWithdrawalBlock).
  const withdrawnAt = statedWithdrawalBlock(
    liqRead?.coll_withdrawn_at_block,
    recordedShutdown(dep.id, branch)?.withdrawal?.block,
  );
  const liqNotes = useMemo(
    () => (liqRead ? spLiquidationNotes(branch, coll.pool, liqRead, dep, withdrawnAt) : NO_NOTES),
    [liqRead, branch, coll.pool, dep, withdrawnAt],
  );
  // The open stretch, where it starts at the touch the timeline holds as newest.
  const openStretch =
    liqRead?.since_last_touch && liqRead.since_last_touch.from.event_key === data?.rows?.[0]?.event_key
      ? liqRead.since_last_touch
      : null;

  // The whole life, oldest first: the first read where it held every row,
  // else one read of up to SP_WHOLE_LIFE_READ; past that, the day rows.
  const firstRows = data?.rows;
  const firstWhole = firstRows != null && firstRows.length >= total;
  const [lifeRows, setLifeRows] = useState<LiquityV2DepositEventRow<string>[] | null>(null);
  const [lifeRead, setLifeRead] = useState<FlowsRead>("reading");
  const [lifeDays, setLifeDays] = useState<LiquityV2DepositDay[] | null>(null);
  useEffect(() => {
    if (firstRows == null || firstWhole) return;
    let cancelled = false;
    if (total > SP_WHOLE_LIFE_READ) {
      readLiquityV2Sp<LiquityV2DepositDaysResponse<string>>(
        "stability-pool/flows/daily",
        { collateralType: branch, wallet: depositor },
        api,
      )
        .then((d) => {
          if (cancelled) return;
          setLifeDays(d.days);
          setLifeRead("done");
        })
        .catch(() => !cancelled && setLifeRead("failed"));
    } else {
      readLiquityV2Sp<LiquityV2DepositTimelineResponse<string>>(
        "stability-pool/timeline",
        { collateralType: branch, wallet: depositor, order: "asc", limit: String(SP_WHOLE_LIFE_READ) },
        api,
      )
        .then((d) => {
          if (cancelled) return;
          setLifeRows(d.rows);
          setLifeRead("done");
        })
        .catch(() => !cancelled && setLifeRead("failed"));
    }
    return () => {
      cancelled = true;
    };
    // `api` is the deployment's, fixed for the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstRows, firstWhole, total, branch, depositor]);
  const wholeAsc = useMemo(
    () => (firstWhole && firstRows ? [...firstRows].reverse() : lifeRows),
    [firstWhole, firstRows, lifeRows],
  );
  // The timeline's rows: the whole life where the page holds it, else the
  // newest the first read brought.
  const listed = useMemo(() => wholeAsc ?? (firstRows ? [...firstRows].reverse() : []), [wholeAsc, firstRows]);
  const rowById = useMemo(() => new Map(listed.map((r) => [r.event_key, r])), [listed]);
  // Each liquidations note between two touches the page holds, under its
  // closing touch.
  const liqNotesOnRows = useMemo(() => spNotesOnRows(liqNotes, (k) => rowById.has(k)), [liqNotes, rowById]);
  const events = useMemo(() => listed.map((r) => spTimelineEvent(r, dep.chainId)), [listed, dep.chainId]);
  const olderCount = Math.max(0, total - listed.length);
  const lastTouch = listed.length > 0 ? listed[listed.length - 1] : null;
  // The deposit's one operation is its open: the window is its whole life.
  const sinceOpen = olderCount === 0 && listed.length === 1;

  const lifetime = useMemo(() => (row ? depositLifetime(row) : null), [row]);
  // The flows and the head row lay the chain over the index only where the
  // two agree on the last touch; the card's headlines are the chain's alone.
  const now = useMemo(() => (lifetime && chain && open ? depositNow(lifetime, chain) : null), [lifetime, chain, open]);
  const cardNow = useMemo(() => (chain && open ? depositNowFromChain(chain) : null), [chain, open]);

  // The admin's withdrawal of the pool's collateral (Ebisu): one line, beside
  // the newest gains the page shows. The "Since its last touch" row's section
  // where it draws with liquidations, else the newest closed stretch's note.
  const withdrawn = withdrawnAt != null;
  const openWithLiqs = Boolean(now && lifetime && chain && openStretch && openStretch.liquidations.length > 0);
  const liqNotesShown = useMemo(() => {
    if (!withdrawn || openWithLiqs) return liqNotesOnRows;
    let at = -1;
    liqNotesOnRows.forEach((n, i) => n.stretch.liquidations.length > 0 && (at = i));
    return at < 0 ? liqNotesOnRows : liqNotesOnRows.map((n, i) => (i === at ? { ...n, withdrawalLine: true } : n));
  }, [liqNotesOnRows, withdrawn, openWithLiqs]);

  // Set on mount, so the server's render and the first client render agree.
  const [nowSec, setNowSec] = useState<number | null>(null);
  useEffect(() => setNowSec(Math.floor(Date.now() / 1000)), []);
  const flowsReady = (wholeAsc != null || lifeDays != null) && nowSec != null && (!open || chainSettled);
  const flows = useMemo(
    () =>
      !flowsReady || nowSec == null
        ? null
        : wholeAsc
          ? spDepositFlows(branch, wholeAsc, { open, now, nowSec }, dep)
          : lifeDays
            ? spDepositFlowsFromDays(branch, lifeDays, { open, now, nowSec }, dep)
            : null,
    [flowsReady, wholeAsc, lifeDays, nowSec, open, branch, now, dep],
  );
  const flowFocus = useFlowFocusValue(useFlowFocusRoot(flows?.focus ?? NO_FOCUS), flows?.timeline ?? null);
  const flowsRead: FlowsRead = flowsReady
    ? "done"
    : lifeRead === "withheld" || lifeRead === "failed"
      ? lifeRead
      : "reading";
  // The whole life is still being read: no boundary card for rows about to land.
  const lifePending = !firstWhole && total <= SP_WHOLE_LIFE_READ && lifeRows == null && lifeRead === "reading";

  // "Deposited (BOLD)": each touch's top-up or withdrawal (ui-jobs 752).
  const sizeDims = useMemo(() => liquityV2SpSizeDims((e) => rowById.get(e.id)?.top_up_or_withdrawal, S), [rowById, S]);
  const tl = useTimelineEvents(events, {
    storageKey: `${dep.id}-sp-${branch}-${depositor}`,
    protocolKey: `${dep.id}-sp`,
    olderCount,
    size: sizeDims,
  });
  const boundary = useMemo(() => {
    const oldest = tl.sortedEvents[0];
    if (olderCount === 0 || !oldest || lifePending) return null;
    return boundaryFromLimit({
      total,
      listed: listed.length,
      cutBlock: oldest.blockNumber,
      cutAt: oldest.timestamp,
      state: null,
    });
  }, [olderCount, total, listed.length, tl.sortedEvents, lifePending]);
  // An event older than the first read's rows waits for the whole life before
  // the timeline says it is not found; where that read failed, the page says
  // so in place of the timeline.
  const pinnedMissing = rawEventId != null && !rowById.has(decodeEventId(rawEventId));
  const pinnedWaits = pinnedMissing && lifePending;
  const pinnedUnread = pinnedMissing && lifeRead === "failed";

  // The branch collateral at its price feed, the price the head row values the
  // collateral paid in at; BOLD as the Trove page lists it, from the Curve
  // BOLD/USDC pool (ui-jobs 746).
  const price = chain ? priceUnits(chain.priceRaw) : null;
  const stripAssets: LatestPriceAsset[] = [
    ...(price != null && chain
      ? [
          {
            symbol: coll.symbol,
            address: coll.collateralAddr,
            price,
            label: `${coll.symbol} at the branch price feed`,
            triggerLabel: coll.symbol,
            info: spFeedProv(branch, chain.priceStale, dep),
          },
        ]
      : []),
    ...(v2 ? [boldStripAsset(boldPrice)] : []),
  ];

  if (!data && !failed) return <DetailBodySkeleton />;
  if (!row)
    return (
      <div className="py-8 text-sm text-rb-500">
        The index did not answer for this deposit just now. Reload the page to try again.
      </div>
    );

  return (
    // The store from the first render, so the panel says it is reading and the
    // timeline holds its Date pill back (FlowsStoreContext, ui-jobs 764).
    <FlowsStoreContext.Provider value={flowFocus.store}>
      <FlowFocusContext.Provider value={flows ? flowFocus : null}>
        {/* The collateral bar is paid in: violet, as on Polaris's deposit
          (Miles, 17 Nov 2026). */}
        <FlowHuesContext.Provider value={PAID_IN_HUES}>
          <div className="py-8 space-y-6" style={PAID_IN_VARS}>
            <DetailTopRow
              session={dep.session as SessionProtocol}
              wallet={depositor}
              owner={{
                wallet: depositor,
                href: spWalletHref(dep, depositor),
                vault: v2 ? sboldDepositorVault(depositor) : undefined,
              }}
              fallbackHref={dep.spPath}
              assets={stripAssets}
              priceReason={v2 ? boldPriceReason(boldPrice) : undefined}
              closed={!open}
              tools={false}
            />
            {!onEventPage && (
              <>
                <LiquityV2DepositCard
                  row={row}
                  dep={dep}
                  shutdown={shutdown}
                  lifetime={lifetime}
                  now={cardNow}
                  pending={open && !chainSettled}
                  indexBehind={open && chain != null && lifetime != null && now == null}
                  pool={
                    chain?.totalDepositsRaw != null
                      ? { totalRaw: BigInt(chain.totalDepositsRaw), block: chain.blockNumber }
                      : null
                  }
                  explanation={
                    <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-rb-500">
                      <li>
                        A deposit in the {branch} Stability Pool repays the {S} debt of liquidated {branch} Troves. Each
                        liquidation burns a share of every deposit and pays {branch} in its place.
                      </li>
                      <li>
                        The branch&rsquo;s interest pays the pool a {S} yield. A touch that claims sends the yield and
                        the {branch}; one that does not adds the yield to the deposit and stashes the {branch}.
                      </li>
                      <li>The deposit now and the pending gains are the pool&rsquo;s current figures.</li>
                      {shutdown && <ShutdownLine dep={dep} symbol={branch} state={shutdown} />}
                    </ul>
                  }
                />
                <LifetimeFlowsPanel
                  scrubber={flows ? <LifetimeFlowsScrubber timeline={flows.timeline} /> : null}
                  read={flowsRead}
                  explanation={
                    <div className="space-y-2 text-sm text-rb-500">
                      <LiquityV2DepositFlowsNote coll={branch} stable={S} />
                    </div>
                  }
                  learnMore={liquityV2DepositFlowsContent(branch, S, dep.docs)}
                />
              </>
            )}
            {(failed || pinnedUnread) && (
              <p className="text-sm text-rb-500">The operations could not be read just now.</p>
            )}
            {pinnedWaits ? (
              <DetailBodySkeleton />
            ) : pinnedUnread ? null : (
              <ChainTruthTimeline
                persistKeyPrefix={`${dep.id}-sp`}
                closed={!open}
                tl={tl}
                boundary={boundary}
                // The whole life is read on arrival up to SP_WHOLE_LIFE_READ: the
                // cut-page notice says so while it is in flight.
                loadOlder={lifePending ? { state: "loading", load: () => {} } : undefined}
                displayItems={CHAIN_TRUTH_DISPLAY_ITEMS}
                emptyLabel="No operations recorded for this deposit"
                notes={liqNotesShown}
                toolbarLeading={
                  <TimelineActivityHeader
                    events={events}
                    closed={!open}
                    firstAt={Number(row.first_timestamp)}
                    tenurePending={false}
                  />
                }
                liveWindow={
                  now && lifetime && chain
                    ? () => (
                        <LiquityV2DepositSinceTouchRow
                          branch={branch}
                          dep={dep}
                          recorded={lifetime.recorded}
                          burned={now.pendingLoss}
                          now={now.now}
                          gain={now.pendingYield}
                          stash={lifetime.stash}
                          paidIn={now.collSinceTouch}
                          price={price}
                          priceStale={chain.priceStale}
                          fromBlock={Number(lastTouch?.block_number ?? row.last_block)}
                          fromAt={Number(lastTouch?.block_timestamp ?? row.last_timestamp)}
                          toAt={chain.blockTimestamp}
                          headBlock={chain.blockNumber}
                          sinceOpen={sinceOpen}
                          liquidations={
                            openStretch && liqRead ? (
                              <SpOpenStretchLiquidations
                                dep={dep}
                                branch={branch}
                                stretch={openStretch}
                                servedThru={liqRead.served_thru_block}
                                check={spBranchCheck(liqRead)}
                                withdrawalLine={withdrawn && openWithLiqs}
                                withdrawnAtBlock={liqRead.coll_withdrawn_at_block}
                              />
                            ) : undefined
                          }
                        />
                      )
                    : undefined
                }
                eventPage={(slot) =>
                  liquityV2DepositEventPage({ ...slot, branch, depositor, row: rowById.get(slot.event.id), dep })
                }
                renderCard={(event, meta) => {
                  const r = rowById.get(event.id);
                  return r ? (
                    <LiquityV2DepositEventCard row={r} isLast={meta.isLast} eventNumber={meta.eventNumber} dep={dep} />
                  ) : null;
                }}
              />
            )}
            <ProvInspectorLayer />
          </div>
        </FlowHuesContext.Provider>
      </FlowFocusContext.Provider>
    </FlowsStoreContext.Provider>
  );
}

/** A shut-down branch's line in the card's explanation (ui-jobs 608, 612):
 *  the shutdown and, where the record holds it, the admin's withdrawal of the
 *  pools' collateral, each date with its receipt. The deposit still reads at
 *  head and can be withdrawn (rails-ops TO-DO-stability-pool-deposits §3.2). */
function ShutdownLine({ dep, symbol, state }: { dep: SpDeployment; symbol: string; state: BranchShutdownState }) {
  const terms = liquityFamilyTerms(dep.id);
  const day = <Prov info={shutdownDateProv(dep.id, symbol, state, { trove: false })}>{shutdownDay(state.at)}</Prov>;
  const w = state.record?.withdrawal;
  const wProv = state.record ? withdrawalDateProv(dep.id, symbol, state.record) : null;
  let line: ReactNode;
  if (state.record && w && wProv)
    line = (
      <>
        The {terms.branch}&rsquo;s {state.record.by} shut it down on {day}. Every pool has held 0 collateral since{" "}
        <Prov info={wProv}>{shutdownDay(w.at)}</Prov>; the deposit can still be withdrawn.
      </>
    );
  else
    line = (
      <>
        The {terms.branch} shut down on {day}; the deposit can still be withdrawn.
      </>
    );
  return (
    <li data-sp-shutdown="" data-anatomy="C6.1">
      {line}
    </li>
  );
}

const NO_FOCUS: never[] = [];
const NO_NOTES: never[] = [];

/** The second side's hue for the parts drawn from CSS (the chart, the events
 *  row, the line's label): violet-400, violet-700 for the label on the light
 *  surface. */
const PAID_IN_VARS = {
  "--flow-debt": PAID_IN_HUES.debt.solid,
  "--flow-debt-label": "var(--color-violet-700)",
} as CSSProperties;
