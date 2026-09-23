// Third-party-action predicate for the chain-state timelines (Aave family,
// Morpho, Compound V3 — each maps its own party param onto `poolCaller`).
// ----------------------------------------------------------------------------
// An event is third-party-acted exactly when the position owner is NEITHER the
// transaction sender NOR the contract's msg.sender (the event's own party
// param — Aave's Pool caller, Morpho's `caller`, Comet's `from` funder). Each
// fact alone over-marks: routed flows (ETH gateways, adapters, bundlers) have
// a router as contract caller but the owner as signer; contract-owned
// positions (Safes) have a signer EOA but the owner contract as caller. Only
// genuine external actions — someone else supplying to, repaying for, or
// drawing delegated credit from the position — fail both (~0.5–1.5% of
// events, measured on the index).

/** The display address for a third-party-acted event — the transaction sender
 *  (the party who signed) — or null when the owner acted (or the facts are
 *  absent, e.g. recipient-only rows, liquidations, or a pre-fact payload). */
export function externalActor(ctx: { txFrom?: string; poolCaller?: string }, wallet: string): string | null {
  if (!ctx.txFrom || !ctx.poolCaller) return null;
  const w = wallet.toLowerCase();
  if (ctx.txFrom === w || ctx.poolCaller === w) return null;
  return ctx.txFrom;
}

/** Who has been acting on a position, across its whole history. */
export interface ExternalActorSummary {
  /** Rows considered — the position's loaded event history. */
  total: number;
  /** How many of them a third party executed. */
  external: number;
  /** The distinct third parties, most-active first. Plural by default: a
   *  professionally run position routinely splits work between a treasury
   *  account and one or more operating bots, so nothing downstream may assume
   *  a single operator. */
  actors: { address: string; count: number }[];
}

/** Reduce a position's events to who executed them. Each row carries its OWN
 *  owner (`wallet`), the same value the event card judges against — a timeline
 *  can include rows where the queried wallet acted on someone else's position. */
export function summariseExternalActors(
  rows: { txFrom?: string; poolCaller?: string; wallet: string }[],
): ExternalActorSummary {
  const counts = new Map<string, number>();
  let external = 0;
  for (const row of rows) {
    const actor = externalActor(row, row.wallet);
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

/**
 * Add an opening balance's actor split to a summary reduced from the rows on
 * the page.
 *
 * The two halves count different events and never the same one — the opening
 * balance covers `block_number < cutoffBlock` and every row reduced above is at
 * or after it — so the externals add and the per-actor counts add. `total` is
 * the position's whole event count, which is what every sentence built on this
 * summary means by "of those".
 *
 * `prior` null means the opening balance omitted the actor split (the protocol's
 * rows carry no actor to judge). Then this returns the summary UNCHANGED rather
 * than treating the omission as a zero: an actor who acted only below the line
 * would otherwise vanish, and the page would state a verdict over the window
 * while naming the position's total.
 */
export function withOpeningActors(
  summary: ExternalActorSummary,
  prior: { external: number; actors: { address: string; count: number }[] } | null | undefined,
  openingTotal: number,
): ExternalActorSummary {
  if (!prior) return summary;
  const counts = new Map<string, number>();
  for (const a of prior.actors) counts.set(a.address, (counts.get(a.address) ?? 0) + a.count);
  for (const a of summary.actors) counts.set(a.address, (counts.get(a.address) ?? 0) + a.count);
  return {
    total: summary.total + openingTotal,
    external: summary.external + prior.external,
    actors: [...counts]
      .map(([address, count]) => ({ address, count }))
      .sort((a, b) => b.count - a.count || a.address.localeCompare(b.address)),
  };
}

/** Open the operator bullet, chaining onto the preceding count bullet with
 *  "Of those" ONLY when that count is the same quantity this sentence divides.
 *
 *  ⚠️ `ext.total` counts EVENTS — the rows actually reduced on the page. Most
 *  position cards lead with a TRANSACTION count, and one transaction routinely
 *  emits several events: on the aave-v3 fixture (0x5723…fea9) the card says
 *  2,762 while the reduced history holds 3,485. "Of those" across that seam
 *  states a proportion of one quantity over another — events divided by
 *  transactions. That shipped on maple and dolomite, and on aave-v3 until
 *  `f5fd243`.
 *
 *  ⚠️⚠️ `precedingEventCount` must be a count of EVENTS, or null. Passing a
 *  transaction count is a category error this function CANNOT detect, and the
 *  equality below will not save you: on the aave-v4 fixture the card reads 45
 *  transactions against 45 reduced events, and on moonwell 31 against 31. Both
 *  chained on a coincidence, and neither number means what the sentence then
 *  says it means — aave-v4's txCount counts DISTINCT NON-LIQUIDATION
 *  transactions, so the two are not even in bijection. Only four explorers
 *  (morpho, makerdao, fluid, fx) lead with an event count; the other eight pass
 *  null and always self-anchor.
 *
 *  What the equality DOES guard is the second trap: an event count is usually a
 *  LIFETIME figure off the wire, while `ext.total` counts what this page
 *  actually loaded. Those diverge the moment a timeline paginates or a sweep
 *  runs behind. So the chain survives per render only as long as it is true,
 *  rather than resting on a claim made once in a comment.
 *
 *  `where` is the protocol's own noun for what it counts events on — "recorded
 *  on this position", "on this account’s timeline", "recorded on this spoke" —
 *  so the shared decision does not flatten a vault into a position. */
export function operatorLead(
  ext: ExternalActorSummary,
  precedingEventCount: number | null | undefined,
  where: string,
): string {
  return precedingEventCount === ext.total
    ? "Of those, "
    : `Of the ${ext.total.toLocaleString("en-US")} events ${where}, `;
}
