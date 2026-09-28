"use client";

// Dust reserves: one rule and one control for every surface that lists a
// position's per-asset lines — the opened event card's position block (T2,
// rails-ops TO-DO-ui-jobs §52) and the position cards (T1) of every family
// whose card lists them.
//
// RULE: a line whose priced USD value is under a cent is dust. A line with no
// price is held, not dust. Dust lines sit behind an "N dust reserves hidden"
// control; opening it shows them in place. On a position card, a side whose
// lines are all dust shows them all and no control, so the side never reads
// as empty. The headline USD total keeps dust in; only the lines, the icon
// stack and its "+N" leave it out.

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { provInspector } from "@/components/shared/provenance";

/** Under this many dollars a priced line is dust. */
export const DUST_USD = 0.01;

/** Priced and under a cent. `null`/`undefined` is an unpriced line: held. */
export const isDustUsd = (usd: number | null | undefined): boolean => usd != null && usd < DUST_USD;

/** A side's lines split into those shown by default and the dust behind the
 *  control. Where every line is dust, all of them are shown and none is
 *  hidden. Order is kept. */
export function splitDust<T>(
  items: readonly T[],
  usdOf: (item: T) => number | null | undefined,
): { shown: T[]; dust: T[] } {
  const dust = items.filter((i) => isDustUsd(usdOf(i)));
  if (dust.length === 0 || dust.length === items.length) return { shown: [...items], dust: [] };
  return { shown: items.filter((i) => !isDustUsd(usdOf(i))), dust };
}

/** Whether dust lines are showing: the reader's toggle, or the provenance
 *  inspector armed, which opens them so an armed click can reach a dust
 *  figure (the same rule `useReserveDisclosure` follows). */
export function useDustOpen(): { open: boolean; toggle: () => void } {
  const [open, setOpen] = useState(false);
  const armed = useSyncExternalStore(provInspector.subscribe, provInspector.getArmed, () => false);
  return { open: open || armed, toggle: () => setOpen((o) => !o) };
}

/** The dotted-underline "N dust reserves hidden" / "Hide dust" control. */
export function DustToggle({ count, open, onToggle }: { count: number; open: boolean; onToggle: () => void }) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      className="self-start text-left text-xs text-rb-500 underline decoration-dotted underline-offset-2 hover:text-rb-700"
      data-dust-hidden={count}
      aria-expanded={open}
      onClick={onToggle}
    >
      {open ? "Hide dust" : `${count} dust reserve${count === 1 ? "" : "s"} hidden`}
    </button>
  );
}

/** A position card side's lines under the dust rule: `lines` is what to
 *  render (every line once the control is open), `control` the toggle, null
 *  where nothing is hidden. */
export function useDustLines<T>(
  items: readonly T[],
  usdOf: (item: T) => number | null | undefined,
): { lines: T[]; control: ReactNode } {
  const { open, toggle } = useDustOpen();
  const { shown, dust } = splitDust(items, usdOf);
  return {
    lines: open ? [...items] : shown,
    control: dust.length > 0 ? <DustToggle count={dust.length} open={open} onToggle={toggle} /> : null,
  };
}
