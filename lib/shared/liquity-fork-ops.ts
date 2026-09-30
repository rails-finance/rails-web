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

import type { DeltaOps } from "@/lib/shared/liquity-fork-provenance";

const ZERO = BigInt(0);

/** The display epsilon below which a DEBT delta reads as "no movement" — 0.01
 *  of an 18-decimal stable (ebUSD / USDaf ≈ $1, so ≈ a cent). Hoisted from the
 *  fork timelines' own DEBT_DUST so the no-change predicate, the header verb,
 *  and this classifier share ONE epsilon. Both forks mint an 18-decimal debt
 *  token, so the scale is fixed here. */
export const FORK_DEBT_DUST = BigInt(10) ** BigInt(16);

/** The debt THIS event's act moved, as the contract logged it. A Trove's debt
 *  changes between two events for four reasons: the act itself (a borrow, a
 *  repayment, the amount a redemption cancelled or a liquidation cleared), the
 *  upfront fee, debt redistributed from a liquidated neighbour, and the interest
 *  accrued since the last touch. TroveOperation logs the act as
 *  `_debtChangeFromOperation`, so that is the amount redeemed, repaid or
 *  borrowed. `debtAfter − debtBefore` carries the other three as well: an
 *  add-collateral adjust would read as a borrow of its accrued interest, and a
 *  redemption would read short by the same amount. Liquity V2's own cards key
 *  on the same field (lib/liquity/trove-ops.ts, `debtChangeFromOperation`).
 *
 *  Server-side transforms pass the raw columns (bigint); the client passes the
 *  context's human strings. Where the read path carries no operation row, the
 *  net change is the only figure there is, and it stands. */
export function forkDebtMoveRaw(debtDelta: bigint, debtChangeFromOperation: string | null | undefined): bigint {
  if (debtChangeFromOperation == null || debtChangeFromOperation === "") return debtDelta;
  try {
    return BigInt(debtChangeFromOperation.split(".")[0]);
  } catch {
    return debtDelta;
  }
}

/** The client twin of forkDebtMoveRaw over a fork event context: the signed
 *  debt the act moved, and whether it came from the operation log. */
export function forkDebtMove(ctx: { debtDelta: string; operation?: { debtFromOperation: string } }): {
  value: number;
  fromOperation: boolean;
} {
  const op = ctx.operation?.debtFromOperation;
  const n = op != null ? Number(op) : NaN;
  if (Number.isFinite(n)) return { value: n, fromOperation: true };
  return { value: Number(ctx.debtDelta) || 0, fromOperation: false };
}

/** The display floor below which the act's debt move reads as nothing — the
 *  float twin of FORK_DEBT_DUST. */
export const FORK_DEBT_DUST_FLOAT = 0.01;

/** The collateral THIS event's act moved: the net change less the collateral
 *  a liquidated neighbour's redistribution added on the same touch
 *  (TroveOperation `_collIncreaseFromRedist`). Collateral earns no interest,
 *  so what is left is `_collChangeFromOperation`. The redistribution is not a
 *  deposit: no token left the owner's wallet for it. */
export function forkCollMoveRaw(collDelta: bigint, collIncreaseFromRedist: string | null | undefined): bigint {
  if (collIncreaseFromRedist == null || collIncreaseFromRedist === "") return collDelta;
  try {
    return collDelta - BigInt(collIncreaseFromRedist.split(".")[0]);
  } catch {
    return collDelta;
  }
}

/** The client twin of forkCollMoveRaw over a fork event context. */
export function forkCollMove(ctx: { collDelta: string; operation?: { collFromRedist: string } }): number {
  const delta = Number(ctx.collDelta) || 0;
  const redist = Number(ctx.operation?.collFromRedist ?? 0);
  return Number.isFinite(redist) ? delta - redist : delta;
}

/** The receipt operands for the act's collateral figure — the shape
 *  collDeltaProv takes, built once for the header, the spine and the prose so
 *  the three echo one receipt. Where a redistribution shares the touch, the
 *  receipt names the act's own field. */
export function forkCollMoveOps(ctx: {
  collDelta: string;
  collAfter?: string;
  operation?: { collFromOperation: string; collFromRedist: string };
}): DeltaOps {
  const net = Number(ctx.collDelta) || 0;
  const redist = Number(ctx.operation?.collFromRedist ?? 0);
  return {
    after: ctx.collAfter,
    before: ctx.collAfter != null ? Number(ctx.collAfter) - net : null,
    ...(redist > 0 ? { collFromOperation: ctx.operation!.collFromOperation } : {}),
  };
}

/** What a liquidated neighbour's redistribution added to this Trove on this
 *  touch, or null when nothing did. */
export function forkRedistArrival(ctx: {
  operation?: { debtFromRedist: string; collFromRedist: string };
}): { debt: number; coll: number; debtText: string; collText: string } | null {
  const op = ctx.operation;
  if (!op) return null;
  const debt = Number(op.debtFromRedist);
  const coll = Number(op.collFromRedist);
  if (!(debt > 0) && !(coll > 0)) return null;
  return {
    debt: debt > 0 ? debt : 0,
    coll: coll > 0 ? coll : 0,
    debtText: op.debtFromRedist,
    collText: op.collFromRedist,
  };
}

/** One precision rule for a fork amount on the timeline, shared by the row
 *  header, the opened grid and the prose: a figure of 1 or more at up to
 *  three decimals, a smaller one at up to four decimals (the header's own
 *  rule, so 0.0115 reads 0.0115 on every layer), and a figure too small for
 *  four decimals at three significant digits. */
