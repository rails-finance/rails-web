// The vault comparison's rules (rails-ops ui-jobs 553 door 3, 779;
// /vaults/compare): which vaults a selection holds, which facts differ, and
// the holder donut's slices. The page's words are lib/vaults/compare-words.ts; its reads are
// lib/vaults/compare-read.ts.
// ----------------------------------------------------------------------------
// A selection is two to four vaults, each `<chain id>:<lowercased address>`,
// in the order the reader picked them. Rails scores and ranks nothing: the
// columns keep the picker's order.
//
// Pure, with no imports: scripts/test/vault-compare.test.mjs reads it.

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 4;

/** The page's path; the selection rides in `?v=`. */
export const COMPARE_HREF = "/vaults/compare";

/** A vault's key in a selection and in `?v=`. */
export const compareKey = (chainId: number, address: string): string => `${chainId}:${address.toLowerCase()}`;

const KEY_RE = /^\d+:0x[0-9a-f]{40}$/;

/** `?v=` as keys: trimmed, lowercased, once each, at most four. A malformed
 *  entry is kept, so the page can name it as not found. */
export function parseCompareParam(v: string | null | undefined): string[] {
  if (!v) return [];
  const out: string[] = [];
  for (const raw of v.split(",")) {
    const k = raw.trim().toLowerCase();
    if (k && !out.includes(k)) out.push(k);
  }
  return out.slice(0, COMPARE_MAX);
}

/** Is this a key's shape (`1:0x…`)? */
export const isCompareKey = (k: string): boolean => KEY_RE.test(k);

/** The page's href for a selection. */
export const compareHref = (keys: readonly string[]): string =>
  keys.length ? `${COMPARE_HREF}?v=${keys.join(",")}` : COMPARE_HREF;

/** The picker's slots as the page's keys: the filled ones in slot order,
 *  each once, at most four. */
export function pickedKeys(slots: readonly (string | null)[]): string[] {
  const out: string[] = [];
  for (const k of slots) if (k && !out.includes(k)) out.push(k);
  return out.slice(0, COMPARE_MAX);
}

// ── Differences ────────────────────────────────────────────────────────────

/** Does a fact differ across the columns? Each value is what the column
 *  prints; an absent one (null) counts as a value of its own. */
export const differs = (values: readonly (string | null)[]): boolean => new Set(values).size > 1;

// ── The holder donut ───────────────────────────────────────────────────────

/** How many holders take a slice of their own. */
export const DONUT_HOLDERS = 6;

export interface DonutInput {
  holder: string;
  /** Of the vault's supply, 0..1. */
  share: number;
}

export interface DonutSlice {
  /** The holder's address, or null for the others' slice. */
  holder: string | null;
  share: number;
  /** Turns from the top, clockwise, 0..1. */
  start: number;
  end: number;
}

/** The largest holders' slices, largest first, then one slice for the rest of
 *  the vault. Shares under zero are dropped; a top set that sums past the
 *  whole (each share rounded at the census) is scaled to it, leaving the
 *  others' slice empty. */
export function donutSlices(top: readonly DonutInput[], max = DONUT_HOLDERS): DonutSlice[] {
  const held = top
    .filter((t) => Number.isFinite(t.share) && t.share > 0)
    .sort((a, b) => b.share - a.share)
    .slice(0, max);
  const sum = held.reduce((a, t) => a + t.share, 0);
  const scale = sum > 1 ? 1 / sum : 1;
  const out: DonutSlice[] = [];
  let at = 0;
  for (const t of held) {
    const share = t.share * scale;
    out.push({ holder: t.holder, share, start: at, end: at + share });
    at += share;
  }
  const others = Math.max(0, 1 - at);
  if (others > 1e-9) out.push({ holder: null, share: others, start: at, end: 1 });
  return out;
}

const round = (x: number) => Math.round(x * 1000) / 1000;

/** A point on a circle, `turn` turns clockwise from the top. */
function point(cx: number, cy: number, r: number, turn: number): [number, number] {
  const a = turn * 2 * Math.PI;
  return [round(cx + r * Math.sin(a)), round(cy - r * Math.cos(a))];
}

/** An annulus sector from `start` to `end` turns, as an SVG path. A sector of
 *  the whole ring is drawn as two halves, since one arc cannot close on itself. */
export function ringPath(cx: number, cy: number, outer: number, inner: number, start: number, end: number): string {
  if (end - start >= 0.9999)
    return `${ringPath(cx, cy, outer, inner, 0, 0.5)} ${ringPath(cx, cy, outer, inner, 0.5, 1)}`;
  const large = end - start > 0.5 ? 1 : 0;
  const [x0, y0] = point(cx, cy, outer, start);
  const [x1, y1] = point(cx, cy, outer, end);
  const [x2, y2] = point(cx, cy, inner, end);
  const [x3, y3] = point(cx, cy, inner, start);
  return `M${x0} ${y0}A${outer} ${outer} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${inner} ${inner} 0 ${large} 0 ${x3} ${y3}Z`;
}
