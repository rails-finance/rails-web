// The asset chart's time grid (rails-ops reference/asset-key-map.md, "The
// chart engine"). Lightweight Charts spaces its bars by index, so the chart
// draws every line on a uniform grid of cells: one cell is one bar, and a
// cell's value is the line's value in force at the cell's end (its close),
// so a step line holds each price until the next round and the time axis
// stays proportional. The grid covers the visible window and one window
// either side, at the step that gives about BAR_PX pixels a cell; a zoom or
// pan that leaves it rebuilds it. Zoomed in on stored rounds, the cells are
// filled from detail reads of `/api/prices/rounds`, fetched in chunks of
// CHUNK_CELLS cells with `max` = CHUNK_MAX. Pure, and imports nothing.

export const DAY_S = 86_400;

/** The value in force at `ts` in ascending `[ts, value]` points, or null before the first. */
export function inForce(points: readonly (readonly [number, number, ...unknown[]])[], ts: number): number | null {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= ts) lo = mid + 1;
    else hi = mid;
  }
  return lo ? points[lo - 1][1] : null;
}
/** The steps a grid may take, in seconds: a minute to 30 days. */
export const GRID_STEPS = [
  60,
  120,
  300,
  600,
  900,
  1800,
  3600,
  7200,
  14_400,
  21_600,
  43_200,
  DAY_S,
  2 * DAY_S,
  4 * DAY_S,
  7 * DAY_S,
  14 * DAY_S,
  30 * DAY_S,
];
/** Pixels a cell aims for. */
export const BAR_PX = 2;
/** Cells a detail read covers, and the points per line it asks for (2 a cell: a bucket's low and high). */
export const CHUNK_CELLS = 1000;
export const CHUNK_MAX = 2000;
/** A grid never holds more cells than this. */
export const MAX_CELLS = 6000;

export interface Grid {
  /** The first cell's start (unix seconds, a multiple of `step`). */
  start: number;
  step: number;
  count: number;
  /** The last moment with data (the checkpoint, or the end of the last stored day). */
  t1: number;
}

/** The smallest step that fits `span` seconds into `width` pixels at BAR_PX a
 *  cell, and no finer than `minStep` (a chart whose data is daily stops its
 *  zoom there). */
export function gridStep(span: number, width: number, minStep = 0): number {
  const cells = Math.max(10, Math.floor(width / BAR_PX));
  const want = Math.max(span / cells, minStep);
  return GRID_STEPS.find((s) => s >= want) ?? GRID_STEPS[GRID_STEPS.length - 1];
}

/** The grid for a visible window: one window either side, cut to the data's span. */
export function gridFor(
  view: { from: number; to: number },
  bounds: { t0: number; t1: number },
  width: number,
  minStep = 0,
): Grid {
  const w = Math.max(60, view.to - view.from);
  let step = gridStep(w, width, minStep);
  const a = Math.max(bounds.t0, view.from - w);
  const b = Math.min(bounds.t1, view.to + w);
  let start = Math.floor(a / step) * step;
  let count = Math.floor((b - start) / step) + 1;
  while (count > MAX_CELLS) {
    step = GRID_STEPS.find((s) => s > step) ?? step * 2;
    start = Math.floor(a / step) * step;
    count = Math.floor((b - start) / step) + 1;
  }
  return { start, step, count, t1: bounds.t1 };
}

/** Cell `i`'s start, the time Lightweight Charts labels it with. */
export const cellTime = (g: Grid, i: number) => g.start + i * g.step;
/** The moment cell `i` shows: its last second, the checkpoint at most. */
export const cellAt = (g: Grid, i: number) => Math.min(g.start + (i + 1) * g.step - 1, g.t1);
/** The cell holding `ts`. */
export const cellOf = (g: Grid, ts: number) => Math.floor((ts - g.start) / g.step);

/** A line as the chart reads it: its points `[ts, value]` ascending, valid to `end`. */
export interface Track {
  points: readonly (readonly [number, number])[];
  end: number;
  /** From here the points are stored rounds (null: daily throughout). */
  roundsFrom: number | null;
}

