"use client";

// A Polaris stability-pool deposit's page, in the three sections
// (rails-ops standards/detail-page-anatomy.md) on the CDP page's shell: the
// card, the Lifetime flows panel (lib/polaris/sp-loan-flow-timelines.ts,
// decision 0022 as amended 17 Nov 2026), the shared timeline. The pool's
// getters at head (/api/chain/polaris/stability-pool) are the card's figures
// and the flows' pending legs; the index holds the history and the sums. The
// vault-held deposits carry about 185,000 rows each: the timeline draws the
// newest DEPOSIT_FIRST_READ with a boundary card for the rest, and the flows
// read the life's day rows (/stability-pool/flows/daily). Under `event/<id>`
// the page draws one operation on the shared event page (P4): the timeline
// alone, in its pinned mode, as the CDP page does; an operation older than the
// rows the page holds is not found there.

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
import { Prov } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { PolarisDepositCard } from "@/components/protocol/polaris/polaris-deposit-card";
import { PolarisDepositEventCard } from "@/components/protocol/polaris/polaris-sp-loan-event-cards";
import {
  PolarisDepositFlowsNote,
  polarisDepositFlowsContent,
} from "@/components/protocol/polaris/polaris-sp-loan-flows-note";
import { PolarisDepositSinceTouchRow } from "@/components/protocol/polaris/polaris-sp-loan-since-touch";
import { fetchPolarisDepositChain, type PolarisDepositChain } from "@/lib/api/fetch-polaris-sp-loans-chain";
import { PETH, POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import { POLARIS_SP_PATH } from "@/lib/polaris/routes";
import { big, depositLifetime, depositNow, depositNowFromChain, units } from "@/lib/polaris/sp-loan-math";
import { depositFlows, depositFlowsFromDays } from "@/lib/polaris/sp-loan-flow-timelines";
import { DEPOSIT_FIRST_READ, depositTimelineEvent, WHOLE_LIFE_READ } from "@/lib/polaris/sp-loan-timeline-events";
import { spFeedProv, spLiveProv } from "@/lib/polaris/sp-loan-provenance";
import { polarisDepositEventPage } from "@/lib/polaris/sp-loan-explorer";
import { boundaryFromLimit } from "@/lib/shared/timeline-boundary";
import { decodeEventId } from "@/lib/shared/page-metadata";
import {
  readPolarisSpLoans,
  type PolarisDepositDay,
  type PolarisDepositDaysResponse,
  type PolarisDepositEventRow,
  type PolarisDepositTimelineResponse,
} from "@/lib/sources/api/polaris-sp-loans";

export default function DepositView({
  market,
  tokenId,
  initial,
}: {
  market: PolarisMarket;
  tokenId: string;
  initial: PolarisDepositTimelineResponse | null;
}) {
  const stable = POLARIS_MARKET_CONFIG[market].stable;
  const [data, setData] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [chain, setChain] = useState<PolarisDepositChain | null>(null);
  const [chainSettled, setChainSettled] = useState(false);
  // The event route draws the timeline alone, its card in page mode.
  const rawEventId = useParams<{ eventId?: string }>()?.eventId;
  const onEventPage = rawEventId != null;

  // The index lane, where the server's read did not answer.
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    readPolarisSpLoans<PolarisDepositTimelineResponse>("stability-pool/timeline", {
      market,
      id: tokenId,
      order: "desc",
      limit: String(DEPOSIT_FIRST_READ),
    })
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [initial, market, tokenId]);

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
    fetchPolarisDepositChain(market, tokenId)
      .then((c) => !cancelled && !c.chainStale && setChain(c))
      .catch(() => undefined)
      .finally(() => !cancelled && setChainSettled(true));
    return () => {
      cancelled = true;
    };
  }, [open, market, tokenId]);

  // The whole life, oldest first: the first read where it held every row,
  // else one read of up to WHOLE_LIFE_READ; past that, the day rows.
  const firstRows = data?.rows;
  const firstWhole = firstRows != null && firstRows.length >= total;
  const [lifeRows, setLifeRows] = useState<PolarisDepositEventRow[] | null>(null);
  const [lifeRead, setLifeRead] = useState<FlowsRead>("reading");
  // Past one read, the life's day rows (the vault-held deposits).
  const [lifeDays, setLifeDays] = useState<PolarisDepositDay[] | null>(null);
  useEffect(() => {
    if (firstRows == null || firstWhole) return;
    if (total > WHOLE_LIFE_READ) {
      let cancelled = false;
      readPolarisSpLoans<PolarisDepositDaysResponse>("stability-pool/flows/daily", { market, id: tokenId })
        .then((d) => {
          if (cancelled) return;
          setLifeDays(d.days);
          setLifeRead("done");
        })
        .catch(() => !cancelled && setLifeRead("failed"));
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    readPolarisSpLoans<PolarisDepositTimelineResponse>("stability-pool/timeline", {
      market,
      id: tokenId,
      order: "asc",
      limit: String(WHOLE_LIFE_READ),
    })
      .then((d) => {
        if (cancelled) return;
        setLifeRows(d.rows);
        setLifeRead("done");
      })
      .catch(() => !cancelled && setLifeRead("failed"));
    return () => {
      cancelled = true;
    };
  }, [firstRows, firstWhole, total, market, tokenId]);
  const wholeAsc = useMemo(
    () => (firstWhole && firstRows ? [...firstRows].reverse() : lifeRows),
    [firstWhole, firstRows, lifeRows],
  );
  // The timeline's rows: the whole life where the page holds it, else the
  // newest the first read brought.
  const listed = useMemo(() => wholeAsc ?? (firstRows ? [...firstRows].reverse() : []), [wholeAsc, firstRows]);
  const rowById = useMemo(() => new Map(listed.map((r) => [r.event_key, r])), [listed]);
  const events = useMemo(() => listed.map(depositTimelineEvent), [listed]);
  const olderCount = Math.max(0, total - listed.length);
  // The last touch the page holds: a transfer is no touch.
  const lastTouch = useMemo(() => listed.findLast((r) => r.event_type !== "transfer") ?? null, [listed]);
  // The deposit's one operation is its open: the window is its whole life.
  const sinceOpen = useMemo(
    () => olderCount === 0 && listed.filter((r) => r.event_type !== "transfer").length === 1,
    [olderCount, listed],
  );

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
          ? depositFlows(market, wholeAsc, { open, now, nowSec })
          : lifeDays
            ? depositFlowsFromDays(market, lifeDays, { open, now, nowSec })
            : null,
    [flowsReady, wholeAsc, lifeDays, nowSec, open, market, now],
  );
  const flowFocus = useFlowFocusValue(useFlowFocusRoot(flows?.focus ?? NO_FOCUS), flows?.timeline ?? null);
  // With the rows in hand the read is done, drawn or not (a life with no
  // operation draws nothing).
  const flowsRead: FlowsRead = flowsReady
    ? "done"
    : lifeRead === "withheld" || lifeRead === "failed"
      ? lifeRead
      : "reading";
  // The whole life is still being read: no boundary card for rows about to land.
  const lifePending = !firstWhole && total <= WHOLE_LIFE_READ && lifeRows == null && lifeRead === "reading";

  const tl = useTimelineEvents(events, {
    storageKey: `polaris-sp-${market}-${tokenId}`,
    protocolKey: "polaris-sp",
    olderCount,
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

  // pETH in the market's stablecoin at the feed, the price the head row values
  // the pending pETH at.
  const feed = chain?.pethInStableRaw ? units(big(chain.pethInStableRaw)) : null;
  const stripAssets: LatestPriceAsset[] =
    feed != null
      ? [
          {
            symbol: PETH.symbol,
            address: PETH.address,
            price: feed,
            unit: stable.symbol,
            label: `${PETH.symbol} at the ${stable.symbol} price feed`,
            triggerLabel: PETH.symbol,
            info: spFeedProv(market),
          },
        ]
      : [];

  const holder = chain?.owner ?? row?.holder ?? null;

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
        {/* The pETH bar is paid in, not owed: violet, apart from a debt's green
          (Miles, 17 Nov 2026). */}
        <FlowHuesContext.Provider value={PAID_IN_HUES}>
          <div className="py-8 space-y-6" style={PAID_IN_VARS}>
            <DetailTopRow
              session="polaris"
              wallet={holder}
              owner={{
                wallet: holder,
                pending: !chainSettled,
                href: holder ? `${POLARIS_SP_PATH}?q=${holder}` : undefined,
                wrap: chain?.owner
                  ? (pill) => (
                      <Prov info={spLiveProv("owner", market)} value={chain.owner ?? undefined}>
                        {pill}
                      </Prov>
                    )
                  : undefined,
              }}
              fallbackHref={POLARIS_SP_PATH}
              assets={stripAssets}
              closed={!open}
              tools={false}
            />
            {!onEventPage && (
              <>
                <PolarisDepositCard
                  row={row}
                  lifetime={lifetime}
                  now={cardNow}
                  pending={open && !chainSettled}
                  explanation={
                    <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-rb-500">
                      <li>
                        A deposit in the {stable.symbol} Stability Pool repays the debt of liquidated positions. Each
                        liquidation burns a share of every deposit and pays pETH in its place.
                      </li>
                      <li>The deposit now and the pending gains are the pool&rsquo;s current figures.</li>
                      <li>
                        The deposit also earns {stable.symbol} yield; what a touch does not claim stays in the deposit.
                      </li>
                    </ul>
                  }
                />
                <LifetimeFlowsPanel
                  scrubber={flows ? <LifetimeFlowsScrubber timeline={flows.timeline} /> : null}
                  read={flowsRead}
                  explanation={
                    <div className="space-y-2 text-sm text-rb-500">
                      <PolarisDepositFlowsNote stable={stable.symbol} />
                    </div>
                  }
                  learnMore={polarisDepositFlowsContent(stable.symbol)}
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
                persistKeyPrefix="polaris-sp"
                closed={!open}
                tl={tl}
                boundary={boundary}
                displayItems={CHAIN_TRUTH_DISPLAY_ITEMS}
                emptyLabel="No operations recorded for this deposit"
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
                        <PolarisDepositSinceTouchRow
                          market={market}
                          recorded={lifetime.recorded}
                          burned={now.pendingLoss}
                          now={now.now}
                          gain={now.pendingStable}
                          stashed={lifetime.stashed}
                          paidIn={now.bcSinceTouch}
                          feed={feed}
                          fromBlock={Number(lastTouch?.block_number ?? row.last_block)}
                          fromAt={Number(lastTouch?.block_timestamp ?? row.last_timestamp)}
                          toAt={chain.blockTimestamp}
                          headBlock={chain.blockNumber}
                          sinceOpen={sinceOpen}
                        />
                      )
                    : undefined
                }
                eventPage={(slot) =>
                  polarisDepositEventPage({ ...slot, market, tokenId, holder, row: rowById.get(slot.event.id) })
                }
                renderCard={(event, meta) => {
                  const r = rowById.get(event.id);
                  return r ? (
                    <PolarisDepositEventCard
                      row={r}
                      isLast={meta.isLast}
                      eventNumber={meta.eventNumber}
                      holder={row.holder}
                      vaultHeld={row.vault_held}
                    />
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
