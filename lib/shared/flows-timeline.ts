// Lifetime flows over time — the protocol-neutral contract behind the date
// scrubber (components/shared/lifetime-flows-scrubber.tsx, rails-ops
// reference/lifetime-flows-scrubber.md).
// ----------------------------------------------------------------------------
// An adapter hands in one row per active UTC day: the running USD per lifetime
// bucket after the day's last event (each flow valued at the oracle price at
// its block, the tower's rule), the token balances the day's events left, and
// the prices they carried. The scrubber steps by day and a day's state is its
// last event's, so day rows are exact. `daysFromEvents` builds them from a
// page's events; the Aave V3 route (/api/aave-v3/flows/daily) serves them.
//
// Everything the view draws at a date is `stateAt(model, stop)`: a pure
// function of the rows, the prices and the live totals, with no DOM and no
// fetch, so it is tested offline (scripts/verify/verify-lifetime-flows-state.ts).
//
// Prices between events. With a daily series (`dailyPrices`: the last oracle
// price recorded on or before each day's end), a held asset is valued at its
// day's price; a stretch where the series records nothing for more than
// `SERIES_GAP_DAYS` keeps its older price and is marked. Without one, an asset
// keeps the price its last event carried and a price older than `STALE_DAYS`
// is marked. Nothing is interpolated.

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

/** One active UTC day: the position after the day's last event. */
export interface FlowDayRow {
  /** UTC day number (unix seconds / 86400). */
  day: number;
  /** Events on or before this day. */
  events: number;
  /** Which sides the day's events moved, or a liquidation: the tick strip. */
  tick: FlowEvent["tick"];
  /** Running USD per bucket after the day. */
  cum: Record<string, number>;
  /** Balances the day's events stated, after its last event. */
  balances: FlowEvent["balances"];
  /** Each asset's last at-block price that day, with its block time. */
  prices: { asset: string; usd: number; ts: number }[];
}

export interface FlowTimeline {
  buckets: FlowBucket[];
  /** Ascending by day. */
  days: FlowDayRow[];
  live: FlowLive;
  /** Today's price per asset, for an asset held while no event has priced it. */
  todayPrices?: Record<string, number>;
  /** Per asset, the days a new daily price was recorded: [day, usd]. The last
   *  oracle price recorded on or before each day's end, across every wallet. */
  dailyPrices?: Record<string, [number, number][]>;
  /** Today's UTC day number. With it the slider runs to today while anything
   *  is still held after the last event; without it, one stop past that event. */
  today?: number;
  /** Events in the history (the last day row's count when absent). */
  totalEvents?: number;
}

/** A held asset whose price, at some date, is older than the gap allowed. */
export interface StalePrice {
  symbol: string;
  side: FlowSide;
  /** Unix seconds of the price used. */
  pricedAt: number;
  usd: number;
}

/** A day that repriced a held asset after a stale stretch. */
export interface Repricing {
  /** Slider stop (day index). */
  day: number;
  symbol: string;
  /** Unix seconds of the previous price. */
  from: number;
}

interface FlowRow {
  /** Slider stop of the active day. */
  day: number;
  events: number;
  cum: Record<string, number>;
}

export interface FlowModel {
  buckets: FlowBucket[];
  /** One per active day, ascending. */
  rows: FlowRow[];
  /** UTC midnight of the first event's day, ms. */
  start: number;
  /** Day index of the last event's day. */
  lastDay: number;
  /** The final stop: today, at live prices. */
  liveStop: number;
  /** Day indexes that carry at least one event, ascending, unique. */
  eventDays: number[];
  /** The tick strip: one entry per active day. */
  ticks: { day: number; tick: FlowEvent["tick"] }[];
  repricings: Repricing[];
  live: FlowLive;
  /** Held and owed, valued, at the end of each stop before the live one. */
  valued: { collateral: number; debt: number }[];
  /** Held assets on an old price, per stop (only stops that have any). */
  stale: Map<number, StalePrice[]>;
  /** Whether held assets are valued at a daily price series. */
  daily: boolean;
  totalEvents: number;
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
  /** Held assets valued at an old price at this stop. */
  stale: StalePrice[];
}

export const DAY_MS = 86_400_000;
const DAY_S = 86_400;
/** Event prices only: a price older than this at a date is stated as such. */
export const STALE_DAYS = 30;
/** Daily series: a stretch longer than this with no recorded price keeps the
 *  older price, stated as such. */
export const SERIES_GAP_DAYS = 7;
/** A held position below this many dollars is not named as stale. */
const STALE_FLOOR_USD = 1;
/** A repricing is marked when it moves its side's value by this share. */
const REPRICE_SHARE = 0.01;

const utcDay = (tsSec: number): number => Math.floor(tsSec / DAY_S);

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

/** A page's events as day rows: each day's running totals, the balances its
 *  events stated, and the prices they carried, as the day's last event left
 *  them. */
