// f(x)'s own third-party-action predicate — NOT the shared one.
// ----------------------------------------------------------------------------
// lib/shared/external-actor.ts decides on (tx sender, the event's own party
// param). f(x)'s `Operate` log emits no caller, so there is no party param to
// compare against and the shared predicate can never mark an f(x) row. The
// second fact substituted here is the OWNER's contract-ness: a contract owner
// (Safe, manager, router-held position) legitimately has a differing signer, so
// only a position whose owner is a known EOA can be judged — an EOA cannot be
// msg.sender without also being the transaction's signer, so a signer that
// differs from an EOA owner is genuinely a third party.
//
// Lifted out of fx-event-card.tsx (where it was a file-local helper) so the
// position page can reduce the SAME verdict the cards render over the whole
// history — one definition, two surfaces.

import type { ExternalActorSummary } from "@/lib/shared/external-actor";

/** The row facts the verdict reads — a structural subset of FxContext, so both
 *  the card's context and a reduced row satisfy it. */
export interface FxActorRow {
  eventType?: string;
  txFrom?: string;
  ownerAt?: string;
  ownerAtIsContract?: boolean;
}

/** The display address for a third-party-acted f(x) event (the transaction
 *  sender), or null when the owner acted or the facts don't decide it. */
export function fxExternalActor(ctx: FxActorRow): string | null {
  // Only `operate` is judgeable: liquidations and tick rebalances are keeper
  // paths acting on a whole tick (never a marked position action), and a
  // transfer is owner-initiated by construction.
  if (ctx.eventType !== "operate") return null;
  if (!ctx.txFrom || !ctx.ownerAt) return null;
  // `false` is a POSITIVE EOA fact; undefined (kind scan pending) or true
  // (contract owner) both refuse to mark.
  if (ctx.ownerAtIsContract !== false) return null;
  return ctx.txFrom === ctx.ownerAt ? null : ctx.txFrom;
}

/** Reduce a position's events to who executed them, in the shared summary shape
 *  the position panes narrate. */
export function summariseFxExternalActors(rows: FxActorRow[]): ExternalActorSummary {
  const counts = new Map<string, number>();
  let external = 0;
  for (const row of rows) {
    const actor = fxExternalActor(row);
    if (!actor) continue;
    external++;
    counts.set(actor, (counts.get(actor) ?? 0) + 1);
  }
  return {
    total: rows.length,
    external,
    actors: [...counts]
      .map(([address, count]) => ({ address, count }))
      .sort((a, b) => b.count - a.count || a.address.localeCompare(b.address)),
  };
}
