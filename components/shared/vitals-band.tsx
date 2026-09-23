"use client";

// The vitals band — the one summary treatment every protocol view surface uses
// for its glanceable head figures.
//
// The audit that produced this found the same handful of figures on nine of
// thirteen view pages, rendered two different ways for no reason but the order
// the pages were built in: a boxed `bg-raised` card with `text-base
// font-semibold` on the Aave-family surfaces, and an 11px inline text run on
// every bespoke page. Same class of figure, two visual weights. This is the
// single treatment; the 11px run survives only for *qualifications* (the
// `notes` slot below), which is what it was always good at.
//
// Two rules keep a shared band from lying about protocols it wasn't designed
// around:
//
//  1. **The slot is fixed; the label is the protocol's own.** A reader learns
//     the positions once — roster · size in · size out · usage · population —
//     and reads every subsequent protocol in the same sweep. But the *word* in
//     each slot is whatever that protocol actually calls the thing ("Reserves",
//     "Vaults minted", "Branches", "Pools registered"). This matters most at
//     `usage`: the surfaces that today all say "utilisation" are measuring
//     three different denominators — borrowed ÷ supplied (Aave, Compound V2,
//     Moonwell), borrow ÷ (collateral × liquidation price) (Fluid), liquid ÷
//     total assets (Maple). One shared *name* there would be a false
//     equivalence, so `usage` requires a `title` stating its actual quotient.
//
//  2. **The value carries its unit; the band never assumes a numeraire.** Six
//     of the thirteen surfaces have no USD at all — Fluid runs no price feed,
//     Morpho/Maple/LlamaLend/Frankencoin quote in their own asset, Compound V3
//     has both USD and ETH markets. A "Supplied $" row would invent a currency
//     on nearly half the roster. Callers pass an already-formatted value with
//     its unit in it, and a protocol with no common size axis simply omits the
//     size slots rather than manufacturing one.
//
// Slots render in the canonical order regardless of the order the caller lists
// them, so position is a property of the band rather than of each call site's
// memory.

import type { ReactNode } from "react";

/** The canonical slots, in the order they always render. */
const SLOT_ORDER = ["roster", "sizeIn", "sizeOut", "usage", "population"] as const;

export type VitalSlot = (typeof SLOT_ORDER)[number];

/** One head figure.
 *
 *  `label` is the protocol's own name for it, `value` is already formatted and
 *  already carries its unit (the band adds no currency of its own).
 *
 *  `usage` requires `title` — see rule 1 above: the slot is shared, the
 *  quotient is not, so a usage figure must state which quotient it is. */
export type Vital =
  | {
      slot: Exclude<VitalSlot, "usage">;
      label: string;
      value: ReactNode;
      /** Hover text — the exact figure, the cap, whatever the number elides. */
      title?: string;
    }
  | {
      slot: "usage";
      label: string;
      value: ReactNode;
      /** Required: which quotient this is. "Borrowed ÷ supplied, both in USD
       *  at the market's own oracle price." */
      title: string;
    };

export interface VitalsBandProps {
  /** The figures. Falsy entries are dropped, so a caller can list a slot
   *  conditionally without assembling the array by hand. */
  vitals: (Vital | false | null | undefined)[];
  /** Optional identity column — name, one-line purpose, prose summary. */
  lead?: ReactNode;
  /** Optional third column — a composition chart, a link out to the listing. */
  aside?: ReactNode;
  /** Qualifications that are not vitals: "3 minted but never configured", "2
   *  closed to new borrowing". Kept at 11px under a rule, because they are
   *  read second and only by someone already asking. */
  notes?: ReactNode;
  className?: string;
}

const LABEL = "text-[11px] uppercase tracking-wider text-rb-500";
const VALUE = "tabular-nums text-base font-semibold text-foreground";

export function VitalsBand({ vitals, lead, aside, notes, className }: VitalsBandProps) {
  const present = vitals.filter((v): v is Vital => Boolean(v));
  // One figure per slot, in canonical order. A slot listed twice keeps the
  // first — the slots are the band's vocabulary, so a second figure claiming
  // one is a call-site mistake, and rendering both would put two children
  // under the same React key as well as breaking the shared reading order.
  const ordered = SLOT_ORDER.map((slot) => present.find((v) => v.slot === slot)).filter(
    (v): v is Vital => v !== undefined,
  );
  const columns = Boolean(lead) || Boolean(aside);

  const figures = ordered.map((v) => (
    <div key={v.slot}>
      <dt className={LABEL}>{v.label}</dt>
      <dd className={VALUE} title={v.title}>
        {v.value}
      </dd>
    </div>
  ));

  return (
    <div className={`rounded-lg bg-raised p-5 ${className ?? ""}`}>
      {columns ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {lead ? <div>{lead}</div> : null}
          {/* Wraps rather than sitting on a fixed column count, so a protocol
              with four vitals and one with two both read straight. */}
          <dl className="flex flex-wrap gap-x-8 gap-y-3 md:flex-col md:gap-4">{figures}</dl>
          {aside ? <div className="flex flex-col">{aside}</div> : null}
        </div>
      ) : (
        // No identity or chart column: the figures are the band, so they run
        // across it rather than stacking in a third of the width.
        <dl className="flex flex-wrap gap-x-10 gap-y-4">{figures}</dl>
      )}

      {notes ? (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-foreground/5 pt-3 text-[11px] tabular-nums text-rb-500">
          {notes}
        </div>
      ) : null}
    </div>
  );
}
