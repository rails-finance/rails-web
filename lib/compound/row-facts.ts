// What a Comet row did to the account, read from its own after-balance and
// amount: the balance before it (exact, from the decimal strings), what a base
// row did on each side of zero, and — on an absorb — the debt it cleared and
// the credit it left past it. One place, so the row's label, its figures and
// its prose all say the same thing.

import type { CompoundContext } from "@/lib/shared/types/event-shape";
import { decimalSub, formatNumber } from "@/lib/utils/format";

/** The smaller of two plain decimals, exact. */
function decimalMin(a: string, b: string): string {
  const d = decimalSub(a, b);
  return d != null && d.startsWith("-") ? a : b;
}

const isNeg = (s: string) => s.startsWith("-") && !/^-0(\.0*)?$/.test(s);
const isPos = (s: string) => !s.startsWith("-") && !/^0(\.0*)?$/.test(s);

export interface CompoundAbsorbSplit {
  /** basePaidOut, the balance change the event states. */
  paidOut: string;
  /** The signed base balance before the absorb. */
  before: string;
  /** The debt the absorb cleared (≥ 0). */
  cleared: string;
  /** The credit past the debt, left as a lent balance (≥ 0). */
  credit: string;
}

/** An absorb_debt row's basePaidOut, split at zero. Null off an absorb_debt
 *  row, or where the row carries no after-balance. */
export function compoundAbsorbSplit(ctx: CompoundContext): CompoundAbsorbSplit | null {
  if (ctx.eventType !== "absorb_debt" || ctx.baseAfter == null) return null;
  const paidOut = ctx.assetsDelta.replace(/^-/, "");
  const before = decimalSub(ctx.baseAfter, paidOut);
  if (before == null) return null;
  const owed = isNeg(before) ? before.slice(1) : "0";
  const cleared = decimalMin(paidOut, owed);
  const credit = decimalSub(paidOut, cleared) ?? "0";
  return { paidOut, before, cleared, credit };
}

/** A base figure no larger than one unit of the base token: Comet's rounding
 *  (a supply's present value rounds down, so a flat balance can read one unit
 *  either side of zero). Shown and counted as zero. */
export function isBaseDust(value: string | null | undefined, decimals: number): boolean {
  if (value == null) return false;
  const n = Math.abs(Number(value));
  return Number.isFinite(n) && n <= 10 ** -decimals * 1.000001;
}

/** The balance before a base row, exact, with one-unit dust read as zero. */
export function compoundBaseBefore(ctx: CompoundContext, decimals?: number): string | null {
  if (ctx.baseAfter == null) return null;
  const before = decimalSub(ctx.baseAfter, ctx.assetsDelta);
  if (before == null) return null;
  return decimals != null && isBaseDust(before, decimals) ? "0" : before;
}

/** The row's label by what the base balance did — Comet has no borrow or
 *  repay call, so a Withdraw past zero is the borrow and a Supply into debt
 *  is the repayment. A row that crosses zero names both. Collateral and
 *  transfer rows keep the label they came with. */
export function compoundRowLabel(ctx: CompoundContext, fallback: string, baseDecimals?: number): string {
  if (ctx.eventType !== "supply" && ctx.eventType !== "withdraw") return fallback;
  // A call for nothing moves nothing: named so, since it still sits in a run.
  if (/^-?0(\.0*)?$/.test(ctx.assetsDelta))
    return ctx.eventType === "supply" ? "Supply (zero amount)" : "Withdraw (zero amount)";
  if (ctx.baseAfter == null) return fallback;
  const before = compoundBaseBefore(ctx, baseDecimals);
  if (before == null) return fallback;
  const after = baseDecimals != null && isBaseDust(ctx.baseAfter, baseDecimals) ? "0" : ctx.baseAfter;
  if (ctx.eventType === "supply") {
    if (!isNeg(before)) return "Supply";
    return isPos(after) ? "Repay and lend" : "Repay";
  }
  if (!isPos(before)) return "Borrow";
  return isNeg(after) ? "Withdraw and borrow" : "Withdraw";
}

/** The base-balance caption for a row's before → after: which side of zero
 *  the balance stood on, or "Base balance" where the row crossed it. */
