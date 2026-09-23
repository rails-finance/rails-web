"use client";

import { fmtPrice } from "@/components/shared/price-pill";

/**
 * Liquidation runway — one shared bar for every rail and every collateral shape
 * (a Liquity V2 trove, an Aave V4 single-asset reserve, an Aave V4 multi-asset
 * basket). It answers "how close is this to liquidation?" at a glance, and the
 * answer reads the same way no matter the protocol or the number of assets.
 *
 * THE UNIFYING IDEA: the bar's horizontal axis *is* the "% from liquidation"
 * metric itself — `m = (value − liq) / value` — not a price window with a number
 * painted on top. That one choice makes the three cases collapse into one:
 *
 *   • Single asset (Liquity trove, Aave single reserve) → value = live price,
 *     liq = liquidation price. `m` is the % the price can fall before liquidation.
 *   • Multi-asset basket (Aave) → value = health factor, liq = HF 1.0. Here
 *     `m = (HF − 1) / HF`, which is the % the collateral basket can fall before
 *     liquidation (HF moves with collateral, so HF→1 happens when collateral has
 *     fallen that much).
 *
 * For a single asset these are *mathematically identical*: `(price − liq)/price`
 * ≡ `(HF − 1)/HF`. So all three are the same risk quantity, and a marker at the
 * same spot means the same risk whether it's one asset or five. The only thing
 * that changes per protocol is the threshold *caption* (a real liquidation price
 * when there's a single asset; `HF 1.0` for a basket) — honest, not a fudge.
 *
 * Because the axis is the metric, the live-price marker, the ruler ticks and the
 * caption number are all the same scale — they physically cannot disagree, with
 * no clever window-fitting. Layout, from right to left:
 *   • **Liquidation line** — `m = 0`, at a FIXED position on every row (so rows
 *     stay comparable). Red liquidation zone runs from it to the right edge,
 *     covering a little way underwater (`AXIS_MIN_PCT`).
 *   • **Headroom** — neutral, from the live marker to the liquidation line: the
 *     distance the value can still fall. Zero once at / inside the zone.
 *   • **Collateral fill** — collateral-blue, from the left edge to the marker;
 *     its rounded cap is the live marker. The value/price is labelled alongside
 *     the bar, never on it.
 *   • **Ruler** — a "% from liquidation" axis: a gridline every 10%, labelled
 *     0–50% (`RULER_MAX_PCT`), evenly spaced, climbing leftward into the safe
 *     runway; the scale itself keeps running to `AXIS_MAX_PCT` past the last
 *     label, so a very safe position sits far left exactly where its % lands.
 *     Brightest at the liquidation line and fading as the runway lengthens.
 *     Revealed only on hover, and only on hover-capable (desktop) pointers —
 *     touch / mobile never shows it, so the resting readouts can't be crowded.
 *     The reveal waits a beat then fades up slowly.
 *
 * Underwater (value at / below the liquidation line, `m ≤ 0`) the runway is
 * spent, so the whole bar flips to the factual-liquidation red: lighter red for
 * the now-out-of-reach values above the line, the deep-red breach from the line
 * to the live marker, lighter red for any downside below it. The readouts drop
 * the headroom ruler and state "Liquidatable now" plus the rise needed to clear
 * the line (`recoverPct`, denominated in the live value).
 *
 * No safe/caution gradient (per the no-opinionated-colour principle): blue is a
 * structural collateral cue, red is the one factual liquidation colour, and the
 * numbers around the bar state the rest. Read-only — current oracle / chain state.
 */

// The bar is built from distinct rounded segments laid directly on the card
// surface — not painted inside a recessed track (which read as the bars sinking
// into a dark well in dark mode). Three segments, separated by hairline gaps:
//   • FILL     — collateral-blue, left edge → live marker. Same structural
//                collateral colour as the tower chart: identity, not risk
//                valence (red stays the only valence colour).
//   • HEADROOM — neutral, live marker → liquidation line (how far it can fall).
//   • LIQ      — red liquidation zone, beyond the liquidation line.
// At this bar height every segment is fully pill-capped (`rounded-full`) on all
// four corners — a 10px-tall segment reads as rounded either way. The hairline
// gaps still draw the seams between segments.
//
// ⇒ The segment tokens are EXPORTED because one explorer draws its own bar
// rather than this one: LlamaLend's liquidation band is a two-price range, not
// a line, so it cannot be plotted on the "% from liquidation" axis below — but
// it must still read as the same object on the card. It builds its bar from
// these exact fills, height and gap, so the two can only drift by editing here.
// Anything else wanting a runway should use <PriceRunway compact>, not these.
export const RUNWAY_SEG = {
  /** Collateral fill — structural collateral blue, left edge → live marker. */
  fill: "bg-blue-500",
  // Headroom is neutral but must stay legible on the dark card: rb-500 (the
  // brand blue-grey) at low alpha lifts it to a clear but subordinate neutral
  // that doesn't compete with the blue fill (plain rb-700 sat too close to the
  // surface).
  /** Headroom — the neutral distance the value can still fall. */
  headroom: "bg-rb-200 dark:bg-rb-500/30",
  /** The liquidation zone, beyond the threshold. */
  liq: "bg-red-400/60 dark:bg-red-500/40",
  /** Compact bar height in px — a stat-line accent, not a section. */
  hCompact: 6,
  /** Hairline gap between adjacent segments. */
  gapPx: 1,
} as const;

