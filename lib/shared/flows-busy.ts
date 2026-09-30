// Lifetime flows for busy, long-lived positions: the treatments a position
// with hundreds of transactions can take in place of the per-event scrubber
// (components/shared/lifetime-flows-busy.tsx). Pure functions of the model
// `buildFlowModel` returns, tested offline in
// scripts/verify/verify-lifetime-flows-state.ts.
//
// Three treatments, chosen by `?flows=` for comparison:
//   a  the bars scale to what is held, gross throughput in one line, a
//      time-binned density strip, the slider stepping by bin;
//   b  collateral and debt over time as a line chart sampled per bin;
//   c  the transactions grouped by the events inside each one, beside a or b.
// With no parameter the panel draws today's scrubber unless `BUSY_VARIANT` is
// set, which makes the threshold (`isBusy`) pick the treatment on its own.

import { dayStart, type FlowModel } from "@/lib/shared/flows-timeline";

/** A position with more events than this reads as busy. */
export const BUSY_EVENTS = 200;
/** Or one whose lifetime deposits exceed its collateral now this many times. */
export const BUSY_TURNOVER = 5;
/** The treatment a busy position takes with no `?flows=`; null keeps
 *  today's scrubber for everyone until one is chosen. */
export const BUSY_VARIANT: FlowVariant | null = null;

export type FlowVariant = { chart: "rescaled" | "over-time"; ops: boolean };

/** The treatment `?flows=` asks for: "a" (rescaled), "b" (over time), "c"
 *  (operations, over a), "bc"; "default" or "0" forces today's scrubber;
 *  "auto" applies the threshold with a. Absent, the threshold with
 *  `BUSY_VARIANT`. */
export function flowVariant(param: string | null, busy: boolean): FlowVariant | null {
  const p = (param ?? "").toLowerCase();
  if (p === "default" || p === "0") return null;
  if (/^[abc]{1,2}$/.test(p)) return { chart: p.includes("b") ? "over-time" : "rescaled", ops: p.includes("c") };
  if (p === "auto") return busy ? (BUSY_VARIANT ?? { chart: "rescaled", ops: false }) : null;
  return busy ? BUSY_VARIANT : null;
}

/** The inflow buckets' running total on a side at the live stop. */
function inflowAt(m: FlowModel, side: "collateral" | "debt", row = m.rows[m.rows.length - 1]): number {
  return m.buckets.filter((b) => b.side === side && b.dir === "in").reduce((s, b) => s + (row.cum[b.key] ?? 0), 0);
}

export function isBusy(m: FlowModel): boolean {
  if (m.totalEvents > BUSY_EVENTS) return true;
  const held = m.live.collateralUsd;
  return held > 0 && inflowAt(m, "collateral") > BUSY_TURNOVER * held;
}

/** The whole life's throughput: what came in on each side, the transactions,
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
    txs: m.totalTxs ?? m.totalEvents,
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
  let before = 0;
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

/** The bin a stop falls in (the last bin for the live stop). */
export function binOf(bins: FlowBin[], stop: number): number {
  for (let i = 0; i < bins.length; i++) if (stop <= bins[i].to) return i;
  return bins.length - 1;
}

/** Held and owed at the end of each bin, then at the live stop. */
export function seriesByBin(m: FlowModel, bins: FlowBin[]): { stop: number; collateral: number; debt: number }[] {
  const out = bins.map((b) => ({ stop: b.to, ...m.valued[Math.min(b.to, m.valued.length - 1)] }));
  out.push({ stop: m.liveStop, collateral: m.live.collateralUsd, debt: m.live.debtUsd });
  return out;
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

/** The grouping over a page's events, where the page holds the whole history
 *  as rows (no window, no folders); null otherwise. */
export function operationsFromEvents(
  events: { txHash: string; actionType: string; actionLabel?: string; context?: { data?: unknown } }[],
  whole: boolean,
): FlowOperations | null {
  if (!whole) return null;
  return groupOperations(
    events.map((e) => ({
      txHash: e.txHash,
      actionType: e.actionType,
      actionLabel: e.actionLabel,
      txFrom: (e.context?.data as { txFrom?: string } | undefined)?.txFrom ?? null,
    })),
  );
}
