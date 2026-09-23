// Liquity-V2-fork trove-adjustment classifier — the direction of a coll/debt
// move, shared by the server-side timeline transform (the imperative header
// verb + the CSV Action column) and the client explainer (the past-tense
// prose). The SHARED thing is the direction classification, not the strings:
// the header reads imperative nouns ("Add / Withdraw / Borrow / Repay"), the
// explainer reads past-tense verbs ("Added / Withdrew / Drew / Repaid"), and
// both key off one sign classification so they can never disagree.
//
// The epsilon comparison stays in BIGINT: the fork context arrives as raw
// integer deltas (unlike Liquity V2's pre-scaled float context, whose
// TROVE_DELTA_EPSILON exists only because its numbers are already floats). This
// is the fork analogue of lib/liquity/trove-ops.ts, over raw units.

const ZERO = BigInt(0);

/** The display epsilon below which a DEBT delta reads as "no movement" — 0.01
 *  of an 18-decimal stable (ebUSD / USDaf ≈ $1, so ≈ a cent). Hoisted from the
 *  fork timelines' own DEBT_DUST so the no-change predicate, the header verb,
 *  and this classifier share ONE epsilon. Both forks mint an 18-decimal debt
 *  token, so the scale is fixed here. */
export const FORK_DEBT_DUST = BigInt(10) ** BigInt(16);

/** The direction each axis of a trove adjustment moved, or null when it didn't.
 *  "add"/"withdraw" is collateral in/out; "borrow"/"repay" is debt drawn/repaid. */
export interface TroveAdjustDirection {
  coll: "add" | "withdraw" | null;
  debt: "borrow" | "repay" | null;
}

/** Classify a trove adjustment by the sign of each raw delta. Collateral uses an
 *  EXACT zero (the 8-decimal BTC branches make a native-unit epsilon unsafe —
 *  the same reason the no-change predicate demands `collDelta === 0`); debt uses
 *  the dust epsilon, so accrued-interest dust never reads as a borrow/repay. */
export function classifyTroveAdjust({
  collDelta,
  debtDelta,
}: {
  collDelta: bigint;
  debtDelta: bigint;
}): TroveAdjustDirection {
  const absDebt = debtDelta < ZERO ? -debtDelta : debtDelta;
  return {
    coll: collDelta > ZERO ? "add" : collDelta < ZERO ? "withdraw" : null,
    debt: absDebt < FORK_DEBT_DUST ? null : debtDelta > ZERO ? "borrow" : "repay",
  };
}

/** Events where the interest rate IS the point of the event — the rate pill and
 *  its paired detail receipt render ONLY here. A rate on every adjust row would
 *  turn the header into a ticker; the rate is only news when the owner opened at
 *  it, changed it, or delegated it. Both forks share the event-type union. */
export const FORK_RATE_PILL_EVENTS: ReadonlySet<string> = new Set([
  "openTrove",
  "openTroveAndJoinBatch",
  "adjustTroveInterestRate",
  "setInterestBatchManager",
  "removeFromBatch",
]);

// The imperative per-axis verbs, keyed by move direction. Exported so the header
// adapter can label each delta with its own verb (V2's grammar) from the SAME
// classification that drives the combined CSV/label verb — the two can't drift.
export const COLL_VERB = { add: "Add", withdraw: "Withdraw" } as const;
export const DEBT_VERB = { borrow: "Borrow", repay: "Repay" } as const;

/** The imperative header / CSV verb for an adjustTrove — "Add + Borrow",
 *  "Withdraw", "Repay", etc. Returns null when neither axis moved, so the caller
 *  keeps its static fallback (or its own no-change handling). */
export function forkAdjustLabel(dir: TroveAdjustDirection): string | null {
  const parts: string[] = [];
  if (dir.coll) parts.push(COLL_VERB[dir.coll]);
  if (dir.debt) parts.push(DEBT_VERB[dir.debt]);
  return parts.length > 0 ? parts.join(" + ") : null;
}

/** The header / CSV verb for an adjustTroveInterestRate. On a BATCHED trove the
 *  rate is the delegate's to set, not the owner's — Liquity V2 keeps that as a
 *  distinct operation (setBatchManagerAnnualInterestRate), but the forks only
 *  carry `is_batched` to tell them apart. Labelling a delegate's move "Increase
 *  interest rate" would attribute someone else's decision to the owner, so a
 *  batched rate move reads "Delegate rate change" and never takes a direction
 *  verb. Unbatched rows compare the previous rate to derive Increase / Decrease.
 *
 *  The `isBatched` branch looks dead and is deliberately KEPT. It cannot fire
 *  from the protocol's own entrypoint — BorrowerOperations.adjustTroveInterestRate
 *  reverts on a Trove that is in a batch, so operation=3 and batch membership
 *  never coincide by construction, and the fork history carries zero such rows.
 *  But `is_batched` is not read off the operation: mv_{ebisu,asymmetry}_events
 *  (migs 152/153) sets it TRUE on the BatchedTroveUpdated arm and attaches an
 *  action by joining the tx's trove_operation rows on NEAREST log_index. A
 *  transaction that both adjusts the rate and joins a batch for the same Trove
 *  has two operation rows to choose from, and that join can hand the batched
 *  row action='adjustTroveInterestRate'. Dropping the branch would make that
 *  row read "Increase interest rate" — crediting the owner with a decision the
 *  delegate made, the exact misattribution this function exists to prevent. */
export function forkRateChangeLabel(
  before: string | null | undefined,
  after: string | null | undefined,
  isBatched: boolean,
): string {
  if (isBatched) return "Delegate rate change";
  const b = before != null ? Number(before) : NaN;
  const a = after != null ? Number(after) : NaN;
  if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
    return a > b ? "Increase interest rate" : "Decrease interest rate";
  }
  return "Adjust interest rate";
}
