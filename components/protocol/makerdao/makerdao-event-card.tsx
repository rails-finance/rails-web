"use client";

// MakerDAO's event card on the shared shell's slots (ui-jobs 309 step 8): the
// head from makerdao-event-header.tsx, T2 from makerdao-sheet.tsx (the
// cells in makerdao-cells.tsx where it states none), the
// explanation from makerdao-event-explainer.tsx and the Learn More from the
// generator (lib/makerdao/event-prose.ts). The index
// carries no gas for Maker's rows, so the price row states none.

import type { BaseActivityEvent, MakerDAOContext } from "@/lib/shared/types/event-shape";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { SpineColumnProps, SpineWarningLeg } from "@/components/shared/spine-column";
import { EventPageContext } from "@/components/shared/event-page-aside";
import { useContext } from "react";
import { MAKER_LEG_WORDS, makerT1Caption } from "@/lib/makerdao/head-words";
import { ownerChipText } from "@/lib/makerdao/ownership-prose";
import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";

import { debtDeltaOf, type MakerCoords } from "@/lib/makerdao/event-provenance";
import { useMakerHeadSpec } from "./makerdao-event-header";
import { MakerLedgerProvider } from "./makerdao-ledger";
import { useMakerCells, useMakerOpened } from "./makerdao-cells";
import { useMakerSheet } from "./makerdao-sheet";
import { MakerDAOEventExplainer, MakerExplainerLead, useMakerRowExtras } from "./makerdao-event-explainer";
import { makerEventModal } from "@/lib/makerdao/event-prose";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { openedForSigner, useMakerVaultHistory } from "@/lib/makerdao/vault-history";
import { makerTxHashOf } from "@/lib/makerdao/market-notes";

export interface MakerDAOEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "makerdao"; data: MakerDAOContext } };
  isLast?: boolean;
  eventNumber?: number;
}

