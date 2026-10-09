"use client";

// MakerDAO's event card on the shared shell's slots (ui-jobs 309 step 8): the
// head from makerdao-event-header.tsx, T2 from makerdao-cells.tsx, the
// explanation and the Learn More from makerdao-event-explainer.tsx. The index
// carries no gas for Maker's rows, so the price row states none.

import type { BaseActivityEvent, MakerDAOContext } from "@/lib/shared/types/event-shape";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { SpineColumnProps } from "@/components/shared/spine-column";
import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";

import { debtDeltaOf, type MakerCoords } from "@/lib/makerdao/event-provenance";
import { makerdaoExplainerTeaser } from "@/lib/makerdao/explainer-clauses";
import { useMakerHeadSpec } from "./makerdao-event-header";
import { MakerLedgerProvider } from "./makerdao-ledger";
import { useMakerCells, useMakerOpened } from "./makerdao-cells";
import { MakerDAOEventExplainer, makerdaoLearnMoreContent, useMakerRowExtras } from "./makerdao-event-explainer";
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

  const spine: SpineColumnProps =
    isGrab || isLseLiq
      ? { icon: "warning", warningTone: "critical", isLast: !!isLast }
      : isGive
        ? // An ownership handover is a people event with no token flow — the
          // person glyph with the join badge marks the new owner taking over;
          // dotted spine (nothing moved in the urn).
          { icon: "delegate", iconDirection: "up", isLast: !!isLast }
        : { tokens, externalParty: !!extBy, isLast: !!isLast };

  const head = useMakerHeadSpec({
    actionLabel: event.actionLabel,
    ctx,
    timestamp: event.timestamp,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    eventNumber,
    externalBy: extBy ?? undefined,
    wallet: event.wallet,
    flows: event.flows,
    ownership: isGive ? history.ownership.get(event.id) : undefined,
    txContext: isGive ? history.txContext.get(makerTxHashOf(event)) : undefined,
  });
  const cells = useMakerCells(ctx, coords, event.id);

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
    caption: event.actionLabel,
    actor: { by: extBy ?? undefined },
    cells,
    // The Collateral and Debt cells open into their ledgers where the page
    // ties its timeline to the Lifetime flows panel.
    ledgers: {
      provider: (children) => (
        <MakerLedgerProvider eventId={event.id} eventTs={event.timestamp}>
          {children}
        </MakerLedgerProvider>
      ),
    },
    useOpened: () => useMakerOpened(ctx, coords, event.id, undefined),
    explainer: {
      body: (
        <MakerDAOEventExplainer
          ctx={ctx}
          eventId={event.id}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          skipLead
        />
      ),
      first: makerdaoExplainerTeaser(ctx, coords, extras),
    },
    learnMore: <LearnMore inline content={makerdaoLearnMoreContent(ctx, extras.leftover != null)} />,
  };
  return <EventCard slots={slots} avatar={null} />;
}