const FILL = RUNWAY_SEG.fill;
const HEADROOM = RUNWAY_SEG.headroom;
const LIQ = RUNWAY_SEG.liq;
const LIQ_ACTIVE = "bg-red-500 dark:bg-red-500";
const H_BAR = 10; // bar height in px (h-2.5)
const SEG_GAP_PX = RUNWAY_SEG.gapPx;

// Axis bounds, in "% from liquidation" units (the metric the bar plots directly).
//   • Left edge = AXIS_MAX_PCT: the deep-safety end. `m` asymptotes at 100% (the
//     value can never fall *more* than 100%), so 100 is the natural cap — a
//     position that safe sits hard against the left edge.
//   • Right edge = AXIS_MIN_PCT: a little way underwater, so the red liquidation
//     zone has width and a freshly-liquidated position still shows its breach.
// The liquidation line (m = 0) therefore lands at AXIS_MAX_PCT / span of the way
// across — the SAME spot on every row, which is what keeps the rails comparable.
const AXIS_MAX_PCT = 100; // left edge — deepest safety the axis draws
const AXIS_MIN_PCT = -25; // right edge — 25% underwater, the red-zone floor
// Compact form trims the underwater tail: at a fraction of the width the red
// zone only needs to read as "the cliff at the end", not chart the breach.
const AXIS_MIN_PCT_COMPACT = -10;
const H_BAR_COMPACT = RUNWAY_SEG.hCompact;
const RULER_MAX_PCT = 50; // last labelled increment (the scale runs past it to AXIS_MAX_PCT)
const RULER_FADE_DENOM = 60; // opacity = 1 − pct/denom; >MAX so 50% stays faintly visible

export interface PriceRunwayProps {
  /** The live value being tracked: a collateral price (single asset) or a health
   *  factor (multi-asset basket). Named `currentPrice` for the common case. */
  currentPrice: number;
  /** The value at which the position liquidates: the liquidation price, or `1`
   *  for a health-factor runway. Null when there's no debt — nothing to plot. */
  liqPrice: number | null;
  /** Overrides the right-side caption when safe (default `liquidation $<price>`).
   *  Lets a non-price axis (e.g. an Aave health-factor runway, where the value
   *  is HF and the line is HF 1.0) label the threshold in its own units. */
  liqCaption?: React.ReactNode;
  /** Overrides the right-side caption when underwater (default
   *  `recovers at $<price> (+N%)`). */
  underwaterCaption?: React.ReactNode;
  /** Single-line shorthand: the "% from liquidation" figure with a short inline
   *  bar beside it — no ruler, no threshold caption (the host card's headline
   *  stats carry the liquidation price). For a runway sharing a stat line
   *  rather than owning a full-width section. */
  compact?: boolean;
}

