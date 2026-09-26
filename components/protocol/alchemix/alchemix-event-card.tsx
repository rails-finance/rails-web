"use client";

// Composer: the Alchemist header / detail / plain-words pane in the universal
// EventCard shell.
//
// SPINE GRAMMAR. The holder's own moves draw token rows on a solid spine. The
// adverse ones draw the caution triangle: a force repay and a self-liquidation
// are consequences rather than choices, and a liquidation by another party is
// the critical tone with that party badged on the flow. A custody move draws
// the send mark and no direction — the position changed hands and neither axis
// moved.
//
// THE THREE LINE-SCOPE ROWS DRAW NO TOKEN FLOW AT ALL. A redemption applies one
// ratio to every open position on the line and names none of them; the batch
// rows carry the hash of an account list. Drawing this position's spine flank
// for any of them would attribute a movement the event does not state.

import type { AlchemistEvent } from "@/lib/alchemix/explainer-clauses";
import { EventCard } from "@/components/shared/event-card";
import { SpineColumn, type SpineTokenRow } from "@/components/shared/spine-column";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { soleFlowAddress } from "@/lib/shared/format-event";
import type { AlchemixCoords } from "@/lib/alchemix/event-provenance";
import { AlchemixEventHeader } from "./alchemix-event-header";
import { AlchemixEventDetail } from "./alchemix-event-detail";
import {
  AlchemixEventExplainer,
  alchemixExplainerTeaser,
  alchemixLearnMoreContent,
} from "./alchemix-event-explainer";

const WAD = 1e18;

const scaled = (raw: string | null | undefined): number => {
  if (raw == null) return 0;
  const n = Number(raw.split(".")[0]);
  return Number.isFinite(n) ? n / WAD : 0;
};

export interface AlchemixEventCardProps {
  event: AlchemistEvent;
  /** The vault share ticker for this line, from the position's own row — the
   *  events do not carry it, and it is not guessed from the line key. */
  mytSymbol: string;
  /** Every row sharing this event's transaction. An opening emits three logs
   *  from two contracts, so the mint card needs its siblings to state what the
   *  transaction did; each card still carries its own receipt and tx link. */
  siblings?: AlchemistEvent[];
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
}

/** Adverse but chosen-for-you; the position's own consequence. */
const CAUTION = new Set(["force_repay", "self_liquidated", "redemption", "batch_liquidated", "fee_shortfall"]);

export function AlchemixEventCard({
  event,
  mytSymbol,
  siblings,
  isFirst,
  isLast,
  eventNumber,
}: AlchemixEventCardProps) {
  const ctx = event.context.data;
  const sibs = siblings ?? [event];
  const raw = ctx.raw;
  const coords: AlchemixCoords = {
    chainId: ctx.chainId as AlchemixCoords["chainId"],
    lineKey: ctx.lineKey,
    tokenId: ctx.tokenId ?? "",
    emitter: ctx.emitter,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
  };

  const critical = ctx.eventType === "liquidated";
  const caution = CAUTION.has(ctx.eventType);
  const custody = ctx.eventType === "transfer";

  /** The shares or synthetic this event moved for THIS position, and which way.
   *  Left is toward the wallet, right is toward the protocol. */
  const tokens: SpineTokenRow[] = (() => {
    if (ctx.scope === "line" || critical || caution || custody) return [];
    switch (ctx.eventType) {
      case "deposit":
        return [{ symbol: mytSymbol, direction: "right", value: scaled(raw.amount) }];
      case "withdraw":
        return [{ symbol: mytSymbol, direction: "left", value: scaled(raw.amount) }];
      case "mint":
        return [
          {
            symbol: ctx.syntheticSymbol,
            address: soleFlowAddress(event.flows, ctx.syntheticSymbol),
            direction: "left",
            value: scaled(raw.amount),
          },
        ];
      case "burn":
        return [
          {
            symbol: ctx.syntheticSymbol,
            address: soleFlowAddress(event.flows, ctx.syntheticSymbol),
            direction: "right",
            value: scaled(raw.amount),
          },
        ];
      case "repay":
        // The shares only. The debt this bought is a credit against the
        // position, not a token this wallet moved, so it has no flank.
        return [{ symbol: mytSymbol, direction: "right", value: scaled(raw.amount) }];
      default:
        return [];
    }
  })();

  const warningLabel =
    ctx.eventType === "liquidated"
      ? "Liquidation"
      : ctx.eventType === "self_liquidated"
        ? "Self-liquidation"
        : ctx.eventType === "force_repay"
          ? "Forced repayment"
          : ctx.eventType === "redemption"
            ? "Redemption"
            : ctx.eventType === "batch_liquidated"
              ? "Batch liquidation"
              : ctx.eventType === "fee_shortfall"
                ? "Fee shortfall"
                : undefined;

  const iconSlot = custody ? (
    <SpineColumn
      tokens={[{ symbol: ctx.syntheticSymbol, badge: "send" }]}
      spine="dotted"
      isFirst={isFirst}
      isLast={!!isLast}
    />
  ) : critical || caution ? (
    <SpineColumn
      icon="warning"
      warningTone={critical ? "critical" : "caution"}
      warningLabel={warningLabel}
      spine="dotted"
      isFirst={isFirst}
      isLast={!!isLast}
    />
  ) : (
    <SpineColumn tokens={tokens} isFirst={isFirst} isLast={!!isLast} />
  );

  return (
    <EventCard
      avatar={null}
      iconColumn={iconSlot}
      header={
        <AlchemixEventHeader
          ctx={ctx}
          actionLabel={event.actionLabel}
          mytSymbol={mytSymbol}
          timestamp={event.timestamp}
          eventNumber={eventNumber}
          coords={coords}
        />
      }
      detail={<AlchemixEventDetail ctx={ctx} mytSymbol={mytSymbol} coords={coords} />}
      detailLabel="What the log states"
      explainer={<AlchemixEventExplainer ctx={ctx} siblings={sibs} self={event} skipLead />}
      explainerLabel="Plain English"
      explainerTeaser={alchemixExplainerTeaser(ctx, sibs, event)}
      txHash={event.txHash}
      learnMore={<LearnMore inline content={alchemixLearnMoreContent(ctx)} />}
      persistKey={`alchemix-v3:${event.id}`}
    />
  );
}
