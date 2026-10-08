"use client";

// Composer: wires the Moonwell header / detail / explainer into the universal
// EventCard shell (the plain-English explainer rides its own second-tier slot).

import type { BaseActivityEvent, MoonwellContext } from "@/lib/shared/types/event-shape";
import { EventCard } from "@/components/shared/event-card";

import { SpineColumn } from "@/components/shared/spine-column";
import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { useMoonwellCoords } from "@/lib/moonwell/deployment-context";
import { moonwellExplainerTeaser } from "@/lib/moonwell/explainer-clauses";
import { MoonwellEventHeader } from "./moonwell-event-header";
import { MoonwellEventDetail } from "./moonwell-event-detail";
import { MoonwellEventExplainer, moonwellLearnMoreContent } from "./moonwell-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";

export interface MoonwellEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "moonwell"; data: MoonwellContext } };
  isLast?: boolean;
  eventNumber?: number;
}

// direction "right" = token moves away from the wallet (deposit / repay),
// "left" = toward the wallet (withdraw / borrow). A transfer is neither — the
// mToken changed hands, nothing entered or left the market — so it has no
// entry here: the row wears the paper-plane badge and no flank (see `tokens`).
const DIRECTION: Record<Exclude<MoonwellContext["eventType"], "transfer_in" | "transfer_out">, "right" | "left"> = {
  mint: "right",
  redeem: "left",
  borrow: "left",
  repay: "right",
  liquidation: "left",
};

export function MoonwellEventCard({ event, isLast, eventNumber }: MoonwellEventCardProps) {
  const ctx = event.context.data;
  const isLiq = ctx.eventType === "liquidation";
  const kind = ctx.eventType;
  const isTransfer = kind === "transfer_in" || kind === "transfer_out";
  // Transfers move mTokens (no emitted underlying amount); everything else
  // moves the underlying.
  const mag = Math.abs(Number((isTransfer ? ctx.mTokensDelta : ctx.assetsDelta) ?? "0"));
  // The receipt coordinates — the market's identity resolved by whichever
  // deployment the page declares, plus its chain and capture source.
  const coords = useMoonwellCoords({
    market: ctx.market,
    symbol: ctx.marketSymbol,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    wallet: event.wallet,
  });
  const symbol = isTransfer ? (coords.marketLabel ?? `m${ctx.marketSymbol}`) : ctx.marketSymbol;
  // Third-party action: the owner neither signed the tx nor was the event's
  // own party. Router-proxied flows keep the owner as signer, so they do NOT
  // mark (they carry the neutral "via router" chip instead — see the header).
  const extBy = externalActor({ txFrom: ctx.txFrom, poolCaller: ctx.caller }, event.wallet);

  //
  // A transfer is a custody move: the token's icon wears the paper-plane badge
  // and neither flank is drawn — the two flanks are "out to the wallet" and
  // "into the protocol", and a transfer to another account is neither. The
  // header states the amount and the to/from counterparty.
  const tokens =
    isLiq || mag === 0
      ? undefined
      : isTransfer
        ? [
            {
              symbol,
              iconSymbol: ctx.marketSymbol,
              address: soleFlowAddress(event.flows, ctx.marketSymbol),
              badge: "send" as const,
            },
          ]
        : [
            {
              symbol,
              // The mToken wears the underlying's mark — "mUSDC" has no brand
              // of its own, and a letter would say less than the icon does.
              iconSymbol: ctx.marketSymbol,
              // …so the address must be the UNDERLYING's, not this row's symbol:
              // the chip resolves the mark under `iconSymbol`, and an address is
              // only meaningful paired with the symbol it belongs to. On a
              // transfer row the flows record the mToken alone, nothing matches
              // the underlying, and the lookup returns nothing — which is the
              // right answer, since the mToken's address would name the wrong
              // asset for the mark being drawn.
              address: soleFlowAddress(event.flows, ctx.marketSymbol),
              direction: DIRECTION[kind],
              value: mag,
            },
          ];

  const iconSlot = isLiq ? (
    <SpineColumn icon="warning" warningTone="critical" isLast={!!isLast} />
  ) : (
    <SpineColumn tokens={tokens} externalParty={!!extBy} isLast={!!isLast} />
  );

  return (
    <EventCard
      avatar={null}
      by={extBy ?? undefined}
      iconColumn={iconSlot}
      header={
        <MoonwellEventHeader
          actionLabel={event.actionLabel}
          ctx={ctx}
          timestamp={event.timestamp}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          eventNumber={eventNumber}
          externalBy={extBy ?? undefined}
          wallet={event.wallet}
          flows={event.flows}
        />
      }
      detail={
        <MoonwellEventDetail
          ctx={ctx}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          wallet={event.wallet}
          eventId={event.id}
          eventTs={event.timestamp}
        />
      }
      detailLabel="Position state"
      explainer={
        <MoonwellEventExplainer
          ctx={ctx}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          wallet={event.wallet}
          externalBy={extBy ?? undefined}
          skipLead
        />
      }
      explainerLabel="Plain English"
      explainerTeaser={moonwellExplainerTeaser(ctx, coords, extBy ?? undefined)}
      txHash={event.txHash}
      learnMore={<LearnMore inline content={moonwellLearnMoreContent(ctx, coords.chainId)} />}
      persistKey={`moonwell:${event.id}`}
    />
  );
}