export function PriceRunway({ currentPrice, liqPrice, liqCaption, underwaterCaption, compact }: PriceRunwayProps) {
  const hasLiq = liqPrice != null && liqPrice > 0;
  if (!hasLiq) return null; // no debt / fully covered — nothing to plot

  // The axis IS the "% from liquidation" scale — `m = (value − liq) / value` —
  // so a value maps straight onto the bar. m = 0 is the liquidation line; m > 0
  // is safe runway (climbing left); m < 0 is underwater (to the right). Because
  // the marker, the ruler and the caption all read off this one scale, they can't
  // disagree — for a collateral price or a health factor alike (`(p − liq)/p` ≡
  // `(HF − 1)/HF`).
  const AXIS_SPAN = AXIS_MAX_PCT - (compact ? AXIS_MIN_PCT_COMPACT : AXIS_MIN_PCT);
  const posFromPct = (m: number) => Math.max(0, Math.min(100, ((AXIS_MAX_PCT - m) / AXIS_SPAN) * 100));

  const mPct = ((currentPrice - liqPrice!) / currentPrice) * 100; // signed % from liquidation
  const underwater = currentPrice <= liqPrice!;
  const liqPos = posFromPct(0); // liquidation line — constant across every row
  const markerPos = posFromPct(mPct); // live marker — left of liqPos when safe, right when underwater

  const pctFromLiq = Math.round(mPct);
  // Once underwater the runway is spent — the only figure that matters is how far
  // the value must RISE to clear liquidation, denominated in the live value.
  const recoverPct = underwater ? Math.round(((liqPrice! - currentPrice) / currentPrice) * 100) : 0;

  // Safe-side segment extents (% from left). Blue runs from the left edge to the
  // marker; headroom is the gap from the marker to the liquidation line (zero once
  // at / inside the zone); red runs from the line to the right edge.
  const fillEnd = Math.min(markerPos, liqPos);
  const headroomW = Math.max(0, liqPos - fillEnd);

  // Ruler ticks, evenly spaced because the axis is the metric: a gridline every
  // 10% from 0% (the liquidation line) up to RULER_MAX_PCT, climbing leftward.
  // Brightest at the liquidation line and fading as the runway lengthens.
  const rulerTicks = [];
  for (let n = 0; n <= RULER_MAX_PCT; n += 10) {
    rulerTicks.push({
      pct: n,
      pos: posFromPct(n),
      opacity: Math.max(0, 1 - n / RULER_FADE_DENOM),
    });
  }

  // Ruler reveal: hidden at rest; fades up after a short delay over a slow
  // duration, but only on hover-capable pointers AND wide enough viewports — the
  // `(hover: hover)` gate keeps it off touch / mobile, and the `min-width` gate
  // keeps the labels from colliding with the readouts on narrow runways.
  const REVEAL =
    "opacity-0 transition-opacity duration-500 [@media(hover:hover)_and_(min-width:1024px)]:group-hover/runway:opacity-100 [@media(hover:hover)_and_(min-width:1024px)]:group-hover/runway:delay-200";

  // Flow segments laid side-by-side: each is a flex child grown by its share
  // of the % axis, the flex gap drawing the hairline seams. Widths are
  // proportional, not pixel-exact — close enough to read. Shared by the
  // full-width and compact layouts.
  const segments = underwater ? (
    // Underwater: the runway is gone, so the whole bar reads in the
    // factual-liquidation red (the one sanctioned colour). The hairline
    // seam at the liquidation line keeps the breach legible: values above
    // the line — now out of reach — sit in lighter red on the left; the
    // deep-red breach runs from the line to the live marker (its rounded
    // cap), with any remaining downside trailing in lighter red.
    <>
      {liqPos > 0 && <div className={`${LIQ} rounded-full`} style={{ flexGrow: liqPos, flexBasis: 0 }} />}
      <div
        className={`${LIQ_ACTIVE} rounded-full`}
        style={{ flexGrow: Math.max(0.5, markerPos - liqPos), flexBasis: 0 }}
      />
      {markerPos < 100 && <div className={`${LIQ} rounded-full`} style={{ flexGrow: 100 - markerPos, flexBasis: 0 }} />}
    </>
  ) : (
    <>
      {/* Collateral fill — left edge → live marker. Its rounded right cap
          is the live marker. */}
      {fillEnd > 0 && <div className={`${FILL} rounded-full`} style={{ flexGrow: fillEnd, flexBasis: 0 }} />}
      {/* Headroom — live marker → liquidation line. The neutral distance the
          value can still fall; absent once at / inside the zone. */}
      {headroomW > 0 && <div className={`${HEADROOM} rounded-full`} style={{ flexGrow: headroomW, flexBasis: 0 }} />}
      {/* Liquidation zone — from the liquidation line to the right edge. */}
      <div className={`${LIQ} rounded-full`} style={{ flexGrow: 100 - liqPos, flexBasis: 0 }} />
    </>
  );

  if (compact) {
    // Shorthand: figure first — it's the message — with the bar as its visual
    // echo filling whatever line-length the host grants. No ruler, no
    // threshold caption; underwater collapses to the factual state.
    return (
      <div className="flex w-full items-center gap-2.5">
        <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-rb-500">
          {underwater ? (
            <span className="font-semibold text-red-600 dark:text-red-400">Liquidatable now</span>
          ) : (
            <>{pctFromLiq}% from liquidation</>
          )}
        </span>
        <div className="min-w-24 flex-1" style={{ height: H_BAR_COMPACT }}>
          <div className="flex h-full" style={{ gap: SEG_GAP_PX }}>
            {segments}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group/runway relative" style={{ paddingTop: 6 }}>
      <div className="flex" style={{ height: H_BAR, gap: SEG_GAP_PX }}>
        {segments}
      </div>

      {/* Label strip: the resting "% from liquidation" + threshold readouts stay
          put; on hover (desktop) the faded % ruler reveals across the same row. */}
      <div className="relative mt-2 h-4 text-[11px] tabular-nums text-rb-500">
        {underwater ? (
          // Past the liquidation line the "% from liquidation" ruler is
          // meaningless — replace it with the factual state and the rise the
          // value needs to clear the line.
          <>
            <span className="absolute left-0 font-semibold text-red-600 dark:text-red-400">Liquidatable now</span>
            <span className="absolute right-0">
              {underwaterCaption ?? (
                <>
                  recovers at {fmtPrice(liqPrice!)} (+{recoverPct}%)
                </>
              )}
            </span>
          </>
        ) : (
          <>
            <span className="absolute left-0">{pctFromLiq}% from liquidation</span>
            <span className="absolute right-0">{liqCaption ?? <>liquidation {fmtPrice(liqPrice!)}</>}</span>
            {/* Ruler ticks are the gauge's scale, not stats — exempt from the
                dev provenance-coverage tripwire. */}
            <div className={`pointer-events-none absolute inset-0 ${REVEAL}`} data-prov-exempt="">
              {rulerTicks.map((t) => (
                <span
                  key={t.pct}
                  className="absolute -translate-x-1/2"
                  style={{ left: `${t.pos}%`, opacity: t.opacity }}
                >
                  {t.pct}%
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
