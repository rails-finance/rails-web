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

/** The people glyph (lucide `users`): a third party acted. The spine node's
 *  third-party badge, and the event-filter suffix that marks a delegate-set
 *  "Interest rate" row apart from the owner's own. Stroke is currentColor. */
export function UsersGlyph({ size = 12 }: { size?: number }) {
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
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

/** The governance gavel with a tick (lucide `gavel`, a tick added): the spine
 *  node's badge where governance set the figure for every holder at once
 *  (ui-jobs 403, 408). Stroke is currentColor. */
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
      <path d="m14 13-8.381 8.38a1 1 0 0 1-3.001-3l8.384-8.381" />
      <path d="m16 16 6-6" />
      <path d="m21.5 10.5-8-8" />
      <path d="m8 8 6-6" />
      <path d="m8.5 7.5 8 8" />
      <path d="M15.746 19.413l2 2 4-4" />
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
