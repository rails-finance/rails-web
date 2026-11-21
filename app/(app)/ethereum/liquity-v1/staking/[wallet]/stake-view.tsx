"use client";

// A Liquity V1 LQTY stake's page, in the three sections (rails-ops
// standards/detail-page-anatomy.md) on the deposit page's shell
// (../../stability-pool/[wallet]/deposit-view.tsx): the card, the Lifetime
// flows panel (lib/liquity-v1/staking-flow-timelines.ts), the shared timeline
// with "Since its last touch" in its head slot. LQTYStaking's getters at head
// (/api/chain/liquity-v1/staking) are the card's figures and the flows'
// pending leg; the index holds the history and the sums. A life longer than
// one read draws the newest ST_FIRST_READ rows with a boundary card, and the
// flows read the life's day rows (/staking/flows/daily). Under `event/<id>`
// the page draws one touch on the shared event page (P4).

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import { FlowHuesContext, PAID_IN_HUES } from "@/components/shared/lifetime-flows-tip";
import { DetailTopRow } from "@/components/shared/detail-back-row";
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
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { LiquityV1StakeCard } from "@/components/protocol/liquity/v1-staking-card";
import { LiquityV1StakeEventCard } from "@/components/protocol/liquity/v1-staking-event-card";
import {
  LiquityV1StakeFlowsNote,
  liquityV1StakeFlowsContent,
} from "@/components/protocol/liquity/v1-staking-flows-note";
import { LiquityV1StakeSinceTouchRow } from "@/components/protocol/liquity/v1-staking-since-touch";
import { fetchLiquityV1StakeChain, type LiquityV1StakeChain } from "@/lib/api/fetch-liquity-v1-staking-chain";
import { NATIVE } from "@/lib/shared/asset-roster";
import { LIQUITY_V1_STAKING_PATH } from "@/lib/liquity-v1/staking-routes";
import { priceUnits, stakeLifetime, stakeNow, stakeNowFromChain } from "@/lib/liquity-v1/staking-math";
import { stStakeFlows, stStakeFlowsFromDays } from "@/lib/liquity-v1/staking-flow-timelines";
import { ST_FIRST_READ, stTimelineEvent, ST_WHOLE_LIFE_READ } from "@/lib/liquity-v1/staking-timeline-events";
import { liquityV1StakeSizeDims } from "@/lib/liquity-v1/staking-timeline-size";
import { stFeedProv } from "@/lib/liquity-v1/staking-provenance";
import { liquityV1StakeEventPage } from "@/lib/liquity-v1/staking-explorer";
import { boundaryFromLimit } from "@/lib/shared/timeline-boundary";
import { decodeEventId } from "@/lib/shared/page-metadata";
import {
  readLiquityV1Staking,
  type LiquityV1StakeDay,
  type LiquityV1StakeDaysResponse,
  type LiquityV1StakeEventRow,
  type LiquityV1StakeTimelineResponse,
} from "@/lib/sources/api/liquity-v1-staking";