export function forkAmount(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a === 0 || a >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
  const sign = n < 0 ? "-" : "";
  const four = parseFloat(a.toFixed(4));
  if (four !== 0 && a >= 0.001) return `${sign}${four.toString()}`;
  if (a < 1e-6) return `${sign}<0.000001`;
  return `${sign}${a.toLocaleString("en-US", { maximumSignificantDigits: 3 })}`;
}

/** The same rule for a collateral amount, which is worth far more per unit
 *  than the stablecoin: up to four decimals below 1,000 (8.4996 wstETH, so a
 *  redemption's 0.0004 shows in the balance), three above. */
export function forkCollAmount(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a === 0 || a >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
  if (a >= 0.001)
    return `${n < 0 ? "-" : ""}${parseFloat(a.toFixed(4)).toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  return forkAmount(n);
}

/** A small fee in collateral, to three significant digits (0.000677 rETH),
 *  so the fee a redeemer left reads as the amount the sums need. */
export function forkFeeAmount(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
  if (Math.abs(n) < 1e-9) return "0";
  return n.toLocaleString("en-US", { maximumSignificantDigits: 3 });
}

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
  // A batch manager's change (server mig 342): the rate is the row's point.
  "setBatchManagerAnnualInterestRate",
  "lowerBatchManagerAnnualFee",
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

/** The receipt operands for the act's debt figure — the shape debtDeltaProv
 *  takes. With an operation row it names TroveOperation's field (and, on a
 *  redemption, the contract that emitted it); without one it traces the net
 *  change over the two emitted balances, as before. */
export function forkDebtMoveOps(ctx: {
  eventType: string;
  debtDelta: string;
  debtAfter?: string;
  operation?: { debtFromOperation: string };
}): DeltaOps {
  const m = forkDebtMove(ctx);
  const net = Number(ctx.debtDelta) || 0;
  return {
    after: ctx.debtAfter,
    before: ctx.debtAfter != null ? Number(ctx.debtAfter) - net : null,
    ...(m.fromOperation
      ? { fromOperation: ctx.operation!.debtFromOperation, redemption: ctx.eventType === "redeemCollateral" }
      : {}),
  };
}

/** One governance-set minimum collateral ratio that has since been replaced:
 *  in force below `untilBlock` (and before `untilTimestamp`, the same block's
 *  time, for callers that hold a time and no block). */
export interface ForkMcrStep {
  mcr: number;
  untilBlock: number;
  untilTimestamp: number;
}

/** The branch's minimum collateral ratio in force at a block (or a time). A
 *  fork whose governance can move the minimum lists the earlier values as
 *  `mcrBefore`; a past liquidation is judged against the one it crossed, not
 *  today's. With no point in time given, today's. */
export function forkMcrAt(
  branch: { mcr: number; mcrBefore?: readonly ForkMcrStep[] },
  at: { block?: number | null; timestamp?: number | null },
): number {
  for (const step of branch.mcrBefore ?? []) {
    if (at.block != null ? at.block < step.untilBlock : at.timestamp != null && at.timestamp < step.untilTimestamp)
      return step.mcr;
  }
  return branch.mcr;
}

/** A listing amount scaled from the route's raw base-unit string. The route's
 *  `amount` is rounded to two decimals, which on a BTC branch moves a dollar
 *  figure by up to a quarter (0.016237 tBTC reads 0.02); Liquity V2 prices the
 *  raw amount, and so do the forks. A raw string the route stored with a scale
 *  ("123.000") keeps its integer part; one that cannot be read falls back to the
 *  rounded amount. */
export function forkExactAmount(raw: string | null | undefined, decimals: number, rounded: number): number {
  if (!raw) return rounded;
  let value: bigint;
  try {
    value = BigInt(raw.split(".")[0] || "0");
  } catch {
    return rounded;
  }
  const divisor = BigInt(10) ** BigInt(decimals);
  return Number(value / divisor) + Number(value % divisor) / Number(divisor);
}

/** The fixed liquidation reserve a Trove pays at open, in WETH and apart from its
 *  collateral: it goes to the branch's gas pool, pays a liquidator, and comes
 *  back to the owner when the Trove closes. Stated only where it was read:
 *  Asymmetry from an open transaction's WETH transfer to the gas pool (scrvUSD
 *  3036…5877, tx 0x02801dfe…4536), Ebisu from its Liquidation logs (every one
 *  carries a 0.0375 WETH gas compensation). Basedollar reads lower — its
 *  BorrowerOperations exposes no getter for the constant (every candidate
 *  selector reverts), so it was read off two open transactions on Base: WETH
 *  branch tx 0x682b096e…71fd4 (0.5 WETH collateral) and 0xdbdd9b59…98323 (6.5
 *  WETH), and cbETH branch tx 0xee93ad95…6ba3f (0.2016 cbETH) — each wraps
 *  exactly 0.001 more ETH than its collateral and sends that 0.001 WETH to the
 *  same address (0x6cc943f5…258324), fixed regardless of branch or Trove size.
 *  Keyed by the fork's id or display name, lower-cased with spaces removed. */
const FORK_LIQUIDATION_RESERVE: Record<string, string> = {
  asymmetry: "0.0375 WETH",
  ebisu: "0.0375 WETH",
  basedollar: "0.001 WETH",
};

export function forkLiquidationReserve(fork: string): string | undefined {
  return FORK_LIQUIDATION_RESERVE[fork.toLowerCase().replace(/\s+/g, "")];
}
