// Lifetime flows over time — the protocol-neutral contract behind the date
// scrubber (components/shared/lifetime-flows-scrubber.tsx, rails-ops
// TO-DO-ui-jobs §141).
// ----------------------------------------------------------------------------
// A protocol adapter hands in its events in order, each with the USD legs it
// adds to the lifetime buckets (valued at the oracle price at the event's
// block, the tower's rule) and the token balances it leaves. Everything the
// view draws at a date is `stateAt(model, stop)`: a pure function of that list
// and the live totals, with no DOM and no fetch, so it is tested offline
// (scripts/verify/verify-lifetime-flows-state.ts).
//
// Between two events an asset is valued at the price its last event carried.
// No daily price series is read yet, so a quiet asset's value steps when an
// event finally reprices it; the model records each such step (`repriced`)
// and each stale price at a date (`stale`) so the view can say so. Nothing is
// interpolated.

export type FlowSide = "collateral" | "debt";

/** How an outflow's hatch reads: an owner's own exit, a liquidation, or
 *  another party's redemption. */
export type FlowTone = "exit" | "liquidation" | "redemption";

/** One lifetime bucket, as the adapter names it. The view draws the buckets
 *  in the order given. */
export interface FlowBucket {
  key: string;
  label: string;
  /** A shorter label for a phone-width legend. */
  short?: string;
  side: FlowSide;
  dir: "in" | "out";
  /** Outflows: the hatch. Default "exit". */
  tone?: FlowTone;
  /** Inflows: drawn in the lighter hue (a transfer in, a swap in). */
  light?: boolean;
  /** Buckets sharing a link are one on-chain act seen from both sides (a
   *  repay with collateral, a liquidation): hovering one highlights all. */
  link?: string;
}

export interface FlowEvent {
  id: string;
  /** Unix seconds. */
  ts: number;
  block: number;
  /** Which side the event moved, for the tick strip under the slider. */
  tick: "collateral" | "debt" | "both" | "liquidation";
  /** What the event adds to each bucket, in USD. */
  legs: { bucket: string; usd: number }[];
  /** Token balances after the event, for the assets it touched. */
  balances: { asset: string; symbol: string; side: FlowSide; amount: number }[];
  /** Prices the event carries, USD per token at its block. */
  prices: { asset: string; usd: number }[];
}

export interface FlowLive {
  /** What the position holds and owes now, valued as the Lifetime flows
   *  ledger values them. */
  collateralUsd: number;
  debtUsd: number;
  /** Interest the ledger states for each side (earned; accrued), or null
   *  where it states none. At the live stop the balancing segment splits
   *  into this and a price change. */
  collateralInterestUsd: number | null;
  debtInterestUsd: number | null;
}

export interface FlowTimeline {
  buckets: FlowBucket[];
  /** Ascending by time. */
  events: FlowEvent[];
  live: FlowLive;
  /** Today's price per asset, for an asset held while no event has priced it. */
  todayPrices?: Record<string, number>;
}

/** A held asset whose price, at some date, is older than `STALE_DAYS`. */
export interface StalePrice {
  symbol: string;
  side: FlowSide;
  /** Unix seconds of the event that last priced it. */
  pricedAt: number;
  usd: number;
}

/** An event that repriced a held asset after a gap longer than `STALE_DAYS`. */
export interface Repricing {
  /** Slider stop (day index). */
  day: number;
  symbol: string;
  /** Unix seconds of the previous price. */
  from: number;
}

interface FlowRow {
  ts: number;
  day: number;
  cum: Record<string, number>;
  collateralUsd: number;
  debtUsd: number;
  stale: StalePrice[];
}

export interface FlowModel {
  buckets: FlowBucket[];
  rows: FlowRow[];
  /** UTC midnight of the first event's day, ms. */
  start: number;
  /** Day index of the last event's day. */
  lastDay: number;
  /** The final stop, one past `lastDay`: today, at live prices. */
  liveStop: number;
  /** Day indexes that carry at least one event, ascending, unique. */
  eventDays: number[];
  /** The tick strip: one entry per event. */
  ticks: { day: number; tick: FlowEvent["tick"] }[];
  repricings: Repricing[];
  live: FlowLive;
  /** The shared x-axis, fixed for the position so bars never rescale. */
  axis: { max: number; ticks: number[] };
  /** Each bar's length at the live stop, for the "today" outline. */
  today: { collateral: number; debt: number };
}

