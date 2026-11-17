// A position the wallet held and passed to another wallet (ui-jobs 705): a
// Liquity V2 Trove whose card carries `formerHold` (rails-server mig 474,
// asked for with ?former=1). Imports nothing, so scripts/test/wallet-moved-
// row.test.mjs reads it directly.
//
// RULE: such a row is "moved", never open, whatever the Trove's status under
// its new holder. Its History row states only what belongs to this wallet:
// the day it moved and where it went. The Trove's size, start and lifetime
// span its later holders too, so they are left out.

interface FormerHoldLike {
  movedTo: string;
  movedAt: number;
}

/** The card's formerHold, where the row is a passed-on position. */
export function formerHoldOf(card: unknown): FormerHoldLike | null {
  const f = (card as { formerHold?: FormerHoldLike } | null | undefined)?.formerHold;
  return f && typeof f.movedTo === "string" && Number.isFinite(f.movedAt) ? f : null;
}

/** A summary row's status for the wallet's counts. */
export function walletRowStatus<S extends string>(row: { status: S; card?: unknown }): S | "moved" {
  return formerHoldOf(row.card) ? "moved" : row.status;
}

/** A passed-on position's History fields. */
export function movedHistory(f: FormerHoldLike): { closedAt: number; movedTo: string } {
  return { closedAt: f.movedAt, movedTo: f.movedTo };
}