export default function StakeView({
  staker,
  initial,
}: {
  staker: string;
  initial: LiquityV1StakeTimelineResponse | null;
}) {
  const [data, setData] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [chain, setChain] = useState<LiquityV1StakeChain | null>(null);
  const [chainSettled, setChainSettled] = useState(false);
  // The event route draws the timeline alone, its card in page mode.
  const rawEventId = useParams<{ eventId?: string }>()?.eventId;
  const onEventPage = rawEventId != null;

  // The index lane, where the server's read did not answer.
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    readLiquityV1Staking<LiquityV1StakeTimelineResponse>("staking/timeline", {
      wallet: staker,
      order: "desc",
      limit: String(ST_FIRST_READ),
    })
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [initial, staker]);

  const row = data?.position ?? null;
  const open = row?.status === "open";
  const total = data?.totalEvents ?? 0;

  // The chain lane: LQTYStaking's getters at head, for an open stake.
  useEffect(() => {
    if (!open) {
      setChainSettled(true);
      return;
    }
    let cancelled = false;
    fetchLiquityV1StakeChain(staker)
      .then((c) => !cancelled && !c.chainStale && setChain(c))
      .catch(() => undefined)
      .finally(() => !cancelled && setChainSettled(true));
    return () => {
      cancelled = true;
    };
  }, [open, staker]);

  // The whole life, oldest first: the first read where it held every row,
  // else one read of up to ST_WHOLE_LIFE_READ; past that, the day rows.
  const firstRows = data?.rows;
  const firstWhole = firstRows != null && firstRows.length >= total;
  const [lifeRows, setLifeRows] = useState<LiquityV1StakeEventRow[] | null>(null);
  const [lifeRead, setLifeRead] = useState<FlowsRead>("reading");
  const [lifeDays, setLifeDays] = useState<LiquityV1StakeDay[] | null>(null);
  useEffect(() => {
    if (firstRows == null || firstWhole) return;
    let cancelled = false;
    if (total > ST_WHOLE_LIFE_READ) {
      readLiquityV1Staking<LiquityV1StakeDaysResponse>("staking/flows/daily", { wallet: staker })
        .then((d) => {
          if (cancelled) return;
          setLifeDays(d.days);
          setLifeRead("done");
        })
        .catch(() => !cancelled && setLifeRead("failed"));
    } else {
      readLiquityV1Staking<LiquityV1StakeTimelineResponse>("staking/timeline", {
        wallet: staker,
        order: "asc",
        limit: String(ST_WHOLE_LIFE_READ),
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
  }, [firstRows, firstWhole, total, staker]);
  const wholeAsc = useMemo(
    () => (firstWhole && firstRows ? [...firstRows].reverse() : lifeRows),
    [firstWhole, firstRows, lifeRows],
  );
  // The timeline's rows: the whole life where the page holds it, else the
  // newest the first read brought.
  const listed = useMemo(() => wholeAsc ?? (firstRows ? [...firstRows].reverse() : []), [wholeAsc, firstRows]);
  const rowById = useMemo(() => new Map(listed.map((r) => [r.event_key, r])), [listed]);
  const events = useMemo(() => listed.map(stTimelineEvent), [listed]);
  const olderCount = Math.max(0, total - listed.length);
  const lastTouch = listed.length > 0 ? listed[listed.length - 1] : null;
  // The stake's one touch is its open: the window is its whole life.
  const sinceOpen = olderCount === 0 && listed.length === 1;

  const lifetime = useMemo(() => (row ? stakeLifetime(row) : null), [row]);
  // The flows and the head row lay the chain over the index only where the
  // two agree on the last touch; the card's headlines are the chain's alone.
  const now = useMemo(() => (lifetime && chain && open ? stakeNow(lifetime, chain) : null), [lifetime, chain, open]);
  const cardNow = useMemo(() => (chain && open ? stakeNowFromChain(chain) : null), [chain, open]);

  // Set on mount, so the server's render and the first client render agree.
  const [nowSec, setNowSec] = useState<number | null>(null);
  useEffect(() => setNowSec(Math.floor(Date.now() / 1000)), []);
  const flowsReady = (wholeAsc != null || lifeDays != null) && nowSec != null && (!open || chainSettled);
  const flows = useMemo(
    () =>
      !flowsReady || nowSec == null
        ? null
        : wholeAsc
          ? stStakeFlows(wholeAsc, { open, now, nowSec })
          : lifeDays
            ? stStakeFlowsFromDays(lifeDays, { open, now, nowSec })
            : null,
    [flowsReady, wholeAsc, lifeDays, nowSec, open, now],
  );
  const flowFocus = useFlowFocusValue(useFlowFocusRoot(flows?.focus ?? NO_FOCUS), flows?.timeline ?? null);
  const flowsRead: FlowsRead = flowsReady
    ? "done"
    : lifeRead === "withheld" || lifeRead === "failed"
      ? lifeRead
      : "reading";
  // The whole life is still being read: no boundary card for rows about to land.
  const lifePending = !firstWhole && total <= ST_WHOLE_LIFE_READ && lifeRows == null && lifeRead === "reading";

  // "Staked (LQTY)": each touch's stake or unstake.
  const sizeDims = useMemo(() => liquityV1StakeSizeDims((e) => rowById.get(e.id)?.stake_change), [rowById]);
  const tl = useTimelineEvents(events, {
    storageKey: `liquity-v1-st-${staker}`,
    protocolKey: "liquity-v1-st",
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

  // ETH at the protocol's PriceFeed, beside the ETH fees in the strip.
  const price = chain ? priceUnits(chain.priceRaw) : null;
  const stripAssets: LatestPriceAsset[] =
    price != null && chain
      ? [
          {
            symbol: "ETH",
            address: NATIVE,
            price,
            label: "ETH at the Liquity V1 PriceFeed",
            triggerLabel: "ETH",
            info: stFeedProv(chain.priceStale),
          },
        ]
      : [];

  if (!data && !failed) return <DetailBodySkeleton />;
  if (!row)
    return (
      <div className="py-8 text-sm text-rb-500">
        The index did not answer for this stake just now. Reload the page to try again.
      </div>
    );

  return (
    // The store from the first render, so the panel says it is reading and the
    // timeline holds its Date pill back (FlowsStoreContext).
    <FlowsStoreContext.Provider value={flowFocus.store}>
      <FlowFocusContext.Provider value={flows ? flowFocus : null}>
        {/* The LUSD bar is paid in: violet, as on the deposit's ETH bar. */}
        <FlowHuesContext.Provider value={PAID_IN_HUES}>
          <div className="py-8 space-y-6" style={PAID_IN_VARS}>
            <DetailTopRow
              session="liquity-v1"
              wallet={staker}
              owner={{ wallet: staker, href: `${LIQUITY_V1_STAKING_PATH}?q=${staker}` }}
              fallbackHref={LIQUITY_V1_STAKING_PATH}
              assets={stripAssets}
              closed={!open}
              tools={false}
            />
            {!onEventPage && (
              <>
                <LiquityV1StakeCard
                  row={row}
                  lifetime={lifetime}
                  now={cardNow}
                  pending={open && !chainSettled}
                  indexBehind={open && chain != null && lifetime != null && now == null}
                  pool={
                    chain?.totalStakedRaw != null
                      ? { totalRaw: BigInt(chain.totalStakedRaw), block: chain.blockNumber }
                      : null
                  }
                  explanation={
                    <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-rb-500">
                      <li>
                        LQTY staked in LQTYStaking earns a share of the protocol&rsquo;s fees, in proportion to the
                        stake: the borrowing fees in LUSD and the redemption fees in ETH.
                      </li>
                      <li>
                        Every touch, a stake, an unstake or a claim, pays out the fees paid in since the last one. The
                        fees pending are LQTYStaking&rsquo;s current figures.
                      </li>
                    </ul>
                  }
                />
                <LifetimeFlowsPanel
                  scrubber={flows ? <LifetimeFlowsScrubber timeline={flows.timeline} /> : null}
                  read={flowsRead}
                  explanation={
                    <div className="space-y-2 text-sm text-rb-500">
                      <LiquityV1StakeFlowsNote />
                    </div>
                  }
                  learnMore={liquityV1StakeFlowsContent()}
                />
              </>
            )}
            {(failed || pinnedUnread) && <p className="text-sm text-rb-500">The touches could not be read just now.</p>}
            {pinnedWaits ? (
              <DetailBodySkeleton />
            ) : pinnedUnread ? null : (
              <ChainTruthTimeline
                persistKeyPrefix="liquity-v1-st"
                closed={!open}
                tl={tl}
                boundary={boundary}
                // The whole life is read on arrival up to ST_WHOLE_LIFE_READ: the
                // cut-page notice says so while it is in flight.
                loadOlder={lifePending ? { state: "loading", load: () => {} } : undefined}
                displayItems={CHAIN_TRUTH_DISPLAY_ITEMS}
                emptyLabel="No touches recorded for this stake"
                toolbarLeading={
                  <TimelineActivityHeader
                    events={events}
                    closed={!open}
                    firstAt={Number(row.first_timestamp)}
                    tenurePending={false}
                  />
                }
                liveWindow={
                  now && chain
                    ? () => (
                        <LiquityV1StakeSinceTouchRow
                          stake={now.stake}
                          lusd={now.pendingLusd}
                          eth={now.pendingEth}
                          fromBlock={Number(lastTouch?.block_number ?? row.last_block)}
                          fromAt={Number(lastTouch?.block_timestamp ?? row.last_timestamp)}
                          toAt={chain.blockTimestamp}
                          sinceOpen={sinceOpen}
                        />
                      )
                    : undefined
                }
                eventPage={(slot) => liquityV1StakeEventPage({ ...slot, staker, row: rowById.get(slot.event.id) })}
                renderCard={(event, meta) => {
                  const r = rowById.get(event.id);
                  return r ? (
                    <LiquityV1StakeEventCard row={r} isLast={meta.isLast} eventNumber={meta.eventNumber} />
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

const NO_FOCUS: never[] = [];

/** The second side's hue for the parts drawn from CSS (the chart, the events
 *  row, the line's label): violet-400, violet-700 for the label on the light
 *  surface. */
const PAID_IN_VARS = {
  "--flow-debt": PAID_IN_HUES.debt.solid,
  "--flow-debt-label": "var(--color-violet-700)",
} as CSSProperties;
