"use client";

// A Liquity V2 stability-pool deposit's page, in the three sections
// (rails-ops standards/detail-page-anatomy.md) on Polaris's deposit shell
// (app/(app)/sepolia/polaris/stability-pool/[market]/[id]/deposit-view.tsx):
// the card, the Lifetime flows panel (lib/liquity-v2/sp-flow-timelines.ts,
// decision 0022 as amended 17 Nov 2026), the shared timeline with "Since its
// last touch" in its head slot. The branch pool's getters at head
// (/api/chain/liquity-v2/stability-pool) are the card's figures and the flows'
// pending legs; the index holds the history and the sums. A life longer than
// one read draws the newest SP_FIRST_READ rows with a boundary card, and the
// flows read the life's day rows (/stability-pool/flows/daily). Under
// `event/<id>` the page draws one operation on the shared event page (P4).
// What each liquidation did to the deposit between its touches
// (/stability-pool/liquidations) is a note row per closed stretch and a
// section of the "Since its last touch" row (sp-liquidations.tsx).

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import { FlowHuesContext, PAID_IN_HUES } from "@/components/shared/lifetime-flows-tip";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { LifetimeFlowsPanel, type FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { LifetimeFlowsScrubber } from "@/components/shared/lifetime-flows-scrubber";
import { FlowFocusContext, useFlowFocusRoot, useFlowFocusValue } from "@/components/shared/flow-focus-context";
import { CHAIN_TRUTH_DISPLAY_ITEMS, TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import { boldPriceReason, boldStripAsset, useBoldPrice } from "@/lib/liquity-v2/use-bold-price";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { LiquityV2DepositCard } from "@/components/protocol/liquity/sp-deposit-card";
import { LiquityV2DepositEventCard } from "@/components/protocol/liquity/sp-event-card";
import { LiquityV2DepositFlowsNote, liquityV2DepositFlowsContent } from "@/components/protocol/liquity/sp-flows-note";
import { LiquityV2DepositSinceTouchRow } from "@/components/protocol/liquity/sp-since-touch";
import { SpOpenStretchLiquidations } from "@/components/protocol/liquity/sp-liquidations";
import { spBranchCheck, spLiquidationNotes, spNotesOnRows } from "@/lib/liquity-v2/sp-liquidations";
import { LIQUITY_V2_SP_POOLS } from "@/lib/liquity-v2/sp-catalog";
import { fetchLiquityV2DepositChain, type LiquityV2DepositChain } from "@/lib/api/fetch-liquity-v2-sp-chain";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { LIQUITY_V2_SP_PATH, type SpBranch } from "@/lib/liquity-v2/sp-routes";
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

export default function DepositView({
  branch,
  depositor,
  initial,
}: {
  branch: SpBranch;
  depositor: string;
  initial: LiquityV2DepositTimelineResponse | null;
}) {
  const coll = LIQUITY_V2_BRANCHES[branch.toLowerCase()];
  const [data, setData] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [chain, setChain] = useState<LiquityV2DepositChain | null>(null);
  const [chainSettled, setChainSettled] = useState(false);
  const boldPrice = useBoldPrice();
  // The event route draws the timeline alone, its card in page mode.
  const rawEventId = useParams<{ eventId?: string }>()?.eventId;
  const onEventPage = rawEventId != null;

  // The index lane, where the server's read did not answer.
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    readLiquityV2Sp<LiquityV2DepositTimelineResponse>("stability-pool/timeline", {
      collateralType: branch,
      wallet: depositor,
      order: "desc",
      limit: String(SP_FIRST_READ),
    })
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
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
    fetchLiquityV2DepositChain(branch, depositor)
      .then((c) => !cancelled && !c.chainStale && setChain(c))
      .catch(() => undefined)
      .finally(() => !cancelled && setChainSettled(true));
    return () => {
      cancelled = true;
    };
  }, [open, branch, depositor]);

  // What each liquidation did to the deposit between its touches
  // (/stability-pool/liquidations). Any answer but a 200 — the route absent
  // on the api, a 503 before the capture has a tip or while the branch's
  // replay does not hold — leaves the page as it is without it.
  const [liqRead, setLiqRead] = useState<LiquityV2DepositLiquidationsResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    readLiquityV2Sp<LiquityV2DepositLiquidationsResponse>("stability-pool/liquidations", {
      collateralType: branch,
      wallet: depositor,
    })
      .then((d) => !cancelled && Array.isArray(d?.stretches) && setLiqRead(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [branch, depositor]);
  const liqNotes = useMemo(
    () => (liqRead ? spLiquidationNotes(branch, LIQUITY_V2_SP_POOLS[branch], liqRead) : NO_NOTES),
    [liqRead, branch],
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
  const [lifeRows, setLifeRows] = useState<LiquityV2DepositEventRow[] | null>(null);
  const [lifeRead, setLifeRead] = useState<FlowsRead>("reading");
  const [lifeDays, setLifeDays] = useState<LiquityV2DepositDay[] | null>(null);
  useEffect(() => {
    if (firstRows == null || firstWhole) return;
    let cancelled = false;
    if (total > SP_WHOLE_LIFE_READ) {
      readLiquityV2Sp<LiquityV2DepositDaysResponse>("stability-pool/flows/daily", {
        collateralType: branch,
        wallet: depositor,
      })
        .then((d) => {
          if (cancelled) return;
          setLifeDays(d.days);
          setLifeRead("done");
        })
        .catch(() => !cancelled && setLifeRead("failed"));
    } else {
      readLiquityV2Sp<LiquityV2DepositTimelineResponse>("stability-pool/timeline", {
        collateralType: branch,
        wallet: depositor,
        order: "asc",
        limit: String(SP_WHOLE_LIFE_READ),
      })
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
  const liqNotesShown = useMemo(() => spNotesOnRows(liqNotes, (k) => rowById.has(k)), [liqNotes, rowById]);
  const events = useMemo(() => listed.map(spTimelineEvent), [listed]);
  const olderCount = Math.max(0, total - listed.length);
  const lastTouch = listed.length > 0 ? listed[listed.length - 1] : null;
  // The deposit's one operation is its open: the window is its whole life.
  const sinceOpen = olderCount === 0 && listed.length === 1;

  const lifetime = useMemo(() => (row ? depositLifetime(row) : null), [row]);
  // The flows and the head row lay the chain over the index only where the
  // two agree on the last touch; the card's headlines are the chain's alone.
  const now = useMemo(() => (lifetime && chain && open ? depositNow(lifetime, chain) : null), [lifetime, chain, open]);
  const cardNow = useMemo(() => (chain && open ? depositNowFromChain(chain) : null), [chain, open]);

  // Set on mount, so the server's render and the first client render agree.
  const [nowSec, setNowSec] = useState<number | null>(null);
  useEffect(() => setNowSec(Math.floor(Date.now() / 1000)), []);
  const flowsReady = (wholeAsc != null || lifeDays != null) && nowSec != null && (!open || chainSettled);
  const flows = useMemo(
    () =>
      !flowsReady || nowSec == null
        ? null
        : wholeAsc
          ? spDepositFlows(branch, wholeAsc, { open, now, nowSec })
          : lifeDays
            ? spDepositFlowsFromDays(branch, lifeDays, { open, now, nowSec })
            : null,
    [flowsReady, wholeAsc, lifeDays, nowSec, open, branch, now],
  );
  const flowFocus = useFlowFocusValue(useFlowFocusRoot(flows?.focus ?? NO_FOCUS), flows?.timeline ?? null);
  const flowsRead: FlowsRead = flowsReady
    ? "done"
    : lifeRead === "withheld" || lifeRead === "failed"
      ? lifeRead
      : "reading";
  // The whole life is still being read: no boundary card for rows about to land.
  const lifePending = !firstWhole && total <= SP_WHOLE_LIFE_READ && lifeRows == null && lifeRead === "reading";

  const tl = useTimelineEvents(events, {
    storageKey: `liquity-v2-sp-${branch}-${depositor}`,
    protocolKey: "liquity-v2-sp",
    olderCount,
    // Navigated by the Lifetime flows cursor through "Sync to chart": no Dates.
    dates: false,
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
            info: spFeedProv(branch, chain.priceStale),
          },
        ]
      : []),
    boldStripAsset(boldPrice),
  ];

  if (!data && !failed) return <DetailBodySkeleton />;
  if (!row)
    return (
      <div className="py-8 text-sm text-rb-500">
        The index did not answer for this deposit just now. Reload the page to try again.
      </div>
    );

  return (
    <FlowFocusContext.Provider value={flows ? flowFocus : null}>
      {/* The collateral bar is paid in: violet, as on Polaris's deposit
          (Miles, 17 Nov 2026). */}
      <FlowHuesContext.Provider value={PAID_IN_HUES}>
        <div className="py-8 space-y-6" style={PAID_IN_VARS}>
          <DetailTopRow
            session="liquity-v2"
            wallet={depositor}
            owner={{ wallet: depositor, href: `${LIQUITY_V2_SP_PATH}?q=${depositor}` }}
            fallbackHref={LIQUITY_V2_SP_PATH}
            assets={stripAssets}
            priceReason={boldPriceReason(boldPrice)}
            closed={!open}
            tools={false}
          />
          {!onEventPage && (
            <>
              <LiquityV2DepositCard
                row={row}
                lifetime={lifetime}
                now={cardNow}
                pending={open && !chainSettled}
                pool={
                  chain?.totalDepositsRaw != null
                    ? { totalRaw: BigInt(chain.totalDepositsRaw), block: chain.blockNumber }
                    : null
                }
                explanation={
                  <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-rb-500">
                    <li>
                      A deposit in the {branch} Stability Pool repays the BOLD debt of liquidated {branch} Troves. Each
                      liquidation burns a share of every deposit and pays {branch} in its place.
                    </li>
                    <li>
                      The branch&rsquo;s interest pays the pool a BOLD yield. A touch that claims sends the yield and
                      the {branch}; one that does not adds the yield to the deposit and stashes the {branch}.
                    </li>
                    <li>The deposit now and the pending gains are the pool&rsquo;s current figures.</li>
                  </ul>
                }
              />
              <LifetimeFlowsPanel
                scrubber={flows ? <LifetimeFlowsScrubber timeline={flows.timeline} /> : null}
                read={flowsRead}
                explanation={
                  <div className="space-y-2 text-sm text-rb-500">
                    <LiquityV2DepositFlowsNote coll={branch} />
                  </div>
                }
                learnMore={liquityV2DepositFlowsContent(branch)}
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
              persistKeyPrefix="liquity-v2-sp"
              closed={!open}
              tl={tl}
              boundary={boundary}
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
                              branch={branch}
                              stretch={openStretch}
                              servedThru={liqRead.served_thru_block}
                              check={spBranchCheck(liqRead)}
                            />
                          ) : undefined
                        }
                      />
                    )
                  : undefined
              }
              eventPage={(slot) =>
                liquityV2DepositEventPage({ ...slot, branch, depositor, row: rowById.get(slot.event.id) })
              }
              renderCard={(event, meta) => {
                const r = rowById.get(event.id);
                return r ? (
                  <LiquityV2DepositEventCard row={r} isLast={meta.isLast} eventNumber={meta.eventNumber} />
                ) : null;
              }}
            />
          )}
          <ProvInspectorLayer />
        </div>
      </FlowHuesContext.Provider>
    </FlowFocusContext.Provider>
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
