"use client";

// Sky Savings position — the three sections (standards/detail-page-anatomy.md):
// the card, Lifetime flows (the date scrubber over the ledger), the timeline.
// Every figure is at the sealed block the api names; the server half has
// already refused the page when the gate did not pass.

import { useMemo } from "react";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { LifetimeFlowsScrubber } from "@/components/shared/lifetime-flows-scrubber";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { Prov } from "@/components/shared/provenance";
import { RiskFigure, RiskFooterStrip, RiskStrong } from "@/components/shared/risk-footer-strip";
import { BlockRef } from "@/components/shared/block-ref";
import { TimelineActivityHeader, CHAIN_TRUTH_DISPLAY_ITEMS } from "@/components/shared/timeline-toolbar";
import { SkySavingsPositionCard } from "@/components/protocol/sky-savings/sky-savings-position-card";
import { SkySavingsPositionExplanation } from "@/components/protocol/sky-savings/sky-savings-position-explanation";
import { SkySavingsEventCard, type SkySavingsEvent } from "@/components/protocol/sky-savings/sky-savings-event-card";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { isSkySavingsEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { vaultTermsNotes, type MarketNote } from "@/lib/shared/market-note";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { SKY_CHAIN_ID, SUSDS, USDS } from "@/lib/sky-savings/constants";
import { pctString, rayNumber, usdcPerUsdsAt } from "@/lib/sky-savings/math";
import { skyFlowTimeline, skyLifetimeTotals, skyTowerData } from "@/lib/sky-savings/flows";
import { skyFlowsExplanation } from "@/lib/sky-savings/flows-explanation";
import { skyFlowsContent } from "@/lib/sky-savings/learn-more";
import { chiProv, gateProv, psmPriceProv, rateChangeProv } from "@/lib/sky-savings/provenance";
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

  // Savings Rate changes inside the holder's span, placed between the rows by
  // block. A change applies to every holder at once, so it is a note, counted
  // in nothing.
  const notes: MarketNote[] = useMemo(
    () =>
      vaultTermsNotes(
        rateNotes.map((r) => ({
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
            statement: `Sky governance set the Savings Rate to ${to} a year, from ${from}, for every sUSDS holder`,
            prov: rateChangeProv(n.blockNumber, n.txHash, n.fields.ssr, to),
          };
        },
      ),
    [rateNotes],
  );

  const totals = useMemo(() => (days ? skyLifetimeTotals(days) : null), [days]);
  const tower = useMemo(() => skyTowerData(position, totals, asOf.block), [position, totals, asOf.block]);
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
      info: asOf.chi ? chiProv(asOf.block, asOf.chi) : undefined,
    },
    ...(usdc != null
      ? [
          {
            symbol: USDS.symbol,
            address: USDS.address,
            price: usdc,
            unit: "USDC",
            label: "One USDS in USDC, the PSM exit rate",
            info: psmPriceProv(asOf.block, usdc.toFixed(6)),
          },
        ]
      : []),
  ];

  const checked = (
    <RiskFooterStrip>
      <RiskFigure label="Checked">
        <Prov info={gateProv(gate.block, gate.holdersChecked, gate.totalSupply)} value={String(gate.holdersChecked)}>
          <RiskStrong>{gate.holdersChecked.toLocaleString("en-US")}</RiskStrong>
        </Prov>{" "}
        holders against the contract
      </RiskFigure>
    </RiskFooterStrip>
  );

  return (
    <div className="py-8 space-y-6">
      <DetailTopRow
        session="sky-savings"
        wallet={position.holder}
        assets={priceAssets}
        priceReason={ORACLE_USD_REASON["sky-savings"]}
      />

      <p className="text-xs text-rb-500" data-sky-asof={asOf.block}>
        Sky Savings · sUSDS on Ethereum · every figure at <BlockRef block={asOf.block} chainId={SKY_CHAIN_ID} />
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

      <ChainTruthTower
        data={tower}
        explanation={skyFlowsExplanation(position, totals)}
        learnMore={skyFlowsContent()}
        timeline={flowTimeline ? <LifetimeFlowsScrubber timeline={flowTimeline} /> : undefined}
      />

      <ChainTruthTimeline
        persistKeyPrefix="sky-savings"
        closed={!open}
        tl={tl}
        notes={notes}
        displayItems={CHAIN_TRUTH_DISPLAY_ITEMS}
        toolbarLeading={<TimelineActivityHeader events={skyEvents} closed={!open} firstAt={firstAt ?? undefined} />}
        emptyLabel="No sUSDS event names this address."
        renderCard={(event, meta) =>
          isSkySavingsEvent(event) ? (
            <SkySavingsEventCard
              event={event}
              eventNumber={meta.eventNumber}
              isFirst={meta.isFirst}
              isLast={meta.isLast}
            />
          ) : null
        }
      />
      <ProvInspectorLayer />
    </div>
  );
}