export interface FlowSegment {
  key: string;
  label: string;
  short?: string;
  /** "held" solid, "out" hatched, "in" solid source, "estimate" dashed. */
  fill: "held" | "out" | "in" | "estimate";
  tone?: FlowTone;
  light?: boolean;
  link?: string;
  /** Drawn width in USD (clamped so the strip never overruns its bar). */
  width: number;
  /** The figure the legend states (signed for a balancing item). */
  value: number;
}

export interface FlowSideState {
  /** What is still there: the solid segment. */
  now: number;
  /** Everything that came in: the bar's whole length. */
  total: number;
  /** Everything that left. */
  out: number;
  /** The bar: held first, then each outflow. */
  bar: FlowSegment[];
  /** The drill-down strip: exact inflows, then the balancing item(s). Same
   *  total length as the bar. */
  sources: FlowSegment[];
}

export interface FlowState {
  stop: number;
  isLive: boolean;
  /** Events on or before the stop. */
  count: number;
  collateral: FlowSideState;
  debt: FlowSideState;
  /** Held assets valued at a price older than `STALE_DAYS` at this stop. */
  stale: StalePrice[];
}

export const DAY_MS = 86_400_000;
/** A price older than this at a date is stated as such. */
export const STALE_DAYS = 30;
/** A held position below this many dollars is not named as stale. */
const STALE_FLOOR_USD = 1;
/** A repricing is marked when it moves its side's value by this share. */
const REPRICE_SHARE = 0.01;

const dayOf = (tsSec: number, start: number): number => Math.floor((tsSec * 1000 - start) / DAY_MS);

