// A share of a whole as a segmented bar (the iOS storage bar): one rounded
// segment per slice, largest first, a gap between each, each segment's width
// its share of the bar less the gaps. A slice too small to see keeps
// MIN_WIDTH, taken from the largest, which fills what the others leave.
// Widths are CSS (a rounded share of the bar's width), so the server and the
// browser draw the same thing.
//
// Linking: give the bar a `scope` and set `data-seg-scope` to it on an
// ancestor holding the bar and its legend; a legend row carrying
// `data-seg="<slice key>"` then lights with its segment on hover or focus,
// and every other segment and row dims (plain CSS `:has()`, no state).

/** One slice: a part of a whole. */
export interface SegmentSlice {
  key: string;
  /** Its name, in the segment's title and the bar's label. */
  label: string;
  /** Of the whole, 0 to 1. */
  share: number;
  /** A CSS colour. */
  colour: string;
}

const GAP = 3;
const MIN_WIDTH = 4;
const RADIUS = 4;

/** A share to one place, "<0.1%" and ">99.9%" at the ends. */
const pct = (x: number) =>
  x < 0.0005
    ? "<0.1%"
    : x > 0.9995 && x < 1
      ? ">99.9%"
      : `${(x * 100).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** A key as a CSS string's content. */
const cssString = (s: string) => s.replace(/["\\]/g, "\\$&");

export function SegmentBar({
  slices,
  label,
  height = 16,
  scope,
}: {
  slices: SegmentSlice[];
  /** The bar's accessible name, before its slices ("Holders by share"). */
  label: string;
  height?: number;
  /** The `data-seg-scope` its legend sits under, to light a segment and its row together. */
  scope?: string;
}) {
  const drawn = slices.filter((s) => s.share > 0);
  if (drawn.length === 0) return null;
  const total = drawn.reduce((t, s) => t + s.share, 0);
  const largest = drawn.reduce((b, s, i) => (s.share > drawn[b].share ? i : b), 0);
  const gaps = GAP * (drawn.length - 1);
  const named = drawn.map((s) => `${s.label} ${pct(s.share / total)}`);
  const sc = scope ? cssString(scope) : null;
  const css = sc
    ? drawn
        .map((s) => {
          const k = cssString(s.key);
          return `[data-seg-scope="${sc}"]:has([data-seg="${k}"]:is(:hover,:focus-within)) [data-seg]:not([data-seg="${k}"]){opacity:.35}`;
        })
        .join("")
    : "";
  return (
    <>
      {css && <style>{css}</style>}
      <div
        role="img"
        aria-label={`${label}: ${named.join(", ")}`}
        className="flex w-full"
        style={{ gap: GAP, height }}
        data-segment-bar=""
      >
        {drawn.map((s, i) => {
          // Four places: a hundredth of a pixel on any tile this page draws.
          const f = Math.round((s.share / total) * 10_000) / 10_000;
          const size =
            i === largest
              ? { flex: "1 1 0", minWidth: MIN_WIDTH }
              : { flex: "none", width: `max(${MIN_WIDTH}px, calc((100% - ${gaps}px) * ${f}))` };
          return (
            <span
              key={s.key}
              title={named[i]}
              aria-label={named[i]}
              className="block h-full transition-opacity duration-200"
              style={{ ...size, background: s.colour, borderRadius: RADIUS }}
              data-seg={s.key}
            />
          );
        })}
      </div>
    </>
  );
}
