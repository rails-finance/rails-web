"use client";

// The Polaris event card on the shared shell's slots (rails-ops
// reference/shared-event-card-spec.md §3; ui-jobs 309 step 5): the head with
// its ratio chip, T2's cells and notes (polaris-event-detail.tsx), and the
// price row with the holder's gas and pETH at the block in the market's unit.
//
// Spine grammar: a liquidation carries the critical warning spine; a transfer
// rides the custody glyph on a dotted spine (a party changed, nothing moved);
// every holder touch draws its token rows — pETH and the stablecoin, each
// with the direction the log's own sign says, and on the open and the close
// the gas compensation escrow's pETH row after them. On the spine the wallet is
// off-page left and the protocol is the card column, so deposit and repay point
// right and withdraw and borrow point left, as in the other CDP explorers.

import { useContext, useMemo } from "react";
import type { BaseActivityEvent, PolarisContext } from "@/lib/shared/types/event-shape";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import { EventPageContext } from "@/components/shared/event-page-aside";
import { eventGas } from "@/components/shared/event-price-row";
import type { SpineColumnProps, SpineTokenRow } from "@/components/shared/spine-column";
import { useFlowFocus } from "@/components/shared/flow-focus-context";

import { polarisEventProse, polarisT1Caption, polarisT1Words } from "@/lib/polaris/event-prose";
import { polarisLiquidationDeltas } from "@/lib/polaris/liquidation-legs";
import { PETH, POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";
import { formatNumber } from "@/lib/utils/format";
import { formatPeth } from "@/lib/polaris/figure-format";
import { polarisHeadSpec } from "./polaris-event-header";
import { polarisEventBody } from "./polaris-event-detail";
import {
  PolarisEventExplainer,
  PolarisExplainerTeaser,
  isGroupedExplanation,
  polarisEchoCoords,
  polarisEchoFor,
} from "./polaris-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { PolarisLedgerProvider } from "./polaris-ledger";
import { POLARIS_LIQ_CONSTANTS } from "./polaris-liquidation-forensics";
import { POLARIS_WORDS } from "@/lib/polaris/event-templates";

export interface PolarisEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "polaris"; data: PolarisContext } };
  isLast?: boolean;
  eventNumber?: number;
  /** The CDP's previous event (not a transfer): its prices and rate are what
   *  the sheet's Last event, Market move and changes read. */
  previousEvent?: BaseActivityEvent & { context: { protocol: "polaris"; data: PolarisContext } };
}

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

