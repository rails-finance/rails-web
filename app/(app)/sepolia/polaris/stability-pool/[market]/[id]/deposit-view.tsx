"use client";

// A Polaris stability-pool deposit's page, in the three sections
// (rails-ops standards/detail-page-anatomy.md) on the CDP page's shell: the
// card, the Lifetime flows panel (lib/polaris/sp-loan-flow-timelines.ts,
// decision 0022 as amended 17 Nov 2026), the shared timeline. The pool's
// getters at head (/api/chain/polaris/stability-pool) are the card's figures
// and the flows' pending legs; the index holds the history and the sums. The
// vault-held deposits carry about 185,000 rows each: the timeline draws the
// newest DEPOSIT_FIRST_READ with a boundary card for the rest, and the flows,
// which need the whole life, are withheld past one read.

import { useEffect, useMemo, useState } from "react";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { LifetimeFlowsPanel, type FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { LifetimeFlowsScrubber } from "@/components/shared/lifetime-flows-scrubber";
import { FlowFocusContext, useFlowFocusRoot, useFlowFocusValue } from "@/components/shared/flow-focus-context";
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
import { RawFigure } from "@/components/protocol/polaris/polaris-sp-loan-parts";
import { fetchPolarisDepositChain, type PolarisDepositChain } from "@/lib/api/fetch-polaris-sp-loans-chain";
import { PETH, POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import { POLARIS_SP_PATH } from "@/lib/polaris/routes";
import { big, depositLifetime, depositNow, depositNowFromChain, units } from "@/lib/polaris/sp-loan-math";
import { depositFlows } from "@/lib/polaris/sp-loan-flow-timelines";
import { DEPOSIT_FIRST_READ, depositTimelineEvent, WHOLE_LIFE_READ } from "@/lib/polaris/sp-loan-timeline-events";
import { spFeedProv, spLiveProv, spPendingLossProv } from "@/lib/polaris/sp-loan-provenance";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { boundaryFromLimit } from "@/lib/shared/timeline-boundary";
import { CARD_INSET_START } from "@/lib/shared/ui-grammar";
import {
  readPolarisSpLoans,
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
  // else one read of up to WHOLE_LIFE_READ; past that the flows are withheld.
  const firstRows = data?.rows;
  const firstWhole = firstRows != null && firstRows.length >= total;
  const [lifeRows, setLifeRows] = useState<PolarisDepositEventRow[] | null>(null);
  const [lifeRead, setLifeRead] = useState<FlowsRead>("reading");
  useEffect(() => {
    if (firstRows == null || firstWhole) return;
    if (total > WHOLE_LIFE_READ) {
      setLifeRead("withheld");
      return;
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

  const lifetime = useMemo(() => (row ? depositLifetime(row) : null), [row]);
  // The flows and the head row lay the chain over the index only where the
  // two agree on the last touch; the card's headlines are the chain's alone.
  const now = useMemo(() => (lifetime && chain && open ? depositNow(lifetime, chain) : null), [lifetime, chain, open]);
  const cardNow = useMemo(() => (chain && open ? depositNowFromChain(chain) : null), [chain, open]);

  // Set on mount, so the server's render and the first client render agree.
  const [nowSec, setNowSec] = useState<number | null>(null);
  useEffect(() => setNowSec(Math.floor(Date.now() / 1000)), []);
  const flowsReady = wholeAsc != null && nowSec != null && (!open || chainSettled);
  const flows = useMemo(
    () => (flowsReady && wholeAsc && nowSec != null ? depositFlows(market, wholeAsc, { open, now, nowSec }) : null),
    [flowsReady, wholeAsc, nowSec, open, market, now],
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
    <FlowFocusContext.Provider value={flows ? flowFocus : null}>
      <div className="py-8 space-y-6">
        <DetailTopRow
          session="polaris"
          wallet={holder}
          owner={{
            wallet: holder,
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
              <li>The deposit also earns {stable.symbol} yield; what a touch does not claim stays in the deposit.</li>
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
        {failed && <p className="text-sm text-rb-500">The operations could not be read just now.</p>}
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
            now && lifetime
              ? () => (
                  <SinceLastTouch
                    market={market}
                    lastTimestamp={Number(row.last_timestamp)}
                    burned={now.pendingLoss}
                    peth={now.bcSinceTouch}
                    gain={now.pendingStable}
                    feed={feed}
                  />
                )
              : undefined
          }
          renderCard={(event, meta) => {
            const r = rowById.get(event.id);
            return r ? (
              <PolarisDepositEventCard row={r} isLast={meta.isLast} holder={row.holder} vaultHeld={row.vault_held} />
            ) : null;
          }}
        />
        <ProvInspectorLayer />
      </div>
    </FlowFocusContext.Provider>
  );
}

const NO_FOCUS: never[] = [];

/** The timeline's head slot (L5, decision 0022 §4): what the pool has done to
 *  the deposit since its last touch, the holder having done nothing, with the
 *  pending pETH valued at the feed now. */
function SinceLastTouch({
  market,
  lastTimestamp,
  burned,
  peth,
  gain,
  feed,
}: {
  market: PolarisMarket;
  lastTimestamp: number;
  burned: bigint;
  peth: bigint;
  gain: bigint;
  feed: number | null;
}) {
  const s = POLARIS_MARKET_CONFIG[market].stable.symbol;
  const pethValue = feed != null ? units(peth) * feed : null;
  const net = pethValue != null ? pethValue + units(gain) - units(burned) : null;
  const fmt = (n: number) =>
    `${n < 0 ? "−" : "+"}${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ${s}`;
  return (
    <details
      className={`mb-3 rounded-2xl bg-raised px-5 py-3 text-sm ${CARD_INSET_START}`}
      data-anatomy="L5"
      data-live-window="polaris-sp-since-touch"
    >
      <summary className="cursor-pointer select-none font-semibold">
        Since its last touch{" "}
        <span className="font-normal text-rb-500">
          on {shortDate(lastTimestamp)} {shortDateYear(lastTimestamp)}
          {net != null ? `: ${fmt(net)} at the feed` : ""}
        </span>
      </summary>
      <ul className="mt-2 space-y-1 text-rb-500">
        <li data-since-row="burned">
          Burned since last touch:{" "}
          <Prov info={spPendingLossProv(market)}>
            <RawFigure raw={burned} symbol={s} />
          </Prov>{" "}
          {s}
        </li>
        <li data-since-row="peth">
          Pending pETH:{" "}
          <Prov info={spLiveProv("pendingPeth", market)}>
            <RawFigure raw={peth} symbol={PETH.symbol} />
          </Prov>{" "}
          pETH
          {pethValue != null
            ? `, ${pethValue.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ${s} at the feed`
            : ""}
        </li>
        <li data-since-row="gain">
          Pending {s} gain:{" "}
          <Prov info={spLiveProv("stableGain", market)}>
            <RawFigure raw={gain} symbol={s} />
          </Prov>{" "}
          {s}
        </li>
      </ul>
    </details>
  );
}
