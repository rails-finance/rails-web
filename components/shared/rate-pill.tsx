"use client";

// Interest-rate pills — the small lozenge that carries a rate's figure on an
// event header or the spine's flank. Two treatments: an owner-set rate in a
// muted rb-500 tint, and a rate someone else set (a delegate or batch
// manager, or a market note's governance or formula) in party pink. A pill
// carries the figure alone; who set the rate is the badge in the spine node's
// corner (ui-jobs 408, `detail-page-anatomy.md`, "The spine").
//
// The SHELLS carry the visual; the shared row (ChainTruthRow) puts the rate's
// <Prov echo> inside them, so the pill pulses with the detail grid's rate
// receipt.

import type { ReactNode } from "react";

/** The person glyph (lucide `user`), one person: a third party acted. The spine node's
 *  third-party badge, and the event-filter suffix that marks a delegate-set
 *  "Interest rate" row apart from the owner's own. Stroke is currentColor. */
export function UserGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

/** The governance gavel (lucide `gavel`): the spine node's badge where
 *  governance set the figure for every holder at once (ui-jobs 403, 408).
 *  Stroke is currentColor. */
export function GavelGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m14.5 12.5-8 8a2.119 2.119 0 1 1-3-3l8-8" />
      <path d="m16 16 6-6" />
      <path d="m8 8 6-6" />
      <path d="m9 7 8 8" />
      <path d="m21 11-8-8" />
    </svg>
  );
}

/** Visual shell for an individual (owner-set) rate pill — muted rb-500 tint,
 *  mirroring the visual weight of the pink pill. */
export function RatePillShell({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rb-500/15 text-foreground">
      {children}
    </span>
  );
}

/** Visual shell for a rate someone other than the owner set — pink (pink =
 *  external party, color-grammar.md §4b): a delegate's or batch manager's
 *  rate, and a market note's. */
export function DelegateRatePillShell({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-700 dark:text-pink-400 text-xs font-bold">
      {children}
    </span>
  );
}
