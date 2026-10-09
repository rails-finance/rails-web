"use client";

// f(x)'s event card on the shared shell's slots (ui-jobs 309 step 8): the head
// from fx-event-header.tsx, T2 from fx-cells.tsx (read when the card opens),
// the explanation and the Learn More from fx-event-explainer.tsx.
//
// Gas, the owner-paid rule: the price row states the transaction's gas only
// on the owner's transactions — an operate or an ownership transfer the
// owner in force at the block signed. A rebalance, a redemption or a
// liquidation is a keeper's or a redeemer's transaction, and an operate a
// third party sent is theirs: none states gas.
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
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import { ownerPaidGas } from "@/components/shared/event-price-row";
import type { SpineColumnProps } from "@/components/shared/spine-column";

import { fxExternalActor } from "@/lib/fx/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { type FxCoords } from "@/lib/fx/event-provenance";
import { fxExplainerTeaser } from "@/lib/fx/explainer-clauses";
import { FX_POOLS, isFxPoolKey } from "@/lib/fx/asset-catalog";
import { useFxHeadSpec } from "./fx-event-header";
import { FX_HEADS, useFxOpened } from "./fx-cells";
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

  const spine: SpineColumnProps = isLiq
    ? {
        icon: "warning",
        warningTone: "critical",
        warningTip: ctx.poolWide
          ? "A keeper liquidated the pool from its top tick down, reaching this position's tick. The owner did not act."
          : "A keeper liquidated this position: it repaid the debt and took the collateral plus the bonus. The owner did not act.",
        isLast: !!isLast,
      }
    : ctx.eventType === "tickRebalance" && ctx.redemption
      ? {
          icon: "warning",
          warningTone: "caution",
          warningTip:
            "Someone redeemed fxUSD for collateral from the pool's highest-ratio ticks, including this position's. The position gave up collateral and debt of equal value and stays open; the owner did not act.",
          isLast: !!isLast,
        }
      : ctx.eventType === "tickRebalance"
        ? // Derived socialized row — routine adverse, so caution:
          // the pool trimmed the position's whole tick; no action by the owner.
          {
            icon: "warning",
            warningTone: "caution",
            warningTip:
              "A keeper rebalanced the tick this position sat in: it repaid part of the debt and took collateral plus the bonus. The position stays open; the owner did not act.",
            isLast: !!isLast,
          }
        : isTransfer
          ? // An ownership handover is a people event with no token flow — the
            // person glyph with the join badge marks the new owner taking
            // over; dotted spine (nothing moved). The glyph is the event's
            // meaning, so it wins over the third-party fallback.
            { icon: "delegate", iconDirection: "up", isLast: !!isLast }
          : // Third-party operate badges the flow pink (color-grammar §4)
            // rather than replacing it — see spine-column's `externalParty`.
            { tokens, externalParty: !!extBy, isLast: !!isLast };

  const head = useFxHeadSpec({
    actionLabel: event.actionLabel,
    ctx,
    timestamp: event.timestamp,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    eventNumber,
    externalBy: extBy ?? undefined,
    flows: event.flows,
    eventId: event.id,
  });
  // The owner-paid rule (above): an operate or a transfer the owner in force
  // signed.
  const ownTx = ctx.eventType === "operate" || isTransfer;
  const gas = ownTx ? ownerPaidGas({ wallet: ctx.ownerAt ?? event.wallet, gas: event.gas }, ctx.txFrom) : undefined;
  const price = gas ? { gas, prices: [] } : undefined;
  const normalizedSymbol = meta?.normalizedSymbol ?? ctx.poolSymbol;

  const slots: EventCardSlots = {
    event: {
      id: event.id,
      family: "fx",
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
      number: eventNumber,
    },
    spine,
    head,
    caption: event.actionLabel,
    actor: { by: extBy ?? undefined },
    cells: isTransfer ? { none: "An ownership transfer moves no balance" } : { pending: FX_HEADS },
    // The Collateral and Debt cells open into their ledgers where the page
    // ties its timeline to the Lifetime flows panel.
    ledgers: {
      provider: (children) => (
        <FxLedgerProvider eventId={event.id} eventTs={event.timestamp}>
          {children}
        </FxLedgerProvider>
      ),
    },
    price,
    useOpened: () =>
      useFxOpened({
        ctx,
        txHash: event.txHash,
        blockNumber: event.blockNumber,
        normalizedSymbol,
        blockPeers,
        price,
      }),
    explainer: {
      body: (
        <FxEventExplainer
          ctx={ctx}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          blockPeers={blockPeers}
          skipLead
        />
      ),
      first: fxExplainerTeaser(ctx, coords),
    },
    learnMore: <LearnMore inline content={fxLearnMoreContent(ctx, terms?.expenseRatio)} />,
  };
  return <EventCard slots={slots} avatar={null} />;
}
