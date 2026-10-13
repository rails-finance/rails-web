"use client";

// A level that swaps to its change (rails-ops TO-DO-ui-jobs 330): the value is
// a dotted-underlined button; a click shows its change since the previous
// event in its place ("▼ 3.24 pts", in blue), a second click shows the level
// again. With no change to show it is the level alone, with no control. Both
// faces keep their receipts. The event card's Risk and Limits panels draw it;
// 321's spine reads it later.

import { useState, type ReactNode } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";

/** A figure on one face: as the family formats it, with its receipt. */
export interface SwapFigure {
  text: ReactNode;
  info?: Provenance;
  /** The exact value the receipt keys on. */
  value?: string;
}

const Face = ({ f }: { f: SwapFigure }) =>
  f.info ? (
    <Prov info={f.info} value={f.value}>
      {f.text}
    </Prov>
  ) : (
    <>{f.text}</>
  );

export function ChangeSwapValue({
  level,
  change,
  name,
  className = "",
}: {
  level: SwapFigure;
  /** The change since the previous event; unset, the level stands alone. */
  change?: SwapFigure | null;
  /** What the value is ("Health factor"): the button's accessible name. */
  name: string;
  /** The level's tone. */
  className?: string;
}) {
  const [swapped, setSwapped] = useState(false);
  if (!change)
    return (
      <span className={`tabular-nums ${className}`} data-swap-value="level">
        <Face f={level} />
      </span>
    );
  return (
    <button
      type="button"
      aria-pressed={swapped}
      aria-label={
        swapped
          ? `${name}: change since the previous event; show the level`
          : `${name}: show the change since the previous event`
      }
      data-swap-value={swapped ? "change" : "level"}
      onClick={(e) => {
        e.stopPropagation();
        setSwapped((v) => !v);
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={`cursor-pointer rounded-sm border-b border-dotted border-rb-400 tabular-nums leading-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-rb-500 ${
        swapped ? "text-blue-600 dark:text-blue-300" : className
      }`}
    >
      <Face f={swapped ? change : level} />
    </button>
  );
}

/** "▲ 0.19", "▼ 3.24 pts", "▲ $1,722": a change's arrow and magnitude;
 *  "No change" where it rounds to nothing at the precision shown. */
export function changeText(diff: number, fmt: (abs: number) => string): string {
  const shown = fmt(Math.abs(diff));
  if (!/[1-9]/.test(shown)) return "No change";
  return `${diff > 0 ? "▲" : "▼"} ${shown}`;
}
