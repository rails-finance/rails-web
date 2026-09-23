"use client";

// Composer: wires the Polaris header / detail / explainer into the universal
// EventCard shell.
//
// Spine grammar: a liquidation carries the critical warning spine; a transfer
// rides the custody glyph on a dotted spine (a party changed, nothing moved);
// every holder touch draws its token rows — pETH and the stablecoin, each
// with the direction the log's own sign says. Value INTO the position points
// left, value OUT points right, the convention the other CDP explorers use.

import type { BaseActivityEvent, PolarisContext } from "@/lib/shared/types/event-shape";
import { EventCard } from "@/components/shared/event-card";
import { SpineColumn, type SpineTokenRow } from "@/components/shared/spine-column";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { ledgerFieldProv, type PolarisCoords } from "@/lib/polaris/event-provenance";
import { polarisExplainerTeaser } from "@/lib/polaris/explainer-clauses";
import { PETH, POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";
import { PolarisEventHeader } from "./polaris-event-header";
import { PolarisBarsSlot } from "./polaris-bars-slot";
import { PolarisEventDetail } from "./polaris-event-detail";
import { PolarisEventExplainer, polarisLearnMoreContent } from "./polaris-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";

export interface PolarisEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "polaris"; data: PolarisContext } };
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
}

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

export function PolarisEventCard({ event, isFirst, isLast, eventNumber }: PolarisEventCardProps) {
  const ctx = event.context.data;
  const coords: PolarisCoords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    market: ctx.market,
    cdpId: ctx.cdpId,
  };
  const stable = ctx.stableSymbol;
  const stableAddr = POLARIS_MARKET_CONFIG[ctx.market].stable.address;

  const dColl = num(ctx.collChange);
  const dDebt = num(ctx.debtChange);
  const isTouch = ctx.eventType === "open" || ctx.eventType === "adjust" || ctx.eventType === "close";
  // The header registers a labelled (bare-magnitude) receipt on open/adjust
  // and a signed one on close — the echo's value key must match exactly.
  const labeled = ctx.eventType !== "close";

  const tokens: SpineTokenRow[] = [];
  if (isTouch && dColl !== 0)
    tokens.push({
      symbol: PETH.symbol,
      address: PETH.address,
      // A deposit moves pETH INTO the position; a withdrawal out of it.
      direction: dColl > 0 ? "left" : "right",
      value: Math.abs(dColl),
      prov: {
        info: ledgerFieldProv("collChange", coords, ctx.raw?.collChange),
        value: chainTruthDeltaValue(dColl, labeled),
        symbol: PETH.symbol,
      },
    });
  if (isTouch && dDebt !== 0)
    tokens.push({
      symbol: stable,
      address: stableAddr,
      // A borrow sends the stablecoin OUT to the holder; a repay brings it in.
      direction: dDebt > 0 ? "right" : "left",
      value: Math.abs(dDebt),
      prov: {
        info: ledgerFieldProv("debtChange", coords, ctx.raw?.debtChange),
        value: chainTruthDeltaValue(dDebt, labeled),
        symbol: stable,
      },
    });

  const iconSlot =
    ctx.eventType === "liquidate" ? (
      <SpineColumn
        icon="warning"
        warningTone="critical"
        warningLabel="Liquidation"
        spine="dotted"
        isFirst={isFirst}
        isLast={!!isLast}
      />
    ) : ctx.eventType === "transfer" ? (
      <SpineColumn icon="custody" spine="dotted" isFirst={isFirst} isLast={!!isLast} />
    ) : tokens.length === 0 ? (
      // An interest-only touch: the log wrote the pending legs in and moved
      // nothing the holder chose.
      <SpineColumn icon="no-change" isFirst={isFirst} isLast={!!isLast} />
    ) : (
      <SpineColumn tokens={tokens} isFirst={isFirst} isLast={!!isLast} />
    );

  return (
    <EventCard
      avatar={null}
      iconColumn={iconSlot}
      header={
        <PolarisEventHeader
          actionLabel={event.actionLabel}
          ctx={ctx}
          timestamp={event.timestamp}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          eventNumber={eventNumber}
        />
      }
      // The change / balance bars under the header (flag-gated; nothing
      // without the CDP page's provider, nothing on a transfer row).
      headerBars={<PolarisBarsSlot eventId={event.id} />}
      detail={<PolarisEventDetail ctx={ctx} txHash={event.txHash} blockNumber={event.blockNumber} />}
      detailLabel="CDP state"
      explainer={
        <PolarisEventExplainer
          ctx={ctx}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          // A liquidation is sent by the liquidator and a transfer is paid for
          // by whoever moved the NFT — neither transaction's gas is the CDP
          // holder's, so the clause is withheld on those two rows and stated
          // on the holder's own open / adjust / close.
          gas={ctx.eventType === "liquidate" || ctx.eventType === "transfer" ? undefined : event.gas}
          skipLead
        />
      }
      explainerLabel="Plain English"
      explainerTeaser={polarisExplainerTeaser(ctx, coords)}
      txHash={event.txHash}
      learnMore={<LearnMore inline content={polarisLearnMoreContent(ctx)} />}
      persistKey={`polaris:${event.id}`}
    />
  );
}
