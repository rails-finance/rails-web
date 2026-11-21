"use client";

// A Liquity V1 stability-pool deposit's page, in the three sections
// (rails-ops standards/detail-page-anatomy.md) on Liquity V2's deposit shell
// (components/protocol/liquity/sp-deposit-page.tsx):
// the card, the Lifetime flows panel (lib/liquity-v1/sp-flow-timelines.ts,
// decision 0022), the shared timeline with "Since its last touch" in its head
// slot. The pool's getters at head (/api/chain/liquity-v1/stability-pool) are
// the card's figures and the flows' pending legs; the index holds the history
// and the sums. A life longer than one read draws the newest SP_FIRST_READ
// rows with a boundary card, and the flows read the life's day rows
// (/stability-pool/flows/daily). Under `event/<id>` the page draws one touch
// on the shared event page (P4).

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
import { LiquityV1DepositCard } from "@/components/protocol/liquity/v1-sp-deposit-card";
import { LiquityV1DepositEventCard } from "@/components/protocol/liquity/v1-sp-event-card";
import {
  LiquityV1DepositFlowsNote,
  liquityV1DepositFlowsContent,
} from "@/components/protocol/liquity/v1-sp-flows-note";
import { LiquityV1DepositSinceTouchRow } from "@/components/protocol/liquity/v1-sp-since-touch";
import { fetchLiquityV1DepositChain, type LiquityV1DepositChain } from "@/lib/api/fetch-liquity-v1-sp-chain";
import { NATIVE } from "@/lib/shared/asset-roster";
import { LIQUITY_V1_SP_PATH } from "@/lib/liquity-v1/sp-routes";
import { depositLifetime, depositNow, depositNowFromChain, priceUnits } from "@/lib/liquity-v1/sp-math";
import { spDepositFlows, spDepositFlowsFromDays } from "@/lib/liquity-v1/sp-flow-timelines";
import { SP_FIRST_READ, spTimelineEvent, SP_WHOLE_LIFE_READ } from "@/lib/liquity-v1/sp-timeline-events";
import { liquityV1SpSizeDims } from "@/lib/liquity-v1/sp-timeline-size";
import { spFeedProv } from "@/lib/liquity-v1/sp-provenance";
import { liquityV1DepositEventPage } from "@/lib/liquity-v1/sp-explorer";
import { boundaryFromLimit } from "@/lib/shared/timeline-boundary";
import { decodeEventId } from "@/lib/shared/page-metadata";
import {
  readLiquityV1Sp,
  type LiquityV1DepositDay,
  type LiquityV1DepositDaysResponse,
  type LiquityV1DepositEventRow,
  type LiquityV1DepositTimelineResponse,
} from "@/lib/sources/api/liquity-v1-sp";