export function compoundBaseCaption(before: string | null, after: string): string {
  if (before == null) return isNeg(after) ? "Borrowed (base)" : "Lent (base)";
  const neg = isNeg(before) || isNeg(after);
  const pos = isPos(before) || isPos(after);
  if (neg && pos) return "Base balance";
  return neg ? "Borrowed (base)" : "Lent (base)";
}

/** One precision for a row's moved amount wherever it is printed — the row's
 *  spine, its state grid and its prose: four decimals below one, three above
 *  (the spine's own compact form keeps two past 1,000). */
export function compoundAmount(n: number): string {
  const a = Math.abs(n);
  if (a > 0 && a < 1) {
    const s = parseFloat(a.toFixed(4)).toString();
    if (parseFloat(s) !== 0) return `${n < 0 ? "-" : ""}${s}`;
  }
  return formatNumber(n);
}

/** Where an event sits in its block: the log index Comet ids carry
 *  ("<tx>-<log>-<kind>"). */
function logIndexOf(id: string): number {
  return Number(/-(\d+)-[a-z_]+$/.exec(id)?.[1] ?? 0);
}

/** Each row's previous row in the same market, keyed by event id: what a
 *  row's interest since the previous one is measured over. */
export function previousEventById<E extends { id: string; blockNumber: number; context: { data: { market: string } } }>(
  events: readonly E[],
): Map<string, E> {
  const sorted = [...events].sort((a, b) => a.blockNumber - b.blockNumber || logIndexOf(a.id) - logIndexOf(b.id));
  const lastByMarket = new Map<string, E>();
  const out = new Map<string, E>();
  for (const e of sorted) {
    const last = lastByMarket.get(e.context.data.market);
    if (last) out.set(e.id, last);
    lastByMarket.set(e.context.data.market, e);
  }
  return out;
}

/** Each transaction's previous row in the same market: the latest event of
 *  an earlier transaction, keyed by tx hash. What an absorb row reads the
 *  prices and rate "at the previous event" from. */
export function previousEventByTx<
  E extends { id: string; txHash: string; blockNumber: number; context: { data: { market: string } } },
>(events: readonly E[]): Map<string, E> {
  const sorted = [...events].sort((a, b) => a.blockNumber - b.blockNumber || logIndexOf(a.id) - logIndexOf(b.id));
  const lastByMarket = new Map<string, E>();
  const out = new Map<string, E>();
  for (const e of sorted) {
    const market = e.context.data.market;
    const last = lastByMarket.get(market);
    if (!out.has(e.txHash) && last && last.txHash !== e.txHash) out.set(e.txHash, last);
    lastByMarket.set(market, e);
  }
  return out;
}

/** The yearly rate a balance's growth between two rows implies: interest
 *  over the balance before it, scaled from the seconds between them. Null for
 *  a gap under an hour or a zero balance. */
export function impliedYearlyRate(interest: number, balanceBefore: number, seconds: number): number | null {
  if (!(seconds >= 3600) || !(Math.abs(balanceBefore) > 0) || !Number.isFinite(interest)) return null;
  return (Math.abs(interest) / Math.abs(balanceBefore)) * ((365 * 24 * 3600) / seconds);
}

/** A row's previous row, unless a folder the page holds only as a summary
 *  sits between them: then the folder's last member is the previous event,
 *  and all the page knows of it is its block and time. */
export function previousPastFolders<E extends { blockNumber: number; timestamp: number }>(
  event: { blockNumber: number },
  previous: E | undefined,
  folders: readonly { lastBlock: number; lastAt: number; firstBlock: number }[] | null | undefined,
): E | { blockNumber: number; timestamp: number } | undefined {
  if (!previous || !folders || folders.length === 0) return previous;
  let latest: { blockNumber: number; timestamp: number } | null = null;
  for (const f of folders) {
    if (
      f.firstBlock >= previous.blockNumber &&
      f.lastBlock <= event.blockNumber &&
      f.lastBlock >= previous.blockNumber
    ) {
      if (!latest || f.lastBlock > latest.blockNumber) latest = { blockNumber: f.lastBlock, timestamp: f.lastAt };
    }
  }
  return latest ?? previous;
}
