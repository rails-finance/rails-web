"use client";

// Asymmetry Trove card — a thin instantiation of the shared Liquity-family
// card (components/protocol/liquity-family/liquity-position-card.tsx). The
// markup, provenance and learn-more content are the shared card's; this file
// only threads the "asymmetry" protocol id through and re-exports the names
// the listing + trove-detail call sites already import.

import {
  LiquityPositionCard,
  viewFromForkSummary,
  liveFromForkChain,
} from "@/components/protocol/liquity-family/liquity-position-card";
import type { LiquityTroveView } from "@/components/protocol/liquity-family/types";
import type { LiquityForkTroveChainResponse } from "@/lib/api/fetch-liquity-fork-position";
import type { AsymmetryTroveSummary } from "@/lib/sources/api/asymmetry-troves";

export type AsymmetryTroveView = LiquityTroveView;

export function AsymmetryPositionCard({
  v,
  receipts = false,
  rowExtra,
  explanation,
  viewHref,
  live,
  compact,
}: {
  v: AsymmetryTroveView;
  receipts?: boolean;
  /** Context content riding the shell's heading-button row (the compact runway). */
  rowExtra?: React.ReactNode;
  /** The card's Explanation section (live narration + risk strips). */
  explanation?: React.ReactNode;
  /** Copy-this-view control, forwarded straight through to `LiquityPositionCard`
   *  — the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** The detail page's live branch read — see LiquityPositionCard for the
   *  live-override behaviour. Listings omit it. */
  live?: LiquityForkTroveChainResponse | null;
  /** Listing render: debt headline in approximate notation ("48.1k"). */
  compact?: boolean;
}) {
  return (
    <LiquityPositionCard
      protocol="asymmetry"
      v={v}
      receipts={receipts}
      rowExtra={rowExtra}
      explanation={explanation}
      viewHref={viewHref}
      live={live ? liveFromForkChain(live) : live}
      compact={compact}
    />
  );
}

/** Build a card view from the listing summary row. */
export function viewFromSummary(s: AsymmetryTroveSummary): AsymmetryTroveView {
  return viewFromForkSummary("asymmetry", s);
}