export function PolarisEventCard({ event, isLast, eventNumber, previousEvent }: PolarisEventCardProps) {
  const ctx = event.context.data;
  const coords = polarisEchoCoords(ctx, event.txHash, event.blockNumber);
  const prose = polarisEventProse({ ctx });
  const stable = ctx.stableSymbol;
  const stableAddr = POLARIS_MARKET_CONFIG[ctx.market].stable.address;

  const dColl = num(ctx.collChange);
  const dDebt = num(ctx.debtChange);
  const isTouch = ctx.eventType === "open" || ctx.eventType === "adjust" || ctx.eventType === "close";

  // Each leg keyed by what it is; "right" moves into the protocol.
  type Leg = { kind: "coll" | "debt" | "escrow"; row: SpineTokenRow };
  const legs: Leg[] = [];
  if (isTouch && dColl !== 0)
    legs.push({
      kind: "coll",
      row: {
        symbol: PETH.symbol,
        address: PETH.address,
        // A deposit moves pETH into the protocol; a withdrawal out to the wallet.
        direction: dColl > 0 ? "right" : "left",
        value: Math.abs(dColl),
        // The header's rule: in full, pETH to four decimals; the icon names the token.
        display: formatPeth(Math.abs(dColl)),
      },
    });
  if (isTouch && dDebt !== 0)
    legs.push({
      kind: "debt",
      row: {
        symbol: stable,
        address: stableAddr,
        // A borrow sends the stablecoin to the wallet; a repay returns it to the protocol.
        direction: dDebt > 0 ? "left" : "right",
        value: Math.abs(dDebt),
        display: formatNumber(Math.abs(dDebt)),
      },
    });

  // The gas compensation escrow, the holder's own pETH beside the
  // collateral: into the protocol at the open, back to the wallet at the
  // close. The amount is the protocol's constant; the log does not carry it.
  if (ctx.eventType === "open" || ctx.eventType === "close") {
    const amount = POLARIS_LIQ_CONSTANTS.gasComp.amount;
    legs.push({
      kind: "escrow",
      row: {
        symbol: PETH.symbol,
        address: PETH.address,
        direction: ctx.eventType === "open" ? "right" : "left",
        value: amount,
        display: formatPeth(amount),
        verb: ctx.eventType === "open" ? POLARIS_WORDS.spine_escrow_sent : POLARIS_WORDS.spine_escrow_returned,
      },
    });
  }

  // The spine orders the rows itself (rails-ops reference/shared-event-card-spec.md,
  // "Spine order"): what enters the position below what leaves it, and among
  // rows going one way the card's first row lowest. The card hands them in the
  // family's order, escrow, collateral, debt, so the escrow sits beneath the
  // collateral and the collateral beneath the debt. Drawn top to bottom: open →
  // debt out, collateral in, escrow in; close → collateral out, escrow out, debt in.
  const FAMILY_ORDER = ["escrow", "coll", "debt"] as const;
  const tokens: SpineTokenRow[] = [...legs]
    .sort((a, b) => FAMILY_ORDER.indexOf(a.kind) - FAMILY_ORDER.indexOf(b.kind))
    .map((l) => l.row);

  // A liquidation's seizure on the spine: the pETH taken below the debt the
  // pool cleared. The surplus stays with the owner and the head states it.
  const warningLegs = polarisLiquidationDeltas(ctx, coords)
    .filter((d) => !d.noSpineCounterpart)
    .map((d) => ({ label: d.label, value: Math.abs(d.value), symbol: d.symbol, address: d.address }));

  const spine: SpineColumnProps =
    ctx.eventType === "liquidate"
      ? { icon: "warning", warningTone: "critical", warningLegs, isLast: !!isLast }
      : ctx.eventType === "transfer"
        ? { icon: "custody", isLast: !!isLast }
        : tokens.length === 0
          ? // An interest-only touch: the log wrote the pending legs in and
            // moved nothing the holder chose.
            { icon: "no-change", isLast: !!isLast }
          : { tokens, isLast: !!isLast };

  const escrowAt = useMemo(
    () => ({ ctx, coords: polarisEchoCoords(ctx, event.txHash, event.blockNumber) }),
    [ctx, event.txHash, event.blockNumber],
  );
  // The event page draws the claimable surplus beside its title.
  const onPage = useContext(EventPageContext) != null;
  const head = polarisHeadSpec(ctx, coords, onPage ? "title" : "row");
  // The Collateral and Debt cells open into their ledgers where the page ties
  // its timeline to the Lifetime flows panel.
  const body = polarisEventBody(ctx, coords, useFlowFocus() != null, previousEvent?.context.data);
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
    // The phone caption and the row's accessible name follow the head's words.
    caption: polarisT1Caption(polarisT1Words(ctx)),
    // A transfer: the holder it reached only received it (ui-jobs 304). A
    // liquidation: the liquidator acted.
    actor: ctx.eventType === "transfer" || ctx.eventType === "liquidate" ? { byOwner: false } : undefined,
    cells: body.cells,
    sheet: body.sheet,
    ledgers: {
      provider: (children) => (
        <PolarisLedgerProvider
          eventId={event.id}
          eventTs={event.timestamp}
          flowRow={ctx.eventType !== "transfer"}
          escrow={escrowAt}
        >
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
      body: <PolarisEventExplainer ctx={ctx} txHash={event.txHash} blockNumber={event.blockNumber} />,
      first:
        prose.L4.length > 0 ? (
          <PolarisExplainerTeaser prose={prose} echo={(key) => polarisEchoFor(key, ctx, coords)} />
        ) : undefined,
      grouped: isGroupedExplanation(prose),
    },
    learnMore: <LearnMore inline content={prose.L5.content} />,
  };
  return <EventCard slots={slots} avatar={null} />;
}
