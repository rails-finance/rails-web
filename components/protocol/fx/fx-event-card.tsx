"use client";

// Composer: wires the f(x) header / detail / explainer into the universal
// EventCard shell (the plain-English explainer rides its own second-tier slot).
//
// Collateral on the spine chips and in the header is the TOKEN as transferred
// (wstETH / WBTC); the detail grid adds the pool's stETH-equivalent.
//
// Third-party marking is TWO-fact here, like the actor protocols but with a
// different second fact: f(x)'s Operate carries no caller param, so the
// verdict is tx sender ≠ owner-IN-FORCE-at-block (transfer-lane era walk)
// AND that owner is a known EOA (fx_owner_kind eth_getCode) — a contract
// owner's differing signer is SELF-action (Safe, manager) and never marks.
// Liquidations stay critical (never marked); transfers are owner-initiated
// by construction.

import type { BaseActivityEvent, FxContext } from "@/lib/shared/types/event-shape";
import { EventCard } from "@/components/shared/event-card";
import { SpineColumn } from "@/components/shared/spine-column";

import { fxExternalActor } from "@/lib/fx/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { type FxCoords } from "@/lib/fx/event-provenance";
import { fxExplainerTeaser } from "@/lib/fx/explainer-clauses";
import { FX_POOLS, isFxPoolKey } from "@/lib/fx/asset-catalog";
import { FxEventHeader } from "./fx-event-header";
import { FxEventDetail } from "./fx-event-detail";
import { FxEventExplainer, fxLearnMoreContent } from "./fx-event-explainer";
import { useFxPoolTerms } from "@/lib/fx/use-event-state";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { FxLedgerProvider } from "./fx-ledger";

export interface FxEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "fx"; data: FxContext } };
  isLast?: boolean;
  eventNumber?: number;
  /** tickRebalance rows only — how many of the position's rebalance rows share
   *  this block (the row's getPosition read then covers them together). */
  blockPeers?: number;
}

// The two-fact f(x) external-actor verdict now lives in lib/fx/external-actor.ts
// (see the header comment above for the rule): the position page reduces the
// SAME predicate over the whole history for the Explanation's operator bullet,
// so it cannot stay a file-local helper here.

