"use client";

// Sky Savings position — the three sections (standards/detail-page-anatomy.md):
// the card, Lifetime flows (the date scrubber), the timeline.
// Every figure is at the sealed block the api names; the server half has
// already refused the page when the gate did not pass.

import { useMemo } from "react";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { LifetimeFlowsPanel } from "@/components/shared/lifetime-flows-panel";
import { LifetimeFlowsScrubber } from "@/components/shared/lifetime-flows-scrubber";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { RiskFigure, RiskFooterStrip } from "@/components/shared/risk-footer-strip";
import { BlockRef } from "@/components/shared/block-ref";
import { CHAIN_TRUTH_DISPLAY_ITEMS } from "@/components/shared/timeline-toolbar";
import { SkySavingsActivityHeader } from "@/components/protocol/sky-savings/sky-savings-activity-header";
import type { SkyPreviousEvent } from "@/lib/sky-savings/explainer-clauses";
import { SkySavingsPositionCard } from "@/components/protocol/sky-savings/sky-savings-position-card";
import { SkySavingsPositionExplanation } from "@/components/protocol/sky-savings/sky-savings-position-explanation";
import { SkySavingsEventCard, type SkySavingsEvent } from "@/components/protocol/sky-savings/sky-savings-event-card";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { isSkySavingsEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { vaultTermsNotes, type MarketNote } from "@/lib/shared/market-note";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { SKY_CHAIN_ID, SUSDS, USDS } from "@/lib/sky-savings/constants";
import { pctString, rayNumber, toutAt, usdcPerUsdsAt } from "@/lib/sky-savings/math";
import { skyFlowTimeline, skyLifetimeTotals } from "@/lib/sky-savings/flows";
import { skyFlowsExplanation } from "@/lib/sky-savings/flows-explanation";
import { skyFlowsContent } from "@/lib/sky-savings/learn-more";
import { chiProv, psmPriceProv, rateChangeProv } from "@/lib/sky-savings/provenance";
import type { SkyAsOf, SkyFlowDay, SkyGate, SkyPosition, SkyRateChange, SkyRates } from "@/lib/sky-savings/types";

export default function SkySavingsPositionView({
  position,
  asOf,
  gate,
  events,
  totalEvents,
  rateNotes,
  days,
  rates,
  firstAt,
  todayDay,
}: {
  position: SkyPosition;
  asOf: SkyAsOf;
  gate: SkyGate;
  events: BaseActivityEvent[];
  totalEvents: number;
  rateNotes: SkyRateChange[];
  days: SkyFlowDay[] | null;
  rates: SkyRates | null;
  firstAt: number | null;
  /** Today's UTC day, from the server, so both renders agree. */
  todayDay: number;
}) {
  const open = position.status === "open";
  const skyEvents = useMemo(() => events.filter(isSkySavingsEvent) as SkySavingsEvent[], [events]);
  const tl = useTimelineEvents(skyEvents, {
    storageKey: `sky-savings-${position.holder}`,
    protocolKey: "sky-savings",
    olderCount: Math.max(0, totalEvents - skyEvents.length),
  });

  // Each row's previous event, for the interest earned between the two: the
  // next row down in the newest-first list, null under the first event of a
  // whole history, undefined under the oldest row of a longer one.
  // With it, the Savings Rate changes in the stretch between the two.
  const previousOf = useMemo(() => {
    const rows = [...skyEvents].sort((a, b) => b.blockNumber - a.blockNumber);
    const whole = rows.length >= totalEvents;
    const changes = [...(rates?.ssr ?? rateNotes)].sort((a, b) => a.blockNumber - b.blockNumber);
    const m = new Map<string, SkyPreviousEvent | null | undefined>();
    rows.forEach((e, i) => {
      const p = rows[i + 1];
      if (!p) return m.set(e.id, whole ? null : undefined);
      const between = changes.filter((r) => r.blockNumber > p.blockNumber && r.blockNumber <= e.blockNumber);
      m.set(e.id, {
        ctx: p.context.data,
        timestamp: p.timestamp,
        blockNumber: p.blockNumber,
        rateChanges: between.length
          ? {
              count: between.length,
              from: between[0].previousAnnualRate,
              to: between[between.length - 1].annualRate,
            }
          : undefined,
      });
    });
    return m;
  }, [skyEvents, totalEvents, rates, rateNotes]);

  // Savings Rate changes inside the holder's span, placed between the rows by
  // block, and those after its last event (from the rate history), which have
  // no row to sit beside and stand in the timeline's head slot. A change
  // applies to every holder at once, so it is a note, counted in nothing.
  const newestBlock = useMemo(() => skyEvents.reduce((m, e) => Math.max(m, e.blockNumber), 0), [skyEvents]);
  const toNotes = useMemo(
    () => (list: SkyRateChange[]) =>
      vaultTermsNotes(
        list.map((r) => ({
          kind: "savings-rate",
          blockNumber: r.blockNumber,
          timestamp: r.timestamp,
          txHash: r.txHash,
          fields: { ssr: r.ssr, annualRate: r.annualRate, previousAnnualRate: r.previousAnnualRate },
        })),
        { address: SUSDS.address, shareSymbol: SUSDS.symbol, protocolId: "sky-savings" },
        (n) => {
          const to = pctString(n.fields.annualRate);
          const from = pctString(n.fields.previousAnnualRate);
          return {
            headline: `${from} → ${to}`,
            quantity: "Savings Rate",
            title: "Savings Rate change",
            tip: `Savings Rate ${from} → ${to}`,
            statement: `Sky governance set the Savings Rate to ${to} a year, from ${from}, for every sUSDS holder`,
            prov: rateChangeProv(n.blockNumber, n.txHash, n.fields.ssr, to),
          };
        },
      ),
    [],
  );
  const notes: MarketNote[] = useMemo(
    () => toNotes(rateNotes.filter((r) => r.blockNumber <= newestBlock)),
    [toNotes, rateNotes, newestBlock],
  );
  const trailingNotes: MarketNote[] = useMemo(() => {
    if (!open || newestBlock === 0) return [];
    const after = (rates?.ssr ?? rateNotes).filter((r) => r.blockNumber > newestBlock && r.blockNumber <= asOf.block);
    return toNotes([...after].sort((a, b) => b.blockNumber - a.blockNumber));
  }, [open, rates, newestBlock, asOf.block, rateNotes, toNotes]);

  const totals = useMemo(() => (days ? skyLifetimeTotals(days) : null), [days]);
  const flowTimeline = useMemo(
    () => (days && rates ? skyFlowTimeline(days, rates, position, asOf, todayDay) : null),
    [days, rates, position, asOf, todayDay],
  );

  const usdc = rates ? usdcPerUsdsAt(rates.psm.series, asOf.block) : null;
  const priceAssets: LatestPriceAsset[] = [
    {
      symbol: SUSDS.symbol,
      address: SUSDS.address,
      price: asOf.chi ? rayNumber(asOf.chi) : undefined,
      unit: USDS.symbol,
      label: "One sUSDS in USDS, the share price at the page's block",
      tip: `The sUSDS share price: what one sUSDS redeems for in USDS at block ${asOf.block.toLocaleString("en-US")}.`,
      info: asOf.chi ? chiProv(asOf) : undefined,
    },
    ...(usdc != null
      ? [
          {
            symbol: USDS.symbol,
            address: USDS.address,
            price: usdc,
            unit: "USDC",
            label: "One USDS in USDC, the PSM exit rate",
            info: psmPriceProv(asOf.block, usdc.toFixed(6), toutAt(rates?.psm.series, asOf.block)),
          },
        ]
      : []),
  ];

  const checked = (
    <RiskFooterStrip>
      <RiskFigure>Checked against the contract at block {gate.block.toLocaleString("en-US")}</RiskFigure>
    </RiskFooterStrip>
  );

  return (
    <div className="py-8 space-y-6">
      <DetailTopRow
        session="sky-savings"
        wallet={position.holder}
        owner={{ wallet: position.holder }}
        assets={priceAssets}
        priceReason={ORACLE_USD_REASON["sky-savings"]}
      />

      <p className="text-xs text-rb-500" data-sky-asof={asOf.block}>
        Sky Savings · sUSDS on Ethereum · every figure at <BlockRef block={asOf.block} chainId={SKY_CHAIN_ID} />, the
        newest block when the page loaded
      </p>

      <SkySavingsPositionCard
        p={position}
        asOf={asOf}
        surface="detail"
        viewHref={tl.viewHref}
        rowExtra={checked}
        explanation={
          <SkySavingsPositionExplanation position={position} asOf={asOf} totals={totals} firstAt={firstAt} />
        }
      />

      <LifetimeFlowsPanel
        read={flowTimeline || (days && rates) ? "done" : "failed"}
        explanation={skyFlowsExplanation(position, totals)}
        learnMore={skyFlowsContent()}
        scrubber={flowTimeline ? <LifetimeFlowsScrubber timeline={flowTimeline} /> : null}
      />

      <ChainTruthTimeline
        persistKeyPrefix="sky-savings"
        closed={!open}
        tl={tl}
        notes={notes}
        liveNotes={trailingNotes.length ? trailingNotes : undefined}
        notice={
          totalEvents > skyEvents.length ? (
            <p className="text-xs text-rb-500">
              This list holds the newest {skyEvents.length.toLocaleString("en-US")} of{" "}
              {totalEvents.toLocaleString("en-US")} events. The card and Lifetime flows cover all{" "}
              {totalEvents.toLocaleString("en-US")}.
            </p>
          ) : undefined
        }
        displayItems={CHAIN_TRUTH_DISPLAY_ITEMS}
        toolbarLeading={
          <SkySavingsActivityHeader
            first={position.activity.firstTimestamp ?? firstAt}
            last={position.activity.lastTimestamp ?? null}
            events={skyEvents}
            complete={totalEvents <= skyEvents.length}
            closed={!open}
          />
        }
        emptyLabel="No sUSDS event names this address."
        renderCard={(event, meta) =>
          isSkySavingsEvent(event) ? (
            <SkySavingsEventCard
              event={event}
              eventNumber={meta.eventNumber}
              isLast={meta.isLast}
              previous={previousOf.get(event.id)}
            />
          ) : null
        }
      />
      <ProvInspectorLayer />
    </div>
  );
}
