"use client";

/**
 * RangeControl — the panel body of a "range" dimension (./types): a two-handle
 * slider over the dimension's `range`, and Min / Max inputs under it.
 *
 * The slider steps through the 1-2-2.5-3-4-5 series (1, 2 … 9, 10, 12, 15, 20,
 * 25, 30, 40 … 1,000), so equal travel is roughly an equal ratio: a log scale
 * whose every stop is a round number. A handle resting at its end means no
 * bound on that side, so the control opens unset and hides nothing. The inputs
 * take any whole number, past the slider's top too, with a k / M / B suffix
 * if wanted ("50k"). A USD range (`range.usd`) writes its figures as dollars.
 *
 * Each handle is a native range input (arrow keys, Page Up / Down, Home / End),
 * the two laid over one track. A slider change is written after a short pause,
 * so a drag or a run of key presses costs one fetch; an input is written on
 * Enter or when it loses focus. Like the rest of the filter bar it holds no
 * filter state: it reads and writes the URL-backed param object through the
 * dimension.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type FilterDimension,
  type RangeBounds,
  type RangeSpec,
  decodeRange,
  encodeRange,
  formatRangeValue,
} from "@/components/shared/filter-bar/types";

const COMMIT_DELAY_MS = 350;
const MANTISSAS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9];

/** The slider's stops: whole numbers to 10, then the series above, both ends
 *  included. */