export function MakerDAOEventCard({ event, isLast, eventNumber }: MakerDAOEventCardProps) {
  const ctx = event.context.data;
  const isGrab = ctx.eventType === "grab";
  const isFork = ctx.eventType === "fork-out" || ctx.eventType === "fork-in";
  const isGive = ctx.eventType === "give";
  // LockStake auction lifecycle (zero-delta markers; the paired grab carries
  // the seizure) — critical treatment like grab, no token chips.
  const isLseLiq = ctx.eventType === "lse-kick" || ctx.eventType === "lse-take" || ctx.eventType === "lse-remove";
  const dink = Number(ctx.dink);
  const dart = Number(ctx.dart);
  // Third-party action: the owner neither signed the tx nor initiated it
  // through their own proxy (txTo plays the party-param role — Maker's Vat
  // has none, but a DSProxy is auth-gated so the entry contract discriminates
  // exactly). Passive events ride the dotted spine; the pink external-party
  // glyph replaces the token flow, and the header keeps the moved amounts
  // plus the "by 0x…" chip. Judged against the owner IN FORCE at the event's
  // block (ownerAt, era-aware) — the current owner may postdate a give.
  const history = useMakerVaultHistory();
  // A vault a contract created and handed to the signer in the same
  // transaction was opened by that signer, not by a third party.
  const extBy = openedForSigner(event, history.txRows)
    ? null
    : externalActor({ txFrom: ctx.txFrom, poolCaller: ctx.txTo }, ctx.ownerAt ?? event.wallet);

  const coords: MakerCoords = { txHash: event.txHash, blockNumber: event.blockNumber, urn: ctx.urn, ilk: ctx.ilk };
  const debt = debtDeltaOf(ctx, ilkDebtSymbol(ctx.ilk), coords);
  // The closed card reads only what the page holds (no chain call per row).
  const extras = useMakerRowExtras(ctx, event.id, event.txHash, event.blockNumber, false);

  // Token chips: collateral (dink) + debt (dart; DAI, or USDS on LockStake
  // urns). direction "right" = toward the protocol (deposit / repay), "left" =
  // toward the wallet (withdraw / generate). A fork moves the debt WITH the
  // collateral — nothing is minted or burned — so fork rows show only the
  // collateral chip (its vault-scope direction is real); the header deltas and
  // explainer carry the debt figure.
  const tokens = isGrab
    ? undefined
    : [
        ...(dink !== 0
          ? [
              {
                symbol: ctx.collateralSymbol,
                direction: (dink > 0 ? "right" : "left") as "right" | "left",
                value: Math.abs(dink),
              },
            ]
          : []),
        ...(dart !== 0 && !isFork
          ? [
              {
                symbol: ilkDebtSymbol(ctx.ilk),
                // DAI or USDS depending on the ilk, and the debt flow names the
                // ERC-20 the join actually minted — which is what the icon chip
                // needs, since a symbol alone only reaches the house table. The
                // COLLATERAL row above gets no such treatment: a Vat position
                // is identified by ilk, not by contract, so the collateral flow
                // carries no token address to pass on. Its symbol lookup is
                // what draws that chip today and continues to.
                address: soleFlowAddress(event.flows, ilkDebtSymbol(ctx.ilk)),
                direction: (dart > 0 ? "left" : "right") as "right" | "left",
                value: Math.abs(debt.value),
              },
            ]
          : []),
      ];

  // A liquidation's legs, the collateral seized below the debt cleared: the
  // warning node's flank carries them. The debt leg needs the rate at the
  // block (`debtChange`); without it the Vat's normalized debt is no token
  // amount, and the sheet states it.
  const warningLegs = ((): SpineWarningLeg[] | undefined => {
    if (!isGrab) return undefined;
    const legs: SpineWarningLeg[] = [];
    if (dink !== 0)
      legs.push({
        label: MAKER_LEG_WORDS.seized,
        value: Math.abs(dink),
        symbol: ctx.collateralSymbol,
        direction: "left",
      });
    if (dart !== 0 && ctx.debtChange != null)
      legs.push({
        label: MAKER_LEG_WORDS.cleared,
        value: Math.abs(debt.value),
        symbol: ilkDebtSymbol(ctx.ilk),
        address: soleFlowAddress(event.flows, ilkDebtSymbol(ctx.ilk)),
      });
    return legs;
  })();

  const spine: SpineColumnProps =
    isGrab || isLseLiq
      ? { icon: "warning", warningTone: "critical", warningLegs, isLast: !!isLast }
      : isGive
        ? // An ownership handover is a people event with no token flow — the
          // person glyph with the join badge marks the new owner taking over;
          // dotted spine (nothing moved in the urn).
          { icon: "handover", isLast: !!isLast }
        : { tokens, externalParty: !!extBy, isLast: !!isLast };

  // The timeline's head is words (decision 0045); the event page's card keeps
  // the head its title states.
  const page = useContext(EventPageContext) != null;
  const ownership = isGive ? history.ownership.get(event.id) : undefined;
  const txContext = isGive ? history.txContext.get(makerTxHashOf(event)) : undefined;
  const newOwner = ownership ? ownerChipText(ownership.after, txContext) : null;
  const giveTo = isGive ? (ctx.giveDstOwner ?? ctx.giveDst) : undefined;
  const head = useMakerHeadSpec({
    mode: page ? "title" : "row",
    actionLabel: event.actionLabel,
    ctx,
    timestamp: event.timestamp,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    eventNumber,
    externalBy: extBy ?? undefined,
    wallet: event.wallet,
    flows: event.flows,
    ownership,
    txContext,
  });
  const cells = useMakerCells(ctx, coords, event.id);
  const sheet = useMakerSheet(ctx, coords);

  const slots: EventCardSlots = {
    event: {
      id: event.id,
      family: "makerdao",
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
      number: eventNumber,
    },
    spine,
    head,
    caption: page
      ? event.actionLabel
      : makerT1Caption(ctx, giveTo ? { address: newOwner?.address || giveTo, name: newOwner?.name } : undefined),
    actor: { by: extBy ?? undefined },
    cells,
    // The balance sheet, where the page holds the ilk read at the block; an
    // opened card reads the block and returns the sheet from `useOpened`.
    sheet,
    // The Collateral and Debt cells open into their ledgers where the page
    // ties its timeline to the Lifetime flows panel.
    ledgers: {
      provider: (children) => (
        <MakerLedgerProvider eventId={event.id} eventTs={event.timestamp}>
          {children}
        </MakerLedgerProvider>
      ),
    },
    useOpened: () => ({ ...useMakerOpened(ctx, coords, event.id, undefined), sheet: useMakerSheet(ctx, coords, true) }),
    // The event page's title is the Explanation's first sentence (rails-ops
    // decision 0045, "Ruled since"); the pane there opens on the second.
    explainer: {
      body: (
        <MakerDAOEventExplainer
          ctx={ctx}
          eventId={event.id}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          leadOnTitle={page}
        />
      ),
      first: page ? (
        <MakerExplainerLead ctx={ctx} eventId={event.id} txHash={event.txHash} blockNumber={event.blockNumber} />
      ) : undefined,
    },
    learnMore: <LearnMore inline content={makerEventModal(ctx, extras)} />,
  };
  return <EventCard slots={slots} avatar={null} />;
}
