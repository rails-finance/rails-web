"use client";

// Composer: fills the shared event card's slots (components/shared/
// event-card.tsx; ui-jobs 309) from a Moonwell event: the head, the balance
// sheet (ui-jobs 330; moonwell-event-sheet.tsx) where the page replays the
// account, else the account's Collateral and Debt ledger cells with the
// market's cells after them, the forensics and the Comptroller's lines as
// notes, the price row and the explanation.

import type { BaseActivityEvent, MoonwellContext } from "@/lib/shared/types/event-shape";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { SpineColumnProps, SpineWarningLeg } from "@/components/shared/spine-column";
import { EventPageContext } from "@/components/shared/event-page-aside";
import { useContext } from "react";
import { MOONWELL_HEAD_WORDS } from "@/lib/moonwell/event-templates";
import { moonwellEventProse } from "@/lib/moonwell/event-prose";
import { ownerPaidGas } from "@/components/shared/event-price-row";
import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { useMoonwellCoords, useMoonwellDeployment } from "@/lib/moonwell/deployment-context";
import { moonwellT1Caption, moonwellTransferOutLead, useMoonwellHeadSpec } from "./moonwell-event-header";
import { useMoonwellCells } from "./moonwell-event-detail";
import { useMoonwellSheet } from "./moonwell-event-sheet";
import {
  MoonwellEventExplainer,
  MoonwellExplainerTeaser,
  isGroupedMoonwellExplanation,
  moonwellLearnMoreContent,
} from "./moonwell-event-explainer";
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
  // A transfer is a custody move: the token's icon wears the paper-plane
  // badge, its amount on the flank the position's balance moved by, out to the
  // left or in to the right; the head's clause names the counterparty.
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
              direction: kind === "transfer_out" ? ("left" as const) : ("right" as const),
              value: mag,
              unit: symbol,
              fullValue: true,
              verb: kind === "transfer_out" ? MOONWELL_HEAD_WORDS.legSent : MOONWELL_HEAD_WORDS.legReceived,
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

  // A liquidation's legs, the collateral seized below the debt repaid: the
  // warning node's flank carries them.
  const dep = useMoonwellDeployment();
  const warningLegs = ((): SpineWarningLeg[] | undefined => {
    if (!isLiq) return undefined;
    const legs: SpineWarningLeg[] = [];
    const seized = Math.abs(Number(ctx.seizeTokens ?? "0")) || 0;
    if (seized !== 0 && ctx.collateralSymbol) {
      const collMSym = ctx.collateralMarket
        ? dep.market(ctx.collateralMarket, ctx.collateralSymbol).mSymbol
        : `m${ctx.collateralSymbol}`;
      legs.push({ label: MOONWELL_HEAD_WORDS.legSeized, value: seized, symbol: collMSym, direction: "left" });
    }
    const repaid = Math.abs(Number(ctx.assetsDelta ?? "0")) || 0;
    if (repaid !== 0)
      legs.push({
        label: MOONWELL_HEAD_WORDS.legRepaid,
        value: repaid,
        symbol: ctx.marketSymbol,
        address: soleFlowAddress(event.flows, ctx.marketSymbol),
      });
    return legs;
  })();

  const spine: SpineColumnProps = isLiq
    ? { icon: "warning", warningTone: "critical", warningLegs, isLast: !!isLast }
    : { tokens, externalParty: !!extBy, isLast: !!isLast };

  // The timeline's head is words (decision 0045); the event page's card keeps
  // the head its title states.
  const page = useContext(EventPageContext) != null;
  const head = useMoonwellHeadSpec({
    mode: page ? "title" : "row",
    actionLabel: event.actionLabel,
    ctx,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    externalBy: extBy ?? undefined,
    wallet: event.wallet,
    flows: event.flows,
  });
  const { cells, ledgers, notes, prices } = useMoonwellCells({
    ctx,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    wallet: event.wallet,
    eventId: event.id,
    eventTs: event.timestamp,
  });
  const sheet = useMoonwellSheet({ ctx, eventId: event.id, label: event.actionLabel, coords });

  const prose = moonwellEventProse({
    ctx,
    externalBy: extBy ?? undefined,
    mtoken: coords.mtoken,
    marketLabel: coords.marketLabel,
  });

  const slots: EventCardSlots = {
    event: {
      id: event.id,
      family: "moonwell",
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
      number: eventNumber,
    },
    spine,
    head,
    caption: page
      ? event.actionLabel
      : moonwellT1Caption(
          ctx,
          event.actionLabel,
          kind === "transfer_out" ? moonwellTransferOutLead(ctx, event.wallet, coords.mtoken, symbol) : undefined,
        ),
    // A transfer received: the sender acted (ui-jobs 304).
    actor: { by: extBy ?? undefined, byOwner: kind === "transfer_in" ? false : undefined },
    cells,
    sheet,
    ledgers,
    notes,
    price: { gas: ownerPaidGas(event, ctx.txFrom), prices },
    explainer: {
      body: (
        <MoonwellEventExplainer
          ctx={ctx}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          wallet={event.wallet}
          externalBy={extBy ?? undefined}
        />
      ),
      first: prose.L4.length > 0 ? <MoonwellExplainerTeaser ctx={ctx} coords={coords} prose={prose} /> : undefined,
      grouped: isGroupedMoonwellExplanation(prose),
    },
    learnMore: <LearnMore inline content={moonwellLearnMoreContent(ctx, coords)} />,
  };

  return <EventCard slots={slots} avatar={null} />;
}
