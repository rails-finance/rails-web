"use client";

// The Polaris event card on the shared shell's slots (rails-ops
// reference/shared-event-card-spec.md §3; ui-jobs 309 step 5): the head with
// its ratio chip, T2's cells and notes (polaris-event-detail.tsx), and the
// price row with the holder's gas and pETH at the block in the market's unit.
//
// Spine grammar: a liquidation carries the critical warning spine; a transfer
// rides the custody glyph on a dotted spine (a party changed, nothing moved);
// every holder touch draws its token rows — pETH and the stablecoin, each
// with the direction the log's own sign says. Value INTO the position points
// left, value OUT points right, the convention the other CDP explorers use.

import type { BaseActivityEvent, PolarisContext } from "@/lib/shared/types/event-shape";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import { eventGas } from "@/components/shared/event-price-row";
import type { SpineColumnProps, SpineTokenRow } from "@/components/shared/spine-column";
import { useFlowFocus } from "@/components/shared/flow-focus-context";

import { type PolarisCoords } from "@/lib/polaris/event-provenance";
import { polarisExplainerTeaser } from "@/lib/polaris/explainer-clauses";
import { PETH, POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";
import { formatNumber } from "@/lib/utils/format";
import { usePolarisHeadSpec } from "./polaris-event-header";
import { polarisEventBody } from "./polaris-event-detail";
import { PolarisEventExplainer, polarisLearnMoreContent } from "./polaris-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { PolarisLedgerProvider } from "./polaris-ledger";

export interface PolarisEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "polaris"; data: PolarisContext } };
  isLast?: boolean;
  eventNumber?: number;
}

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

export function PolarisEventCard({ event, isLast, eventNumber }: PolarisEventCardProps) {
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

  const tokens: SpineTokenRow[] = [];
  if (isTouch && dColl !== 0)
    tokens.push({
      symbol: PETH.symbol,
      address: PETH.address,
      // A deposit moves pETH INTO the position; a withdrawal out of it.
      direction: dColl > 0 ? "left" : "right",
      value: Math.abs(dColl),
      // The header's rule: in full, three decimals, the token named.
      display: formatNumber(Math.abs(dColl)),
      unit: PETH.symbol,
    });
  if (isTouch && dDebt !== 0)
    tokens.push({
      symbol: stable,
      address: stableAddr,
      // A borrow sends the stablecoin OUT to the holder; a repay brings it in.
      direction: dDebt > 0 ? "right" : "left",
      value: Math.abs(dDebt),
      display: formatNumber(Math.abs(dDebt)),
      unit: stable,
    });

  const spine: SpineColumnProps =
    ctx.eventType === "liquidate"
      ? { icon: "warning", warningTone: "critical", isLast: !!isLast }
      : ctx.eventType === "transfer"
        ? { icon: "custody", isLast: !!isLast }
        : tokens.length === 0
          ? // An interest-only touch: the log wrote the pending legs in and
            // moved nothing the holder chose.
            { icon: "no-change", isLast: !!isLast }
          : { tokens, isLast: !!isLast };

  const head = usePolarisHeadSpec(event.actionLabel, ctx, coords);
  // The Collateral and Debt cells open into their ledgers where the page ties
  // its timeline to the Lifetime flows panel.
  const body = polarisEventBody(ctx, coords, useFlowFocus() != null);
  const slots: EventCardSlots = {
    event: {
      id: event.id,
      family: "polaris",
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
      number: eventNumber,
    },
    spine,
    head,
    caption: event.actionLabel,
    cells: body.cells,
    ledgers: {
      provider: (children) => (
        <PolarisLedgerProvider eventId={event.id} eventTs={event.timestamp} flowRow={ctx.eventType !== "transfer"}>
          {children}
        </PolarisLedgerProvider>
      ),
    },
    notes: body.notes,
    price: {
      // A liquidation is sent by the liquidator and a transfer is paid for
      // by whoever moved the NFT: neither transaction's gas is the CDP
      // holder's, so the row states gas on the holder's open, adjust and close.
      gas: ctx.eventType === "liquidate" || ctx.eventType === "transfer" ? undefined : eventGas(event.gas),
      prices: body.price ? [body.price] : [],
    },
    explainer: {
      body: <PolarisEventExplainer ctx={ctx} txHash={event.txHash} blockNumber={event.blockNumber} skipLead />,
      first: polarisExplainerTeaser(ctx, coords) ?? undefined,
    },
    learnMore: <LearnMore inline content={polarisLearnMoreContent(ctx)} />,
  };
  return <EventCard slots={slots} avatar={null} />;
}
