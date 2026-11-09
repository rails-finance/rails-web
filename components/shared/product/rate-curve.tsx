"use client";

// The reserve page's rate curve (anatomy M3.3, ui-jobs 541 and 549): the
// borrow rate and the supply rate against utilisation from 0 to 100%, on two
// slopes or on LlamaLend's semi-log curve, the kink marked where the model has one, and the reserve's point now, fed by value
// (`RateCurveModel`): the two-slope constants, the reserve factor and where the reserve sits. The
// supply curve is borrow × U × (1 − reserve factor). The curve's receipt sits
// on the caption's "Now" line. Drawn in measured pixels so its type stays
// legible at 375px. Neutral strokes: two series, no valence (color-grammar §1).

import { useLayoutEffect, useRef, useState } from "react";
import { Prov } from "@/components/shared/provenance";
import { ratePercentText } from "@/lib/shared/rate-percent";
import { isMissing, type Missing, type RateCurveModel } from "@/lib/shared/product/model";

const H = 240;
/** The rate axis stops at 100% a year; a curve that climbs past it (a jump
 *  multiplier in the thousands of percent) leaves the chart, and the caption
 *  states where it ends (Miles, 9 Nov 2026). */
const RATE_CAP = 1;
const wholePercent = (v: number) => `${Math.round(v * 100).toLocaleString("en-US")}%`;
const PAD = { l: 44, r: 12, t: 12, b: 28 };

/** The borrow rate at utilisation `u` on the two-slope curve. */
export function borrowRateAt(
  u: number,
  c: { optimal: number; base: number; slope1: number; slope2: number; semilog?: { min: number; max: number } },
): number {
  if (c.semilog) return c.semilog.min > 0 ? c.semilog.min * (c.semilog.max / c.semilog.min) ** u : c.semilog.max * u;
  if (u <= c.optimal) return c.base + (c.optimal > 0 ? (c.slope1 * u) / c.optimal : 0);
  return c.base + c.slope1 + (c.optimal < 1 ? (c.slope2 * (u - c.optimal)) / (1 - c.optimal) : 0);
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** A tidy upper bound for the rate axis and its ticks. */
function rateAxis(max: number): number[] {
  const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5];
  const step = steps.find((s) => max / s <= 5) ?? 10;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return ticks;
}

