// Lifetime flows for busy, long-lived positions: the treatment the bars take
// when the window they cover is busy (components/shared/lifetime-flows-busy.tsx;
// rails-ops reference/lifetime-flows-scrubber.md, "The two views"): each bar
// at the scale of what is held, the throughput in one line, a time-binned
// density strip, and the slider stepping by bin. Pure functions of the model
// `buildFlowModel` (or `windowModel`) returns, tested offline in
// scripts/verify/verify-lifetime-flows-state.ts.
//
// `groupOperations` (the transactions grouped by the events in each) is kept
// for when the operation names are settled (rails-ops TO-DO-ui-jobs §207); no
// page draws it.

import { dayStart, type FlowModel } from "@/lib/shared/flows-timeline";

/** A window with more events than this reads as busy. */
export const BUSY_EVENTS = 200;
/** Or one whose deposits exceed the most its collateral has been this many times. */
export const BUSY_TURNOVER = 5;

/** The inflow buckets' running total on a side at the live stop. */
function inflowAt(m: FlowModel, side: "collateral" | "debt", row = m.rows[m.rows.length - 1]): number {
  return m.buckets.filter((b) => b.side === side && b.dir === "in").reduce((s, b) => s + (row.cum[b.key] ?? 0), 0);
}

/** Events and transactions before the model's first stop (a window's opening). */
const baseCounts = (m: FlowModel) => ({ events: m.opening?.events ?? 0, txs: m.opening?.txs ?? 0 });

/** Busy: more than BUSY_EVENTS events in the model's stops, or deposits over
 *  BUSY_TURNOVER times the most the collateral has been in them. Measured
 *  against that peak, a position that deposited once and withdrew most of it
 *  is not busy; one that cycles the same funds in and out is. */
export function isBusy(m: FlowModel): boolean {
  if (m.totalEvents - baseCounts(m).events > BUSY_EVENTS) return true;
  const peak = Math.max(m.live.collateralUsd, ...m.valued.map((v) => v.collateral));
  return peak > 0 && inflowAt(m, "collateral") > BUSY_TURNOVER * peak;
}

/** The throughput over the model's stops (the window's, where it is cut to one):
 *  what came in on each side, the transactions,
 *  and how many times over the deposits have replaced the collateral held now. */
export function throughput(m: FlowModel): {
  deposited: number;
  borrowed: number;
  txs: number;
  unit: "transaction" | "event";
  turnover: number | null;
} {
  const deposited = inflowAt(m, "collateral");
  const borrowed = inflowAt(m, "debt");
  const held = m.live.collateralUsd;
  const ratio = held > 0 ? deposited / held : 0;
  return {
    deposited,
    borrowed,
    txs: m.totalTxs != null ? m.totalTxs - baseCounts(m).txs : m.totalEvents - baseCounts(m).events,
    unit: m.totalTxs != null ? "transaction" : "event",
    turnover: ratio >= 2 ? roundTurnover(ratio) : null,
  };
}

/** Whole numbers under 20, two significant figures above (59.7 → 60). */
function roundTurnover(r: number): number {
  if (r < 20) return Math.round(r);
  const p = 10 ** (Math.floor(Math.log10(r)) - 1);
  return Math.round(r / p) * p;
}

export type BinUnit = "day" | "week" | "month";

