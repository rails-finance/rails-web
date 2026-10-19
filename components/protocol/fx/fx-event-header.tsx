"use client";

// f(x) event header (T1): the card's `head` slot, drawn by the shared
// ChainTruthRow. The head is words (rails-ops decision 0045,
// lib/fx/head-words.ts): the past-participle kind, the legs in leg order, and
// at most one clause ("Nothing left to take", "Debt written off", a transfer's
// "to 0x…" chip). The figures are on the spine's flank: an operate's moved
// amounts, a liquidation's seized collateral and cleared debt, a rebalance's
// or redemption's change to this position on its block's lead row. A tick's
// or the pool's totals are in the Explanation. Debt is fxUSD everywhere, never
// equated to dollars.

import type { FxContext } from "@/lib/shared/types/event-shape";
import { PartyChip, type ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
import { transferPartyProv, fxExternalActorProv, type FxCoords } from "@/lib/fx/event-provenance";
import { fxBlockChange, useFxSocializedReads } from "@/lib/fx/socialized-reads";
import { FX_POOLS, isFxPoolKey } from "@/lib/fx/asset-catalog";
import { fxT1Words } from "@/lib/fx/head-words";

export interface FxEventHeaderProps {
  ctx: FxContext;
  txHash?: string;
  blockNumber?: number;
  /** The verdict-passing third-party signer (fx-event-card's two-fact
   *  predicate) — presence renders the pink external-actor chip. */
  externalBy?: string;
  /** The row's id: a socialized row states the position's change only when it
   *  is its block's first row (lib/fx/socialized-reads.tsx). */
  eventId?: string;
}

/** A rebalance's, a redemption's or a pool-wide liquidation's change to this
 *  position: getPosition at block − 1 and at the block, stated on the block's
 *  first row (the read covers every row in it). `peers`: the position's rows
 *  in the block. */
export function useFxRowChange(
  ctx: FxContext,
  blockNumber: number | undefined,
  eventId: string | undefined,
): { change: { coll: number; debt: number } | null; lead: boolean; peers: number } {
  const socialized = useFxSocializedReads();
  const socializedRow = ctx.eventType === "tickRebalance" || (ctx.eventType === "liquidation" && ctx.poolWide === true);
  if (!socializedRow || blockNumber == null) return { change: null, lead: false, peers: 1 };
  const lead = eventId != null && socialized?.leads.has(eventId) === true;
  return {
    change: lead ? fxBlockChange(socialized?.reads, blockNumber) : null,
    lead,
    peers: socialized?.peers?.get(blockNumber) ?? 1,
  };
}

/** T1's head row spec (the card's `head` slot). */
export function useFxHeadSpec({
  ctx,
  txHash,
  blockNumber,
  externalBy,
  eventId,
}: FxEventHeaderProps): ChainTruthRowSpec {
  const meta = isFxPoolKey(ctx.pool) ? FX_POOLS[ctx.pool] : undefined;
  const coords: FxCoords = {
    txHash,
    blockNumber,
    pool: meta?.address,
    poolLabel: ctx.poolSymbol,
    positionId: ctx.positionId,
  };
  const poolLiq = ctx.eventType === "liquidation" && ctx.poolWide === true;
  const { change, lead, peers } = useFxRowChange(ctx, blockNumber, eventId);
  // Same-block rows state the change once, on the first.
  const note =
    peers > 1 ? (lead ? `${peers === 2 ? "both" : `all ${peers}`} in this block` : "included above") : undefined;
  const repaid = Number(ctx.tickRebFxusdDebts ?? "0") || 0;
  const writtenOff = poolLiq && change != null && -change.debt - repaid > 0.001;
  const words = fxT1Words(ctx, { writtenOff });

  // Ownership rows: the new holder as a neutral "to 0x…" chip, the clause
  // after "Transferred" (a mint's holder is its first owner). The chip prefix
  // is a literal, which check:parties maps to its role.
  const transferTo = ctx.eventType === "transfer" ? ctx.transferTo : undefined;
  const party = transferTo ? { prefix: "to", address: transferTo, prov: transferPartyProv("to", coords) } : undefined;

  return {
    label: words.kind,
    status: words.status,
    critical: ctx.eventType === "liquidation",
    // Rebalance rows follow the redemption grammar: the label in the caution
    // tone, the position's change on the warning node's flank.
    labelOnSpine: ctx.eventType === "tickRebalance" || poolLiq,
    deltas: [],
    clauses: words.clause
      ? [<span key="clause">{words.clause}</span>]
      : party
        ? [<PartyChip key="party" party={party} />]
        : undefined,
    note,
    externalActor:
      externalBy && ctx.ownerAt && ctx.txFrom
        ? {
            address: externalBy,
            prov: fxExternalActorProv({ owner: ctx.ownerAt, txFrom: ctx.txFrom }, coords),
            tip: (
              <>
                {externalBy} sent this transaction. The holder of the position at this block was {ctx.ownerAt}.
              </>
            ),
          }
        : undefined,
  };
}