export function daysFromEvents(bucketKeys: string[], events: FlowEvent[]): FlowDayRow[] {
  const ordered = [...events].sort((a, b) => a.ts - b.ts || a.block - b.block);
  const cum: Record<string, number> = Object.fromEntries(bucketKeys.map((k) => [k, 0]));
  const days: FlowDayRow[] = [];
  let cur: {
    day: number;
    sides: Set<"collateral" | "debt">;
    liq: boolean;
    balances: Map<string, FlowEvent["balances"][number]>;
    prices: Map<string, { usd: number; ts: number }>;
  } | null = null;
  let n = 0;
  const close = () => {
    if (!cur) return;
    days.push({
      day: cur.day,
      events: n,
      tick: cur.liq ? "liquidation" : cur.sides.size === 2 ? "both" : cur.sides.has("debt") ? "debt" : "collateral",
      cum: { ...cum },
      balances: [...cur.balances.values()],
      prices: [...cur.prices].map(([asset, p]) => ({ asset, usd: p.usd, ts: p.ts })),
    });
    cur = null;
  };
  for (const ev of ordered) {
    const day = utcDay(ev.ts);
    if (cur && cur.day !== day) close();
    cur ??= { day, sides: new Set(), liq: false, balances: new Map(), prices: new Map() };
    n += 1;
    for (const p of ev.prices) if (p.usd > 0) cur.prices.set(p.asset, { usd: p.usd, ts: ev.ts });
    for (const leg of ev.legs) if (leg.bucket in cum && Number.isFinite(leg.usd)) cum[leg.bucket] += leg.usd;
    for (const b of ev.balances) cur.balances.set(`${b.side}:${b.asset}`, b);
    if (ev.tick === "liquidation") cur.liq = true;
    else if (ev.tick === "both") {
      cur.sides.add("collateral");
      cur.sides.add("debt");
    } else cur.sides.add(ev.tick);
  }
  close();
  return days;
}

/** One asset's price at a stop: the newer of its daily series and its events'. */
interface PriceAt {
  usd: number;
  /** Unix seconds the price was recorded (a series price: its day's start). */
  ts: number;
  /** Stop of the day it was recorded. */
  day: number;
  series: boolean;
}