export function FxEventCard({ event, isLast, eventNumber, blockPeers }: FxEventCardProps) {
  const ctx = event.context.data;
  const isLiq = ctx.eventType === "liquidation";
  const isTransfer = ctx.eventType === "transfer";
  const meta = isFxPoolKey(ctx.pool) ? FX_POOLS[ctx.pool] : undefined;
  const extBy = fxExternalActor(ctx);
  // The pool's terms at the latest read: the Learn more names the manager's
  // share of a bonus from it (one read per pool, shared by every row).
  const terms = useFxPoolTerms(ctx.eventType === "liquidation" || ctx.eventType === "tickRebalance" ? ctx.pool : null);

  const collDelta = Number(ctx.collDelta ?? "0") || 0;
  const debtDelta = Number(ctx.debtDelta ?? "0") || 0;

  // Echo: these token rows only render for a plain operate (isLiq/tickRebalance/
  // transfer/extBy all branch to a different iconSlot below), where the header
  // registers collDeltaProv/debtDeltaProv bare on open/adjust and signed once
  // the touch empties the position (fx-event-header.tsx's `perAxis`).
  const coords: FxCoords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    pool: meta?.address,
    poolLabel: ctx.poolSymbol,
    positionId: ctx.positionId,
  };

  // Token chips: collateral (TOKEN units) + fxUSD. direction "right" = toward
  // the protocol (deposit / repay), "left" = toward the wallet (withdraw /
  // borrow) — the Maker dink/dart grammar.
  //
  // Both chips get the token's address alongside its symbol, taken from the
  // event's flows. f(x) runs a handful of pools, so the symbol route already
  // resolves them, and the gain is that the chip stops depending on a list
  // being updated when a pool is added. The flow lookup answers only on an
  // unambiguous single match: a symbol on two flows names two contracts, and
  // choosing one of them would be a guess dressed up as a fact.
  const tokens = isLiq
    ? undefined
    : [
        ...(collDelta !== 0
          ? [
              {
                symbol: ctx.poolSymbol,
                address: soleFlowAddress(event.flows, ctx.poolSymbol),
                direction: (collDelta > 0 ? "right" : "left") as "right" | "left",
                value: Math.abs(collDelta),
              },
            ]
          : []),
        ...(debtDelta !== 0
          ? [
              {
                symbol: "fxUSD",
                address: soleFlowAddress(event.flows, "fxUSD"),
                direction: (debtDelta > 0 ? "left" : "right") as "right" | "left",
                value: Math.abs(debtDelta),
              },
            ]
          : []),
      ];

  const iconSlot = isLiq ? (
    <SpineColumn
      icon="warning"
      warningTone="critical"
      warningTip={
        ctx.poolWide
          ? "A keeper liquidated the pool from its top tick down, reaching this position's tick. The owner did not act."
          : "A keeper liquidated this position: it repaid the debt and took the collateral plus the bonus. The owner did not act."
      }
      isLast={!!isLast}
    />
  ) : ctx.eventType === "tickRebalance" && ctx.redemption ? (
    <SpineColumn
      icon="warning"
      warningTone="caution"
      warningTip="Someone redeemed fxUSD for collateral from the pool's highest-ratio ticks, including this position's. The position gave up collateral and debt of equal value and stays open; the owner did not act."
      isLast={!!isLast}
    />
  ) : ctx.eventType === "tickRebalance" ? (
    // Derived socialized row — routine adverse (caution, not critical): the
    // pool trimmed the position's whole tick; no action by the owner.
    <SpineColumn
      icon="warning"
      warningTone="caution"
      warningTip="A keeper rebalanced the tick this position sat in: it repaid part of the debt and took collateral plus the bonus. The position stays open; the owner did not act."
      isLast={!!isLast}
    />
  ) : isTransfer ? (
    // An ownership handover is a people event with no token flow — the person
    // glyph with the join badge marks the new owner taking over; dotted spine
    // (nothing moved). Identical to makerdao's `give` and fluid's `transfer`,
    // which fx was the lone holdout against: it rendered a blank slot instead.
    // The glyph is the event's own MEANING, so it wins over the third-party
    // fallback the way a check/cross badge does — that fact is still carried by
    // the dotted spine and the header's from → to chips.
    <SpineColumn icon="delegate" iconDirection="up" isLast={!!isLast} />
  ) : (
    // Third-party operate badges the flow pink (color-grammar §4) rather than
    // replacing it — see spine-column's `externalParty`.
    <SpineColumn tokens={tokens} externalParty={!!extBy} isLast={!!isLast} />
  );

  // The Collateral and Debt cells open into their ledgers where the page ties
  // its timeline to the Lifetime flows panel.
  return (
    <FxLedgerProvider eventId={event.id} eventTs={event.timestamp}>
      <EventCard
        avatar={null}
        by={extBy ?? undefined}
        iconColumn={iconSlot}
        header={
          <FxEventHeader
            actionLabel={event.actionLabel}
            ctx={ctx}
            timestamp={event.timestamp}
            txHash={event.txHash}
            blockNumber={event.blockNumber}
            eventNumber={eventNumber}
            externalBy={extBy ?? undefined}
            flows={event.flows}
            eventId={event.id}
          />
        }
        detail={
          <FxEventDetail
            ctx={ctx}
            txHash={event.txHash}
            blockNumber={event.blockNumber}
            normalizedSymbol={meta?.normalizedSymbol ?? ctx.poolSymbol}
            blockPeers={blockPeers}
          />
        }
        detailLabel="Position before → after"
        explainer={
          <FxEventExplainer
            ctx={ctx}
            txHash={event.txHash}
            blockNumber={event.blockNumber}
            blockPeers={blockPeers}
            skipLead
          />
        }
        explainerLabel="Plain English"
        explainerTeaser={fxExplainerTeaser(ctx, coords)}
        txHash={event.txHash}
        learnMore={<LearnMore inline content={fxLearnMoreContent(ctx, terms?.expenseRatio)} />}
        persistKey={`fx:${event.id}`}
      />
    </FxLedgerProvider>
  );
}