export default function DepositView({
  depositor,
  initial,
}: {
  depositor: string;
  initial: LiquityV1DepositTimelineResponse | null;
}) {
  const [data, setData] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [chain, setChain] = useState<LiquityV1DepositChain | null>(null);
  const [chainSettled, setChainSettled] = useState(false);
  // The event route draws the timeline alone, its card in page mode.
  const rawEventId = useParams<{ eventId?: string }>()?.eventId;
  const onEventPage = rawEventId != null;

  // The index lane, where the server's read did not answer.
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    readLiquityV1Sp<LiquityV1DepositTimelineResponse>("stability-pool/timeline", {
      wallet: depositor,
      order: "desc",
      limit: String(SP_FIRST_READ),
    })
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [initial, depositor]);

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
    fetchLiquityV1DepositChain(depositor)
      .then((c) => !cancelled && !c.chainStale && setChain(c))
      .catch(() => undefined)
      .finally(() => !cancelled && setChainSettled(true));
    return () => {
      cancelled = true;
    };
  }, [open, depositor]);

  // The whole life, oldest first: the first read where it held every row,
  // else one read of up to SP_WHOLE_LIFE_READ; past that, the day rows.
  const firstRows = data?.rows;
  const firstWhole = firstRows != null && firstRows.length >= total;
  const [lifeRows, setLifeRows] = useState<LiquityV1DepositEventRow[] | null>(null);
  const [lifeRead, setLifeRead] = useState<FlowsRead>("reading");
  const [lifeDays, setLifeDays] = useState<LiquityV1DepositDay[] | null>(null);
  useEffect(() => {
    if (firstRows == null || firstWhole) return;
    let cancelled = false;
    if (total > SP_WHOLE_LIFE_READ) {
      readLiquityV1Sp<LiquityV1DepositDaysResponse>("stability-pool/flows/daily", { wallet: depositor })
        .then((d) => {
          if (cancelled) return;
          setLifeDays(d.days);
          setLifeRead("done");
        })
        .catch(() => !cancelled && setLifeRead("failed"));
    } else {
      readLiquityV1Sp<LiquityV1DepositTimelineResponse>("stability-pool/timeline", {
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
  }, [firstRows, firstWhole, total, depositor]);
  const wholeAsc = useMemo(
    () => (firstWhole && firstRows ? [...firstRows].reverse() : lifeRows),
    [firstWhole, firstRows, lifeRows],
  );
  // The timeline's rows: the whole life where the page holds it, else the
  // newest the first read brought.
  const listed = useMemo(() => wholeAsc ?? (firstRows ? [...firstRows].reverse() : []), [wholeAsc, firstRows]);
  const rowById = useMemo(() => new Map(listed.map((r) => [r.event_key, r])), [listed]);
  const events = useMemo(() => listed.map(spTimelineEvent), [listed]);
  const olderCount = Math.max(0, total - listed.length);
  const lastTouch = listed.length > 0 ? listed[listed.length - 1] : null;
  // The deposit's one touch is its open: the window is its whole life.
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
          ? spDepositFlows(wholeAsc, { open, now, nowSec })
          : lifeDays
            ? spDepositFlowsFromDays(lifeDays, { open, now, nowSec })
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
  const lifePending = !firstWhole && total <= SP_WHOLE_LIFE_READ && lifeRows == null && lifeRead === "reading";

  // "Deposited (LUSD)": each touch's top-up or withdrawal.
  const sizeDims = useMemo(() => liquityV1SpSizeDims((e) => rowById.get(e.id)?.top_up_or_withdrawal), [rowById]);
  const tl = useTimelineEvents(events, {
    storageKey: `liquity-v1-sp-${depositor}`,
    protocolKey: "liquity-v1-sp",
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

  // ETH at the protocol's PriceFeed, the price the head row values the ETH
  // paid in at.
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
            info: spFeedProv(chain.priceStale),
          },
        ]
      : [];

  if (!data && !failed) return <DetailBodySkeleton />;
  if (!row)
    return (
      <div className="py-8 text-sm text-rb-500">
        The index did not answer for this deposit just now. Reload the page to try again.
      </div>
    );

  return (
    // The store from the first render, so the panel says it is reading and the
    // timeline holds its Date pill back (FlowsStoreContext).
    <FlowsStoreContext.Provider value={flowFocus.store}>
      <FlowFocusContext.Provider value={flows ? flowFocus : null}>
        {/* The ETH bar is paid in: violet, as on Liquity V2's deposit. */}
        <FlowHuesContext.Provider value={PAID_IN_HUES}>
          <div className="py-8 space-y-6" style={PAID_IN_VARS}>
            <DetailTopRow
              session="liquity-v1"
              wallet={depositor}
              owner={{ wallet: depositor, href: `${LIQUITY_V1_SP_PATH}?q=${depositor}` }}
              fallbackHref={LIQUITY_V1_SP_PATH}
              assets={stripAssets}
              closed={!open}
              tools={false}
            />
            {!onEventPage && (
              <>
                <LiquityV1DepositCard
                  row={row}
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
                        A deposit in the Stability Pool repays the LUSD debt of liquidated Troves. Each liquidation
                        burns a share of every deposit and pays ETH in its place.
                      </li>
                      <li>
                        The protocol issues LQTY to depositors. A deposit opened through a front end shares its LQTY
                        with that front end.
                      </li>
                      <li>
                        Every touch pays out the ETH and LQTY gained since the last one. The deposit now and the pending
                        gains are the pool&rsquo;s current figures.
                      </li>
                    </ul>
                  }
                />
                <LifetimeFlowsPanel
                  scrubber={flows ? <LifetimeFlowsScrubber timeline={flows.timeline} /> : null}
                  read={flowsRead}
                  explanation={
                    <div className="space-y-2 text-sm text-rb-500">
                      <LiquityV1DepositFlowsNote />
                    </div>
                  }
                  learnMore={liquityV1DepositFlowsContent()}
                />
              </>
            )}
            {(failed || pinnedUnread) && <p className="text-sm text-rb-500">The touches could not be read just now.</p>}
            {pinnedWaits ? (
              <DetailBodySkeleton />
            ) : pinnedUnread ? null : (
              <ChainTruthTimeline
                persistKeyPrefix="liquity-v1-sp"
                closed={!open}
                tl={tl}
                boundary={boundary}
                // The whole life is read on arrival up to SP_WHOLE_LIFE_READ: the
                // cut-page notice says so while it is in flight.
                loadOlder={lifePending ? { state: "loading", load: () => {} } : undefined}
                displayItems={CHAIN_TRUTH_DISPLAY_ITEMS}
                emptyLabel="No touches recorded for this deposit"
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
                        <LiquityV1DepositSinceTouchRow
                          recorded={lifetime.recorded}
                          burned={now.pendingLoss}
                          now={now.now}
                          eth={now.pendingEth}
                          lqty={now.pendingLqty}
                          price={price}
                          priceStale={chain.priceStale}
                          fromBlock={Number(lastTouch?.block_number ?? row.last_block)}
                          fromAt={Number(lastTouch?.block_timestamp ?? row.last_timestamp)}
                          toAt={chain.blockTimestamp}
                          headBlock={chain.blockNumber}
                          sinceOpen={sinceOpen}
                        />
                      )
                    : undefined
                }
                eventPage={(slot) => liquityV1DepositEventPage({ ...slot, depositor, row: rowById.get(slot.event.id) })}
                renderCard={(event, meta) => {
                  const r = rowById.get(event.id);
                  return r ? (
                    <LiquityV1DepositEventCard row={r} isLast={meta.isLast} eventNumber={meta.eventNumber} />
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