/** A line's track: its daily points (`[day, value]`) before its rounds'
 *  first day, then every round. On a grid of a day or more, the daily
 *  points alone (the rounds' day closes among them). */
export function lineTrack(
  daily: readonly (readonly [number, number, ...unknown[]])[],
  rounds: {
    points: readonly (readonly [number, number, ...unknown[]])[];
    joinDay: number;
    from: { ts: number };
    asOf: { ts: number };
  } | null,
  step: number,
  t1: number,
): Track {
  const days = (pts: typeof daily) => pts.map((p) => [p[0] * DAY_S, p[1]] as const);
  if (!rounds) {
    const last = daily.at(-1);
    return { points: days(daily), end: last ? Math.min(t1, (last[0] + 1) * DAY_S - 1) : 0, roundsFrom: null };
  }
  if (step >= DAY_S) return { points: days(daily), end: rounds.asOf.ts, roundsFrom: null };
  const before = days(daily.filter((p) => p[0] < rounds.joinDay));
  const after = rounds.points.map((p) => [p[0], p[1]] as const);
  return { points: [...before, ...after], end: rounds.asOf.ts, roundsFrom: rounds.from.ts };
}

/** Each cell's value, null before the track's first point or past its end. */
export function sampleTrack(g: Grid, t: Track): (number | null)[] {
  const out: (number | null)[] = new Array(g.count);
  const first = t.points[0]?.[0] ?? Infinity;
  for (let i = 0; i < g.count; i++) {
    const at = cellAt(g, i);
    out[i] = at < first || cellTime(g, i) > t.end ? null : inForce(t.points, Math.min(at, t.end));
  }
  return out;
}

/** A cell's position on the chart's index scale for a moment: cell `i` is
 *  read at its end, so the moment that ends it stands at `i` (fractional
 *  between). */
export const logicalOf = (g: Grid, ts: number) => (ts - g.start) / g.step - 1;

/** Each cell's value on a line of vertices `[ts, value]` joined straight (the
 *  Lifetime flows charts' lines, whose points are day closes), read at the
 *  cell's end (the data's end at most). A cell belongs to the segment it ends
 *  in (one ending on a vertex, to the segment into it, or where that one is
 *  broken, to the one out of it). Null before the first vertex, after the
 *  last, on a segment touching a null vertex, and on a segment `keep` refuses;
 *  `pad` widens each kept run by a cell either side, so a dotted piece drawn
 *  as its own series meets the solid line it interrupts. */
export function sampleJoined(
  g: Grid,
  verts: readonly (readonly [number, number | null])[],
  keep: (segment: number) => boolean = () => true,
  pad = false,
): (number | null)[] {
  const raw: (number | null)[] = new Array(g.count).fill(null);
  const kept: boolean[] = new Array(g.count).fill(false);
  const n = verts.length;
  if (n === 0) return raw;
  const ok = (j: number) => j >= 0 && j < n - 1 && verts[j][1] != null && verts[j + 1][1] != null;
  let k = 0;
  for (let i = 0; i < g.count; i++) {
    const t = Math.min(g.start + (i + 1) * g.step, g.t1);
    if (t < verts[0][0] || t > verts[n - 1][0]) continue;
    while (verts[k][0] < t) k++;
    const [tk, vk] = verts[k];
    if (tk === t) {
      if (vk == null) continue;
      raw[i] = vk;
      kept[i] = ok(k - 1) ? keep(k - 1) : ok(k) ? keep(k) : keep(Math.max(0, k - 1));
      continue;
    }
    if (!ok(k - 1)) continue;
    const [ta, va] = verts[k - 1];
    raw[i] = (va as number) + (((vk as number) - (va as number)) * (t - ta)) / (tk - ta);
    kept[i] = keep(k - 1);
  }
  return raw.map((v, i) => (kept[i] || (pad && (kept[i - 1] || kept[i + 1])) ? v : null));
}

