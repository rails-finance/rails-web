"use client";

// Composer: the Alchemist header / detail / plain-words pane in the universal
// EventCard shell.
//
// ONE TRANSACTION IS ONE CARD. An opening emits the position NFT's mint, the
// deposit that funded it and often a forwarding hop, all in one transaction;
// they used to draw two and three cards, each repeating the same reading of the
// same block and the same note about it. They arrive here together now, the way
// Liquity V2's `Open` is one card for a deposit and a borrow, and the header
// states every leg with its magnitude so the transaction reads without being
// expanded. The grouping is the timeline's (`lib/alchemix/timeline-runs`); this
// file takes the legs.
//
// A LINE-SCOPE ROW IS NEVER A LEG. A redemption names no position and belongs
// to the whole line, so it joins nobody's transaction and arrives here alone.
//
// SPINE GRAMMAR. The holder's own moves draw token rows on a solid spine, one
// per leg that moved something. The adverse ones draw the caution triangle: a
// force repay and a self-liquidation are consequences rather than choices, and
// a liquidation by another party is the critical tone with that party badged on
// the flow. An adverse leg takes the whole card's spine, because the
// transaction it was part of is one of those. A transaction of custody moves
// alone draws the send mark and no direction: the position changed hands and
// neither axis moved.
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
import { AlchemixEventHeader, ALCHEMIX_CAUTION } from "./alchemix-event-header";
import { AlchemixEventDetail } from "./alchemix-event-detail";
import { AlchemixEventExplainer, alchemixExplainerTeaser, alchemixLearnMoreFor } from "./alchemix-event-explainer";

const WAD = 1e18;

const scaled = (raw: string | null | undefined): number => {
  if (raw == null) return 0;
  const n = Number(raw.split(".")[0]);
  return Number.isFinite(n) ? n / WAD : 0;
};

export interface AlchemixEventCardProps {
  /** The legs of ONE transaction, in log order. One leg is the ordinary case;
   *  an opening brings two or three. */
  legs: AlchemistEvent[];
  /** The vault share ticker for this line, from the position's own row — the
   *  events do not carry it, and it is not guessed from the line key. */
  mytSymbol: string;
  /** The decimals of the asset under that MYT, from the same row and for the
   *  same reason: 6 on the USDC lines, 18 on the WETH one. Only the two fees
   *  paid in that asset need it; every other figure a log emits is in the
   *  synthetic or in shares, and both are 18 on every line. */
  underlyingDecimals?: number | null;
  /** Every row sharing the transaction, filtered or not. A reader's type filter
   *  can leave one leg of an opening standing alone, and that leg must still be
   *  able to tell a forwarding hop from a change of owner. */
  siblings?: AlchemistEvent[];
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
}

/** The shares or synthetic one leg moved for THIS position, and which way.
 *  Left is toward the wallet, right is toward the protocol. */
function legTokens(leg: AlchemistEvent, mytSymbol: string): SpineTokenRow[] {
  const ctx = leg.context.data;
  const raw = ctx.raw;
  if (ctx.scope === "line") return [];
  switch (ctx.eventType) {
    case "deposit":
      return [{ symbol: mytSymbol, direction: "right", value: scaled(raw.amount) }];
    case "withdraw":
      return [{ symbol: mytSymbol, direction: "left", value: scaled(raw.amount) }];
    case "mint":
      return [
        {
          symbol: ctx.syntheticSymbol,
          address: soleFlowAddress(leg.flows, ctx.syntheticSymbol),
          direction: "left",
          value: scaled(raw.amount),
        },
      ];
    case "burn":
      return [
        {
          symbol: ctx.syntheticSymbol,
          address: soleFlowAddress(leg.flows, ctx.syntheticSymbol),
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
}

const WARNING_LABEL: Record<string, string> = {
  liquidated: "Liquidation",
  self_liquidated: "Self-liquidation",
  force_repay: "Forced repayment",
  redemption: "Redemption",
  batch_liquidated: "Batch liquidation",
  fee_shortfall: "Fee shortfall",
};

export function AlchemixEventCard({
  legs,
  mytSymbol,
  underlyingDecimals = null,
  siblings,
  isFirst,
  isLast,
  eventNumber,
}: AlchemixEventCardProps) {
  const lead = legs[0];
  const sibs = siblings ?? legs;

  const coordsFor = (leg: AlchemistEvent): AlchemixCoords => {
    const ctx = leg.context.data;
    return {
      chainId: ctx.chainId as AlchemixCoords["chainId"],
      lineKey: ctx.lineKey,
      tokenId: ctx.tokenId ?? "",
      emitter: ctx.emitter,
      txHash: leg.txHash,
      blockNumber: leg.blockNumber,
    };
  };

  const adverse = legs.find((l) => l.context.data.eventType === "liquidated");
  const cautioned = legs.find((l) => ALCHEMIX_CAUTION.has(l.context.data.eventType));
  const custodyOnly = legs.every((l) => l.context.data.eventType === "transfer");

  const tokens = adverse || cautioned ? [] : legs.flatMap((leg) => legTokens(leg, mytSymbol));

  const iconSlot = custodyOnly ? (
    <SpineColumn
      tokens={[{ symbol: lead.context.data.syntheticSymbol, badge: "send" }]}
      spine="dotted"
      isFirst={isFirst}
      isLast={!!isLast}
    />
  ) : adverse || cautioned ? (
    <SpineColumn
      icon="warning"
      warningTone={adverse ? "critical" : "caution"}
      warningLabel={WARNING_LABEL[(adverse ?? cautioned)!.context.data.eventType]}
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
          legs={legs}
          siblings={sibs}
          mytSymbol={mytSymbol}
          timestamp={lead.timestamp}
          eventNumber={eventNumber}
          coordsFor={coordsFor}
        />
      }
      detail={<AlchemixEventDetail legs={legs} mytSymbol={mytSymbol} coordsFor={coordsFor} />}
      detailLabel="What the logs state"
      explainer={
        <AlchemixEventExplainer legs={legs} siblings={sibs} skipLead underlyingDecimals={underlyingDecimals} />
      }
      explainerLabel="Plain English"
      explainerTeaser={alchemixExplainerTeaser(legs, sibs, underlyingDecimals)}
      txHash={lead.txHash}
      learnMore={<LearnMore inline content={alchemixLearnMoreFor(legs)} />}
      persistKey={`alchemix-v3:${lead.id}`}
    />
  );
}