export interface FlowBin {
  /** First and last stop (day index) the bin covers. */
  from: number;
  to: number;
  /** "9 Mar '26" · "Week of 9 Mar '26" · "Mar '26". */
  label: string;
  /** Transactions (or events, where the rows count no transactions) in the bin. */
  count: number;
  liquidation: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const stamp = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`;

/** Days a position spans before the bin grows: up to 90 days by day, up to
 *  three years by week, longer by calendar month. */
export function binUnitFor(spanDays: number): BinUnit {
  return spanDays <= 90 ? "day" : spanDays <= 3 * 365 ? "week" : "month";
}

/** The position's life cut into bins, each with the transactions in it. The
 *  stops before the live one; the live stop follows the last bin. */
export function flowBins(m: FlowModel): { unit: BinUnit; bins: FlowBin[] } {
  const lastStop = m.liveStop - 1;
  const unit = binUnitFor(m.liveStop);
  const ranges: { from: number; to: number; label: string }[] = [];
  if (unit === "month") {
    let from = 0;
    while (from <= lastStop) {
      const d = new Date(dayStart(m, from) * 1000);
      const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
      const to = Math.min(lastStop, Math.round((next - m.start) / 86_400_000) - 1);
      ranges.push({ from, to, label: `${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}` });
      from = to + 1;
    }
  } else {
    const len = unit === "day" ? 1 : 7;
    for (let from = 0; from <= lastStop; from += len) {
      const to = Math.min(lastStop, from + len - 1);
      const s = stamp(new Date(dayStart(m, from) * 1000));
      ranges.push({ from, to, label: unit === "day" ? s : `Week of ${s}` });
    }
  }
  const count = (r: FlowModel["rows"][number]) => r.txs ?? r.events;
  const liqDays = new Set(m.ticks.filter((t) => t.tick === "liquidation").map((t) => t.day));
  let ri = 0;
  let before = m.totalTxs != null && m.rows[0]?.txs != null ? baseCounts(m).txs : baseCounts(m).events;
  const bins = ranges.map(({ from, to, label }) => {
    let through = before;
    let liquidation = false;
    while (ri < m.rows.length && m.rows[ri].day <= to) {
      through = count(m.rows[ri]);
      if (liqDays.has(m.rows[ri].day)) liquidation = true;
      ri++;
    }
    const bin = { from, to, label, count: through - before, liquidation };
    before = through;
    return bin;
  });
  return { unit, bins };
}

// ── Operations: each transaction named by the events inside it ─────────────

/** What the grouping reads from an event: its transaction, its kind, the
 *  timeline's label for it, and the transaction's sender where the row names it. */
export interface OpEvent {
  txHash: string;
  actionType: string;
  actionLabel?: string;
  txFrom?: string | null;
}

export interface FlowOperations {
  /** Operation types, most frequent first. */
  kinds: { label: string; count: number }[];
  txs: number;
  /** The one sender behind most transactions, where there is one. */
  executor: { address: string; count: number; known: number } | null;
}

/** A sender named on at least this share of the transactions that name one. */
const EXECUTOR_SHARE = 0.8;

const LABEL: Record<string, string> = { supply: "Supply", borrow: "Borrow", repay: "Repay", withdraw: "Withdraw" };

/** "Withdraw and borrow" · "Withdraw, supply and borrow". */
const joinNames = (names: string[]) => {
  const w = names.map((n, i) => (i === 0 ? n : n.toLowerCase()));
  return w.length < 2 ? w.join("") : `${w.slice(0, -1).join(", ")} and ${w[w.length - 1]}`;
};

/** Supply and borrow in one transaction is "Leverage up", repay and withdraw
 *  "Unwind"; a single kind keeps its timeline name; any other mix joins its
 *  names in the order they ran. */
export function groupOperations(events: OpEvent[]): FlowOperations | null {
  const byTx = new Map<string, OpEvent[]>();
  for (const e of events) {
    if (!e.txHash) continue;
    const k = e.txHash.toLowerCase();
    const list = byTx.get(k);
    if (list) list.push(e);
    else byTx.set(k, [e]);
  }
  if (byTx.size === 0) return null;
  const counts = new Map<string, number>();
  const senders = new Map<string, number>();
  let known = 0;
  for (const evs of byTx.values()) {
    const types = [...new Set(evs.map((e) => e.actionType))];
    const set = new Set(types);
    const name = (t: string) => LABEL[t] ?? evs.find((e) => e.actionType === t)?.actionLabel ?? t;
    const label =
      set.size === 2 && set.has("supply") && set.has("borrow")
        ? "Leverage up"
        : set.size === 2 && set.has("repay") && set.has("withdraw")
          ? "Unwind"
          : types.length === 1
            ? name(types[0])
            : joinNames(types.map(name));
    counts.set(label, (counts.get(label) ?? 0) + 1);
    const from = evs.find((e) => e.txFrom)?.txFrom?.toLowerCase();
    if (from) {
      known++;
      senders.set(from, (senders.get(from) ?? 0) + 1);
    }
  }
  let executor: FlowOperations["executor"] = null;
  for (const [address, count] of senders)
    if (count >= EXECUTOR_SHARE * known && count > byTx.size / 2) executor = { address, count, known };
  return {
    kinds: [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    txs: byTx.size,
    executor,
  };
}

/** Health factor from held and owed at one liquidation threshold. */
export const healthAt = (collateral: number, debt: number, threshold: number): number | null =>
  debt > 0.5 && threshold > 0 ? (collateral * threshold) / debt : null;