/** Each cell's value on step runs (`[ts, value]` ascending, each run held
 *  from one vertex to the next and ending on its last), null between runs. */
export function sampleRuns(g: Grid, runs: readonly (readonly (readonly [number, number])[])[]): (number | null)[] {
  const out: (number | null)[] = new Array(g.count).fill(null);
  for (const run of runs) {
    if (run.length === 0) continue;
    const a = Math.max(0, Math.ceil(logicalOf(g, run[0][0]) - 1e-9));
    const b = Math.min(g.count - 1, Math.floor(logicalOf(g, run[run.length - 1][0]) + 1e-9));
    for (let i = a; i <= b; i++) out[i] = inForce(run, Math.min(g.start + (i + 1) * g.step, g.t1));
  }
  return out;
}

/** Each cell's deviation of `other` from `main` (a fraction): on both lines'
 *  rounds at the cell's moment, before them the day's spread (`byDay`,
 *  compared only where the store's reads were within ten minutes). */
export function sampleSpread(
  g: Grid,
  main: Track,
  other: Track,
  byDay: ReadonlyMap<number, number>,
): (number | null)[] {
  const both = main.roundsFrom != null && other.roundsFrom != null ? Math.max(main.roundsFrom, other.roundsFrom) : null;
  const out: (number | null)[] = new Array(g.count);
  for (let i = 0; i < g.count; i++) {
    const at = cellAt(g, i);
    if (both != null && at >= both) {
      const end = Math.min(main.end, other.end);
      const m = cellTime(g, i) > end ? null : inForce(main.points, Math.min(at, end));
      const o = m == null ? null : inForce(other.points, Math.min(at, end));
      out[i] = m != null && o != null && m > 0 ? o / m - 1 : null;
    } else out[i] = byDay.get(Math.floor(at / DAY_S)) ?? null;
  }
  return out;
}

/** The detail chunks a grid reads: chunk `k` spans [k·S, (k+1)·S) for S = step·CHUNK_CELLS,
 *  only those overlapping [from, to] (the stored rounds' span). None on a grid of a day or more. */
export function gridChunks(g: Grid, span: { from: number; to: number }): { k: number; from: number; to: number }[] {
  if (g.step >= DAY_S) return [];
  const S = g.step * CHUNK_CELLS;
  const a = Math.max(g.start, span.from);
  const b = Math.min(g.start + g.count * g.step, span.to);
  if (b < a) return [];
  const out: { k: number; from: number; to: number }[] = [];
  for (let k = Math.floor(a / S); k <= Math.floor(b / S); k++) out.push({ k, from: k * S, to: (k + 1) * S });
  return out;
}

/** `base` points with each chunk's window replaced by the chunk's points
 *  (a chunk's first point is the one in force at its `from`). */
export function withDetail<P extends readonly [number, ...unknown[]]>(
  base: readonly P[],
  chunks: readonly { from: number; to: number; points: readonly P[] }[],
): P[] {
  if (chunks.length === 0) return [...base];
  const inside = (ts: number) => chunks.some((c) => ts >= c.from && ts < c.to);
  const byTs = new Map<number, P>();
  for (const p of base) if (!inside(p[0])) byTs.set(p[0], p);
  for (const c of chunks) for (const p of c.points) byTs.set(p[0], p);
  return [...byTs.values()].sort((x, y) => x[0] - y[0]);
}

/** Whether the visible window wants a new grid: its step no longer fits,
 *  or it nears an edge of the grid that is not the data's edge. */
export function needsRegrid(
  g: Grid,
  view: { from: number; to: number },
  bounds: { t0: number; t1: number },
  width: number,
  minStep = 0,
): boolean {
  const w = view.to - view.from;
  const step = gridStep(w, width, minStep);
  if (step !== g.step && !(g.count >= MAX_CELLS && step < g.step)) return true;
  const gEnd = g.start + g.count * g.step;
  const margin = w / 4;
  return (g.start > bounds.t0 && view.from < g.start + margin) || (gEnd < bounds.t1 && view.to > gEnd - margin);
}