/** The largest of 1, 2, 2.5 or 5 × 10^k not above `x`. */
function niceStepBelow(x: number): number {
  if (!(x > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(x));
  const m = x / p;
  const f = m >= 5 ? 5 : m >= 2.5 ? 2.5 : m >= 2 ? 2 : 1;
  return f * p;
}

/** The axis for a peak bar length: gridlines at a round step, the end a
 *  little past the peak (on a fifth of that step) so the longest bar never
 *  touches the edge. */
export function axisFor(peak: number): { max: number; ticks: number[] } {
  if (!(peak > 0)) return { max: 1, ticks: [0] };
  const step = niceStepBelow(peak / 3);
  const grain = step / 5;
  const max = Math.ceil((peak * 1.02) / grain) * grain;
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { max, ticks };
}

/** Replay the events into one cumulative row per event. */
export function buildFlowModel(t: FlowTimeline): FlowModel | null {
  const events = [...t.events].sort((a, b) => a.ts - b.ts || a.block - b.block);
  if (events.length === 0) return null;
  const start = Math.floor((events[0].ts * 1000) / DAY_MS) * DAY_MS;
  const cum: Record<string, number> = Object.fromEntries(t.buckets.map((b) => [b.key, 0]));
  const held = new Map<string, { symbol: string; side: FlowSide; amount: number }>();
  const price = new Map<string, { usd: number; ts: number }>();
  const rows: FlowRow[] = [];
  const repricings: Repricing[] = [];

  for (const ev of events) {
    const day = dayOf(ev.ts, start);
    const before = rows[rows.length - 1];
    for (const p of ev.prices) {
      if (!(p.usd > 0)) continue;
      const prev = price.get(p.asset);
      const h = [...held.entries()].find(([k]) => k.endsWith(`:${p.asset}`))?.[1];
      // A step worth marking: a price older than STALE_DAYS that moves the
      // side's value by at least REPRICE_SHARE of it.
      if (prev && h && before && ev.ts - prev.ts > STALE_DAYS * 86_400) {
        const step = Math.abs(h.amount * (p.usd - prev.usd));
        const sideUsd = h.side === "collateral" ? before.collateralUsd : before.debtUsd;
        if (step >= STALE_FLOOR_USD && step >= sideUsd * REPRICE_SHARE)
          repricings.push({ day, symbol: h.symbol, from: prev.ts });
      }
      price.set(p.asset, { usd: p.usd, ts: ev.ts });
    }
    for (const leg of ev.legs) if (leg.bucket in cum && Number.isFinite(leg.usd)) cum[leg.bucket] += leg.usd;
    for (const b of ev.balances) held.set(`${b.side}:${b.asset}`, { symbol: b.symbol, side: b.side, amount: b.amount });

    let collateralUsd = 0;
    let debtUsd = 0;
    const stale: StalePrice[] = [];
    for (const [key, h] of held) {
      if (!(h.amount > 0)) continue;
      const asset = key.slice(key.indexOf(":") + 1);
      const p = price.get(asset);
      const usdPer = p?.usd ?? t.todayPrices?.[asset] ?? 0;
      const usd = h.amount * usdPer;
      if (h.side === "collateral") collateralUsd += usd;
      else debtUsd += usd;
      if (p && usd >= STALE_FLOOR_USD) stale.push({ symbol: h.symbol, side: h.side, pricedAt: p.ts, usd });
    }
    rows.push({ ts: ev.ts, day, cum: { ...cum }, collateralUsd, debtUsd, stale });
  }

  const lastDay = rows[rows.length - 1].day;
  const liveStop = lastDay + 1;
  const eventDays = [...new Set(rows.map((r) => r.day))];
  const outOf = (side: FlowSide, c: Record<string, number>) =>
    t.buckets.filter((b) => b.side === side && b.dir === "out").reduce((s, b) => s + (c[b.key] ?? 0), 0);
  const last = rows[rows.length - 1];
  const today = {
    collateral: t.live.collateralUsd + outOf("collateral", last.cum),
    debt: t.live.debtUsd + outOf("debt", last.cum),
  };
  let peak = Math.max(today.collateral, today.debt);
  for (const r of rows)
    peak = Math.max(peak, r.collateralUsd + outOf("collateral", r.cum), r.debtUsd + outOf("debt", r.cum));
  // An exact inflow can exceed its bar where a price fell; the drill-down
  // strip clamps to the bar, so the axis follows the bars alone.
  return {
    buckets: t.buckets,
    rows,
    start,
    lastDay,
    liveStop,
    eventDays,
    ticks: events.map((e) => ({ day: dayOf(e.ts, start), tick: e.tick })),
    repricings,
    live: t.live,
    axis: axisFor(peak),
    today,
  };
}

/** Index of the last row on or before the end of day `stop`, or -1. */
function rowAt(m: FlowModel, stop: number): number {
  let lo = 0;
  let hi = m.rows.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (m.rows[mid].day <= stop) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Lay exact sources end to end within `total`, then the balancing item(s).
 *  Each width is clamped to what the bar has left; the legend keeps the true
 *  signed value. */
function sourcesFor(
  exact: FlowSegment[],
  total: number,
  balancing: { key: string; label: string; value: number }[],
): FlowSegment[] {
  let left = Math.max(0, total);
  const out: FlowSegment[] = [];
  for (const s of exact) {
    const w = Math.min(Math.max(0, s.value), left);
    left -= w;
    out.push({ ...s, width: w });
  }
  for (const b of balancing) {
    const w = Math.min(Math.max(0, b.value), left);
    left -= w;
    out.push({ key: b.key, label: b.label, fill: "estimate", width: w, value: b.value });
  }
  return out;
}

function sideState(
  m: FlowModel,
  side: FlowSide,
  cum: Record<string, number>,
  now: number,
  interest: number | null,
): FlowSideState {
  const bs = m.buckets.filter((b) => b.side === side);
  const outs = bs.filter((b) => b.dir === "out");
  const ins = bs.filter((b) => b.dir === "in");
  const heldNow = Math.max(0, now);
  const out = outs.reduce((s, b) => s + Math.max(0, cum[b.key] ?? 0), 0);
  const total = heldNow + out;
  const bar: FlowSegment[] = [
    {
      key: `${side}-held`,
      label: side === "collateral" ? "Still supplied" : "Still owed",
      fill: "held",
      width: heldNow,
      value: heldNow,
    },
    ...outs.map((b) => {
      const v = Math.max(0, cum[b.key] ?? 0);
      return {
        key: b.key,
        label: b.label,
        short: b.short,
        fill: "out" as const,
        tone: b.tone ?? "exit",
        link: b.link,
        width: v,
        value: v,
      };
    }),
  ];
  const exact: FlowSegment[] = ins.map((b) => {
    const v = cum[b.key] ?? 0;
    return { key: b.key, label: b.label, short: b.short, fill: "in", light: b.light, width: v, value: v };
  });
  const rest = total - exact.reduce((s, x) => s + x.value, 0);
  const balancing =
    interest != null
      ? [
          ...(Math.abs(interest) >= 0.5
            ? [
                {
                  key: `${side}-interest`,
                  label: side === "collateral" ? "Interest earned" : "Interest accrued",
                  value: interest,
                },
              ]
            : []),
          { key: `${side}-price`, label: "Price change", value: rest - interest },
        ]
      : [
          {
            key: `${side}-market`,
            label: side === "collateral" ? "Market move and interest" : "Interest and price change",
            value: rest,
          },
        ];
  return { now: heldNow, total, out, bar, sources: sourcesFor(exact, total, balancing) };
}

/** The position as of the end of day `stop` (0 = the first event's day), or
 *  at live prices at `m.liveStop`. */
export function stateAt(m: FlowModel, stop: number): FlowState {
  const isLive = stop >= m.liveStop;
  const i = isLive ? m.rows.length - 1 : rowAt(m, stop);
  const row = i >= 0 ? m.rows[i] : null;
  const cum = row?.cum ?? Object.fromEntries(m.buckets.map((b) => [b.key, 0]));
  const collNow = isLive ? m.live.collateralUsd : (row?.collateralUsd ?? 0);
  const debtNow = isLive ? m.live.debtUsd : (row?.debtUsd ?? 0);
  const cutoff = (m.start + (Math.min(stop, m.lastDay) + 1) * DAY_MS) / 1000;
  const stale = isLive || !row ? [] : row.stale.filter((s) => cutoff - s.pricedAt > STALE_DAYS * 86_400);
  return {
    stop: Math.min(stop, m.liveStop),
    isLive,
    count: i + 1,
    collateral: sideState(m, "collateral", cum, collNow, isLive ? m.live.collateralInterestUsd : null),
    debt: sideState(m, "debt", cum, debtNow, isLive ? m.live.debtInterestUsd : null),
    stale,
  };
}

/** The event day before `stop`, or 0 when there is none. */
export function prevEventDay(m: FlowModel, stop: number): number {
  let t = 0;
  for (const d of m.eventDays) if (d < stop) t = d;
  return t;
}

/** The event day after `stop`, or the live stop after the last one. */
export function nextEventDay(m: FlowModel, stop: number): number {
  for (const d of m.eventDays) if (d > stop) return d;
  return m.liveStop;
}

/** Unix seconds of the start of day `stop`. */
export const dayStart = (m: FlowModel, stop: number): number => (m.start + stop * DAY_MS) / 1000;

/** "$123k" · "$5.5k" · "$363" · "$1.2M" · "−$5k": whole dollars under $1k, one
 *  decimal under $10k, whole thousands above. */
export function formatFlowUsd(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 && a >= 0.5 ? "−" : "";
  let body: string;
  if (a >= 1_000_000) body = `$${(a / 1_000_000).toFixed(1)}M`;
  else if (a >= 9_999.5) body = `$${Math.round(a / 1_000)}k`;
  else if (a >= 999.5) body = `$${(a / 1_000).toFixed(1)}k`;
  else body = `$${Math.round(a)}`;
  return sign + body;
}

/** "211 thousand dollars" — a figure for a screen reader. */
export function spokenUsd(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "minus " : "";
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(1)} million dollars`;
  if (a >= 1_000) return `${sign}${Math.round(a / 1_000)} thousand dollars`;
  return `${sign}${Math.round(a)} dollars`;
}
