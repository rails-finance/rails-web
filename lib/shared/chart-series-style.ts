// A chart line's colour and dash, from its key (rails-ops
// reference/asset-key-map.md, "The chart engine", "Colour and the legend"):
// the main line wears the main hue, every other line one of SERIES_SLOTS
// categorical tokens (`--chart-series-1` to `-4` in app/globals.css, a
// Tailwind step per theme, validated with the dataviz method in light and
// dark), and past the slots a second dash. A line's style follows its key,
// so it holds across zooms, reloads and a `via` that changes the main line:
// each key hashes to a preferred slot, and the chart's keys, taken in hash
// order, probe for a free style, so the style a key gets depends on the set
// of keys alone. The asset chart takes it; the position chart can. Pure, and
// imports nothing.

/** Categorical slots before a second dash is needed. */
export const SERIES_SLOTS = 4;
export const SERIES_TOKENS = [
  "var(--chart-series-1)",
  "var(--chart-series-2)",
  "var(--chart-series-3)",
  "var(--chart-series-4)",
] as const;
export const DASHES = ["solid", "dashed", "dotted", "long"] as const;
export type SeriesDash = (typeof DASHES)[number];
/** Lightweight Charts' LineStyle for each dash (Solid 0, Dotted 1, Dashed 2, LargeDashed 3). */
export const LW_LINE_STYLE: Record<SeriesDash, 0 | 1 | 2 | 3> = { solid: 0, dashed: 2, dotted: 1, long: 3 };
/** An SVG key's stroke-dasharray for each dash, at a 1.5 px stroke. */
export const SVG_DASH: Record<SeriesDash, string | undefined> = {
  solid: undefined,
  dashed: "3 2",
  dotted: "1 2",
  long: "6 2",
};

export interface SeriesStyle {
  /** 0-based slot of SERIES_TOKENS. */
  slot: number;
  token: string;
  dash: SeriesDash;
}

/** FNV-1a, 32 bits. */
export function keyHash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Each key's style on one chart. Keys are taken in hash order (then by key);
 *  each takes its preferred slot in the first dash with it free, else the next
 *  free slot of that dash, else the next dash. */
export function seriesStyles(keys: readonly string[]): Map<string, SeriesStyle> {
  const order = [...new Set(keys)].sort((a, b) => keyHash(a) - keyHash(b) || (a < b ? -1 : a > b ? 1 : 0));
  const taken = new Set<number>();
  const out = new Map<string, SeriesStyle>();
  for (const k of order) {
    const pref = keyHash(k) % SERIES_SLOTS;
    let idx = -1;
    for (let d = 0; d < DASHES.length && idx < 0; d++)
      for (let s = 0; s < SERIES_SLOTS; s++) {
        const i = d * SERIES_SLOTS + ((pref + s) % SERIES_SLOTS);
        if (!taken.has(i)) {
          idx = i;
          break;
        }
      }
    // Past every style a key shares the last dash's preferred slot.
    if (idx < 0) idx = (DASHES.length - 1) * SERIES_SLOTS + pref;
    else taken.add(idx);
    const slot = idx % SERIES_SLOTS;
    out.set(k, { slot, token: SERIES_TOKENS[slot], dash: DASHES[Math.floor(idx / SERIES_SLOTS)] });
  }
  return out;
}

/** The line nearest `y` (px) among `ys` (px, null where the line has no value
 *  there), within `maxPx`; null where none is. */
export function nearestLine(y: number, ys: readonly { id: string; y: number | null }[], maxPx: number): string | null {
  let best: string | null = null;
  let d = maxPx;
  for (const o of ys) {
    if (o.y == null) continue;
    const e = Math.abs(o.y - y);
    if (e <= d) {
      d = e;
      best = o.id;
    }
  }
  return best;
}