export function rangeStops(spec: RangeSpec): number[] {
  const lo = Math.max(0, Math.floor(spec.min));
  const hi = Math.max(lo + 1, Math.floor(spec.max));
  const out = new Set<number>([lo, hi]);
  for (let v = Math.max(lo, 1); v <= Math.min(hi, 10); v++) out.add(v);
  for (let decade = 10; decade <= hi; decade *= 10) {
    for (const m of MANTISSAS) {
      const v = Math.round(m * decade);
      if (v >= lo && v <= hi) out.add(v);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** First stop at or above v (a lower bound reaches no further than it says). */
function indexAtOrAbove(stops: number[], v: number): number {
  const i = stops.findIndex((s) => s >= v);
  return i === -1 ? stops.length - 1 : i;
}

/** Last stop at or below v. */
function indexAtOrBelow(stops: number[], v: number): number {
  for (let i = stops.length - 1; i >= 0; i--) if (stops[i] <= v) return i;
  return 0;
}

/** An input's text for a bound: exact, so leaving the field unedited never
 *  moves the bound. */
const textOf = (v: number | null, usd?: boolean) =>
  v == null ? "" : usd ? `$${v.toLocaleString("en-US")}` : String(v);

const SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

/** A typed bound: blank is no bound; a whole number, or a number with a k / M
 *  / B suffix ("1.5k"), is the bound; anything else is refused (undefined). A
 *  leading "$" and thousands commas are ignored. */
function parseBound(text: string): number | null | undefined {
  const t = text.replace(/[,\s$]/g, "");
  if (t === "") return null;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(\d+(?:\.\d+)?)([kmb])$/i.exec(t);
  return m ? Math.round(Number(m[1]) * SUFFIX[m[2].toLowerCase()]) : undefined;
}

const THUMB =
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-rb-500 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer " +
  "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-rb-500 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:cursor-pointer " +
  "[&:focus-visible::-webkit-slider-thumb]:ring-2 [&:focus-visible::-webkit-slider-thumb]:ring-blue-500 [&:focus-visible::-moz-range-thumb]:ring-2 [&:focus-visible::-moz-range-thumb]:ring-blue-500";
const SLIDER = `absolute inset-0 w-full h-full appearance-none bg-transparent pointer-events-none focus:outline-none [&::-moz-range-track]:bg-transparent ${THUMB}`;
const INPUT =
  "w-full h-7 px-2 rounded-md text-xs tabular-nums bg-transparent border border-rb-300 dark:border-rb-700 text-foreground placeholder:text-rb-500 focus:outline-none focus:ring-2 focus:ring-blue-500";

interface RangeControlProps<F> {
  dim: FilterDimension<F>;
  filters: F;
  onChange: (next: F) => void;
}

export function RangeControl<F>({ dim, filters, onChange }: RangeControlProps<F>) {
  const spec = dim.range ?? { min: 1, max: 1000 };
  const stops = useMemo(() => rangeStops(spec), [spec.min, spec.max]); // eslint-disable-line react-hooks/exhaustive-deps
  const last = stops.length - 1;
  const noun = dim.label.toLowerCase();
  const usd = spec.usd;
  const fmt = (v: number) => formatRangeValue(v, usd);

  const committedKey = dim.get(filters).join(",");
  const [draft, setDraft] = useState<RangeBounds>(() => decodeRange(dim.get(filters)));
  const [minText, setMinText] = useState(textOf(draft.min, usd));
  const [maxText, setMaxText] = useState(textOf(draft.max, usd));

  // A change from outside (a chip removed, Reset, the back button) replaces
  // the draft.
  useEffect(() => {
    const b = decodeRange(committedKey ? committedKey.split(",") : []);
    setDraft(b);
    setMinText(textOf(b.min, usd));
    setMaxText(textOf(b.max, usd));
  }, [committedKey]);

  // The write reads the newest filters, so a delayed commit never restores a
  // selection another control changed in the meantime.
  const latest = useRef({ dim, filters, onChange });
  latest.current = { dim, filters, onChange };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const commit = (b: RangeBounds) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const { dim: d, filters: f, onChange: write } = latest.current;
    const next = encodeRange(b);
    if (next.join(",") === d.get(f).join(",")) return;
    write(d.set(f, next));
  };
  const commitLater = (b: RangeBounds) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(b), COMMIT_DELAY_MS);
  };

  const minIdx = draft.min == null ? 0 : indexAtOrAbove(stops, draft.min);
  const maxIdx = draft.max == null ? last : indexAtOrBelow(stops, draft.max);

  const slide = (side: "min" | "max", idx: number) => {
    const b =
      side === "min"
        ? { ...draft, min: Math.min(idx, maxIdx) <= 0 ? null : stops[Math.min(idx, maxIdx)] }
        : { ...draft, max: Math.max(idx, minIdx) >= last ? null : stops[Math.max(idx, minIdx)] };
    setDraft(b);
    setMinText(textOf(b.min, usd));
    setMaxText(textOf(b.max, usd));
    commitLater(b);
  };

  const type = (side: "min" | "max") => {
    const parsed = parseBound(side === "min" ? minText : maxText);
    if (parsed === undefined) {
      setMinText(textOf(draft.min, usd));
      setMaxText(textOf(draft.max, usd));
      return;
    }
    let b: RangeBounds = side === "min" ? { ...draft, min: parsed } : { ...draft, max: parsed };
    if (b.min != null && b.max != null && b.min > b.max)
      b = side === "min" ? { ...b, max: b.min } : { ...b, min: b.max };
    setDraft(b);
    setMinText(textOf(b.min, usd));
    setMaxText(textOf(b.max, usd));
    commit(b);
  };

  const valueText = (side: "min" | "max", idx: number) =>
    side === "min"
      ? idx <= 0 && draft.min == null
        ? "No minimum"
        : fmt(draft.min ?? stops[idx])
      : idx >= last && draft.max == null
        ? "No maximum"
        : fmt(draft.max ?? stops[idx]);

  return (
    <div className="px-4 pt-2 pb-3 w-64 max-w-full" data-range-control={dim.id} data-anatomy="N1.5">
      <div className="relative h-6">
        <div className="absolute inset-x-2 top-1/2 h-1 -translate-y-1/2 rounded-full bg-rb-200 dark:bg-rb-700" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-rb-500"
          style={{
            // A thumb's centre runs from 8px to the width less 8px.
            left: `calc(${minIdx / last} * (100% - 16px) + 8px)`,
            right: `calc(${1 - maxIdx / last} * (100% - 16px) + 8px)`,
          }}
        />
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={minIdx}
          onChange={(e) => slide("min", Number(e.target.value))}
          aria-label={`Minimum ${noun}`}
          aria-valuetext={valueText("min", minIdx)}
          className={`${SLIDER} ${minIdx > last / 2 ? "z-[2]" : "z-[1]"}`}
        />
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={maxIdx}
          onChange={(e) => slide("max", Number(e.target.value))}
          aria-label={`Maximum ${noun}`}
          aria-valuetext={valueText("max", maxIdx)}
          className={`${SLIDER} ${minIdx > last / 2 ? "z-[1]" : "z-[2]"}`}
        />
      </div>
      <div className="flex justify-between text-[11px] text-rb-500 tabular-nums" aria-hidden="true">
        <span>{fmt(stops[0])}</span>
        <span>{fmt(stops[last])}+</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          inputMode={usd ? "text" : "numeric"}
          value={minText}
          placeholder="Min"
          aria-label={`Minimum ${noun}`}
          onChange={(e) => setMinText(e.target.value)}
          onBlur={() => type("min")}
          onKeyDown={(e) => {
            if (e.key === "Enter") type("min");
          }}
          className={INPUT}
        />
        <span className="text-xs text-rb-500" aria-hidden="true">
          –
        </span>
        <input
          type="text"
          inputMode={usd ? "text" : "numeric"}
          value={maxText}
          placeholder="Max"
          aria-label={`Maximum ${noun}`}
          onChange={(e) => setMaxText(e.target.value)}
          onBlur={() => type("max")}
          onKeyDown={(e) => {
            if (e.key === "Enter") type("max");
          }}
          className={INPUT}
        />
      </div>
    </div>
  );
}