export function RateCurve({ curve }: { curve: RateCurveModel | Missing }) {
  const [box, width] = useWidth<HTMLDivElement>();
  if (isMissing(curve))
    return (
      <p className="text-[13px] text-rb-500" data-rate-curve-missing="">
        {curve.missing}
      </p>
    );
  const c = curve;
  const rf = c.reserveFactor;
  const supplyAt = (u: number) => borrowRateAt(u, c) * u * (1 + (c.premium ?? 0)) * (1 - rf);
  const u = c.now.utilisation != null ? Math.min(1, c.now.utilisation) : null;
  const peak = borrowRateAt(1, c);
  const top = Math.max(Math.min(peak, RATE_CAP), c.now.borrow, 0.0001);
  const ticks = rateAxis(top);
  const yMax = ticks[ticks.length - 1];
  // Off the chart only where the axis stops short of the peak: a point now
  // above the cap lifts the axis to it.
  const offScale = peak > yMax + 1e-9;

  const W = Math.max(width, 280);
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (f: number) => PAD.l + f * iw;
  const y = (v: number) => PAD.t + ih - (v / yMax) * ih;
  const N = 100;
  const line = (f: (u: number) => number) =>
    Array.from({ length: N + 1 }, (_, i) => {
      const uu = i / N;
      return `${i === 0 ? "M" : "L"}${x(uu).toFixed(1)},${y(f(uu)).toFixed(1)}`;
    }).join(" ");
  const borrowPath = line((uu) => borrowRateAt(uu, c));
  const supplyPath = line(supplyAt);
  const axisText = "fill-rb-500 text-[11px]";
  const clipId = `rate-curve-plot-${c.symbol.replace(/[^A-Za-z0-9]/g, "")}`;

  return (
    <figure data-rate-curve="" data-kink={c.optimal} data-now-u={u ?? ""} className="m-0">
      <div ref={box} className="w-full">
        {width > 0 && (
          <svg
            width={W}
            height={H}
            role="img"
            aria-label={`${c.symbol} borrow and supply rate against utilisation${c.noKink ? "" : `; ${c.kinkLabel ?? "kink"} at ${Math.round(c.optimal * 100)}%`}${u != null ? `, now at ${Math.round(u * 100)}%` : ""}`}
            className="block text-foreground"
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-rb-200 dark:stroke-rb-700" />
                <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className={axisText}>
                  {`${+(t * 100).toFixed(2)}%`}
                </text>
              </g>
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <text
                key={f}
                x={x(f)}
                y={H - 8}
                textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}
                className={axisText}
              >
                {`${f * 100}%`}
              </text>
            ))}
            {/* The kink, where the model has one. */}
            {!c.noKink && (
              <>
                <line
                  x1={x(c.optimal)}
                  x2={x(c.optimal)}
                  y1={PAD.t}
                  y2={PAD.t + ih}
                  strokeDasharray="3 3"
                  className="stroke-rb-400 dark:stroke-rb-500"
                  data-kink-line=""
                />
                <text
                  x={c.optimal > 0.7 ? x(c.optimal) - 4 : x(c.optimal) + 4}
                  y={PAD.t + 10}
                  textAnchor={c.optimal > 0.7 ? "end" : "start"}
                  className={axisText}
                >
                  {`${c.kinkLabel ?? "kink"} ${+(c.optimal * 100).toFixed(2)}%`}
                </text>
              </>
            )}
            <clipPath id={clipId}>
              <rect x={PAD.l} y={PAD.t - 2} width={iw} height={ih + 2} />
            </clipPath>
            <g clipPath={`url(#${clipId})`}>
              <path d={supplyPath} fill="none" strokeWidth={1.5} strokeDasharray="5 3" className="stroke-rb-500" />
              <path d={borrowPath} fill="none" strokeWidth={2} className="stroke-current" />
            </g>
            {u != null && (
              <g data-now="">
                <line
                  x1={x(u)}
                  x2={x(u)}
                  y1={PAD.t}
                  y2={PAD.t + ih}
                  className="stroke-foreground/30"
                  data-now-line=""
                />
                <circle cx={x(u)} cy={y(c.now.borrow)} r={4} className="fill-current" data-now-borrow="" />
                <circle
                  cx={x(u)}
                  cy={y(c.now.supply)}
                  r={4}
                  className="fill-background stroke-rb-500"
                  strokeWidth={2}
                  data-now-supply=""
                />
              </g>
            )}
          </svg>
        )}
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-rb-500">
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden className="text-foreground">
            <line x1="0" x2="18" y1="3" y2="3" strokeWidth="2" className="stroke-current" />
          </svg>
          Borrow rate
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line x1="0" x2="18" y1="3" y2="3" strokeWidth="1.5" strokeDasharray="5 3" className="stroke-rb-500" />
          </svg>
          Supply rate
        </span>
        {offScale && (
          <span data-curve-offscale="">
            The borrow rate leaves the chart above {wholePercent(yMax)} and reaches {wholePercent(peak)} at 100%
            utilised.
          </span>
        )}
        <Prov info={c.receipt}>
          {u != null ? (
            <span data-now-caption="">
              Now: {Math.round(u * 100)}% utilised, borrow {ratePercentText(c.now.borrow)}, supply{" "}
              {ratePercentText(c.now.supply)}
            </span>
          ) : (
            <span>No utilisation: nothing is supplied to this reserve.</span>
          )}
        </Prov>
      </figcaption>
    </figure>
  );
}