/** Replay the day rows into the model the scrubber reads. */
export function buildFlowModel(t: FlowTimeline): FlowModel | null {
  const days = [...t.days].sort((a, b) => a.day - b.day);
  if (days.length === 0) return null;
  const startDay = days[0].day;
  const start = startDay * DAY_MS;
  const daily = !!t.dailyPrices && Object.keys(t.dailyPrices).length > 0;
  const gapDays = daily ? SERIES_GAP_DAYS : STALE_DAYS;
  const outOf = (side: FlowSide, c: Record<string, number>) =>
    t.buckets.filter((b) => b.side === side && b.dir === "out").reduce((s, b) => s + (c[b.key] ?? 0), 0);

  const rows: FlowRow[] = days.map((d) => ({ day: d.day - startDay, events: d.events, cum: { ...d.cum } }));
  const lastDay = rows[rows.length - 1].day;
  const eventDays = rows.map((r) => r.day);

  // Held balances after the last active day, to see whether the slider runs on.
  const heldEnd = new Map<string, number>();
  for (const d of days) for (const b of d.balances) heldEnd.set(`${b.side}:${b.asset}`, b.amount);
  const stillHeld = [...heldEnd.values()].some((v) => v > 0);
  const liveStop = t.today != null && stillHeld ? Math.max(lastDay + 1, t.today - startDay) : lastDay + 1;

  // Each asset's daily observations as stops, ascending.
  const series = new Map<string, { day: number; usd: number }[]>();
  for (const [asset, obs] of Object.entries(t.dailyPrices ?? {}))
    series.set(
      asset,
      obs
        .map(([d, usd]) => ({ day: d - startDay, usd }))
        .filter((o) => o.usd > 0)
        .sort((a, b) => a.day - b.day),
    );
  const seriesAt = (asset: string, stop: number, from: { i: number }): PriceAt | null => {
    const obs = series.get(asset);
    if (!obs) return null;
    while (from.i + 1 < obs.length && obs[from.i + 1].day <= stop) from.i++;
    const o = obs[from.i];
    return o && o.day <= stop ? { usd: o.usd, ts: (startDay + o.day) * DAY_S, day: o.day, series: true } : null;
  };

  const held = new Map<string, { symbol: string; side: FlowSide; amount: number }>();
  const eventPrice = new Map<string, PriceAt>();
  const seriesCursor = new Map<string, { i: number }>();
  const valued: FlowModel["valued"] = [];
  const stale = new Map<number, StalePrice[]>();
  const repricings: Repricing[] = [];
  let prevPrice = new Map<string, PriceAt>();
  let di = 0;

  for (let stop = 0; stop < liveStop; stop++) {
    if (di < days.length && days[di].day - startDay === stop) {
      const d = days[di++];
      for (const p of d.prices)
        if (p.usd > 0) eventPrice.set(p.asset, { usd: p.usd, ts: p.ts, day: utcDay(p.ts) - startDay, series: false });
      for (const b of d.balances)
        held.set(`${b.side}:${b.asset}`, { symbol: b.symbol, side: b.side, amount: b.amount });
    }
    const priceNow = new Map<string, PriceAt>();
    let coll = 0;
    let debt = 0;
    const staleHere: StalePrice[] = [];
    const lines: { asset: string; h: { symbol: string; side: FlowSide; amount: number }; usd: number }[] = [];
    for (const [key, h] of held) {
      if (!(h.amount > 0)) continue;
      const asset = key.slice(key.indexOf(":") + 1);
      let p = priceNow.get(asset);
      if (!p) {
        const cursor = seriesCursor.get(asset) ?? { i: 0 };
        seriesCursor.set(asset, cursor);
        const s = seriesAt(asset, stop, cursor);
        const e = eventPrice.get(asset);
        // The newer of the two; on one day the series (the day's end) wins.
        const best = s && e ? (e.day > s.day ? e : s) : (s ?? e ?? null);
        if (best) {
          p = best;
          priceNow.set(asset, best);
        }
      }
      const usdPer = p?.usd ?? t.todayPrices?.[asset] ?? 0;
      const usd = h.amount * usdPer;
      if (h.side === "collateral") coll += usd;
      else debt += usd;
      lines.push({ asset, h, usd });
      if (p && usd >= STALE_FLOOR_USD) {
        const old = daily ? stop - p.day > gapDays : (startDay + stop + 1) * DAY_S - p.ts > gapDays * DAY_S;
        if (old) staleHere.push({ symbol: h.symbol, side: h.side, pricedAt: p.ts, usd });
      }
    }
    // A repricing: a held asset whose price was stale at the previous stop
    // gets a newer one, and the step moves its side by REPRICE_SHARE or more.
    if (stop > 0) {
      const before = valued[stop - 1];
      for (const { asset, h } of lines) {
        const was = prevPrice.get(asset);
        const now = priceNow.get(asset);
        if (!was || !now || now.ts <= was.ts) continue;
        const staleBefore = daily
          ? stop - 1 - was.day > gapDays
          : (startDay + stop) * DAY_S - was.ts > gapDays * DAY_S || now.ts - was.ts > gapDays * DAY_S;
        if (!staleBefore) continue;
        const step = Math.abs(h.amount * (now.usd - was.usd));
        const sideUsd = h.side === "collateral" ? before.collateral : before.debt;
        if (
          step >= STALE_FLOOR_USD &&
          step >= sideUsd * REPRICE_SHARE &&
          !repricings.some((r) => r.day === stop && r.symbol === h.symbol)
        )
          repricings.push({ day: stop, symbol: h.symbol, from: was.ts });
      }
    }
    // Only what was held at this stop can be repriced at the next.
    prevPrice = priceNow;
    valued.push({ collateral: coll, debt });
    if (staleHere.length) stale.set(stop, staleHere);
  }

  const last = rows[rows.length - 1];
  const today = {
    collateral: t.live.collateralUsd + outOf("collateral", last.cum),
    debt: t.live.debtUsd + outOf("debt", last.cum),
  };
  let peak = Math.max(today.collateral, today.debt);
  let ri = 0;
  for (let stop = 0; stop < liveStop; stop++) {
    while (ri + 1 < rows.length && rows[ri + 1].day <= stop) ri++;
    const c = rows[ri].cum;
    peak = Math.max(peak, valued[stop].collateral + outOf("collateral", c), valued[stop].debt + outOf("debt", c));
  }
  // An exact inflow can exceed its bar where a price fell; the drill-down
  // strip clamps to the bar, so the axis follows the bars alone.
  return {
    buckets: t.buckets,
    rows,
    start,
    lastDay,
    liveStop,
    eventDays,
    ticks: days.map((d) => ({ day: d.day - startDay, tick: d.tick })),
    repricings,
    live: t.live,
    valued,
    stale,
    daily,
    totalEvents: t.totalEvents ?? last.events,
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
  const v = !isLive && stop >= 0 ? m.valued[Math.min(stop, m.valued.length - 1)] : undefined;
  const collNow = isLive ? m.live.collateralUsd : (v?.collateral ?? 0);
  const debtNow = isLive ? m.live.debtUsd : (v?.debt ?? 0);
  return {
    stop: Math.min(stop, m.liveStop),
    isLive,
    count: row?.events ?? 0,
    collateral: sideState(m, "collateral", cum, collNow, isLive ? m.live.collateralInterestUsd : null),
    debt: sideState(m, "debt", cum, debtNow, isLive ? m.live.debtInterestUsd : null),
    stale: isLive ? [] : (m.stale.get(stop) ?? []),
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
