// A custody transfer that shares its transaction with another leg of the
// position is drawn inside that transaction's card, so it is not counted as an
// event of its own: the timeline's counts and filter menu count what is drawn.
//
// The rule, per transaction: where any leg is not a transfer, every transfer
// rides on the card. Where every leg is a transfer, the first in log order
// carries the card and the rest ride on it, so a later change of hands draws
// one row of its own and counts once. rails-ops decisions/0032.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";

type Leg = BaseActivityEvent & { context: { data: { eventType: string } } };

export const logIndexOf = (e: BaseActivityEvent): number => {
  const n = Number(e.id.split(":").pop());
  return Number.isFinite(n) ? n : 0;
};

export interface RidingTransfers<E extends Leg> {
  /** The events that are drawn and counted: every leg that is not riding. */
  drawn: E[];
  /** The transfers riding on each transaction's card, by transaction hash. */
  ridersByTx: Map<string, E[]>;
}

export function splitRidingTransfers<E extends Leg>(events: E[], inScope: (e: E) => boolean): RidingTransfers<E> {
  const byTx = new Map<string, E[]>();
  for (const e of events) {
    if (!inScope(e) || !e.txHash) continue;
    const arr = byTx.get(e.txHash);
    if (arr) arr.push(e);
    else byTx.set(e.txHash, [e]);
  }
  const riding = new Set<string>();
  const ridersByTx = new Map<string, E[]>();
  for (const [tx, legs] of byTx) {
    if (legs.length < 2) continue;
    const transfers = legs.filter((l) => l.context.data.eventType === "transfer");
    if (transfers.length === 0) continue;
    const riders =
      transfers.length < legs.length
        ? transfers
        : [...transfers].sort((a, b) => logIndexOf(a) - logIndexOf(b)).slice(1);
    if (riders.length === 0) continue;
    ridersByTx.set(tx, riders);
    for (const r of riders) riding.add(r.id);
  }
  return { drawn: riding.size === 0 ? events : events.filter((e) => !riding.has(e.id)), ridersByTx };
}

/** A card's legs with the transfers riding on its transaction, in log order. */
export function withRiders<E extends BaseActivityEvent>(legs: E[], ridersByTx: Map<string, E[]>): E[] {
  const tx = legs[0]?.txHash;
  const riders = tx ? (ridersByTx.get(tx) ?? []) : [];
  const ids = new Set(legs.map((l) => l.id));
  return [...legs, ...riders.filter((r) => !ids.has(r.id))].sort((a, b) => logIndexOf(a) - logIndexOf(b));
}
