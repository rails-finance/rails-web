"use client";

// Interest-rate pills — the small lozenge that carries a trove's annual rate on
// an event header. Two treatments: an individual (owner-set) rate in a muted
// rb-500 tint, and a delegate (batch-manager-set) rate in party-pink with the
// people glyph. Extracted from the Liquity V2 header so the two Liquity forks
// render the identical pill through the chain-state row's rate-pill seam — the
// pill asserts THE POSITION HOLDER (or a delegate acting for them) CHOSE this
// rate, so it belongs only where a user sets a rate, never on a utilization
// rate.
//
// The SHELLS carry the visual; the shared row (ChainTruthRow) puts the rate's
// <Prov echo> inside them, so the pill pulses with the detail grid's rate
// receipt.

import type { ReactNode } from "react";

/** Small "people" glyph inside the pink delegate / batch rate pills, and reused
 *  as the event-filter suffix that marks a delegate-set "Interest rate" row
 *  apart from the owner's own. Stroke is currentColor so it inherits the
 *  surrounding text colour (pink in the pill, muted in the filter menu). */
export function UsersGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

/** Visual shell for an individual (owner-set) rate pill — muted rb-500 tint,
 *  mirroring the visual weight of the pink delegate pill. */
export function RatePillShell({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rb-500/15 text-foreground">
      {children}
    </span>
  );
}

/** Visual shell for a delegate (batch-manager-set) rate pill — pink with the
 *  people glyph (pink = external party, color-grammar.md §5). */
export function DelegateRatePillShell({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-700 dark:text-pink-400 text-xs font-bold">
      <UsersGlyph />
      {children}
    </span>
  );
}
