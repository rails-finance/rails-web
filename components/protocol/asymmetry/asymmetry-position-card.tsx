"use client";

// Asymmetry Trove card — a thin instantiation of the shared Liquity-family card
// (components/protocol/liquity-family/liquity-position-card.tsx), which
// builds the shared position card's slots. This file threads the "asymmetry"
// protocol id through and re-exports the names the listing + trove-detail
// call sites import.

import type { ReactNode } from "react";
import {
  LiquityPositionCard,
  viewFromForkSummary,
  liveFromForkChain,
} from "@/components/protocol/liquity-family/liquity-position-card";
import type { LiquityTroveSurplus, LiquityTroveView } from "@/components/protocol/liquity-family/types";
import type { PositionCardExports, PositionPanelColumns } from "@/components/shared/position-card";
import type { LiquityForkTroveChainResponse } from "@/lib/api/fetch-liquity-fork-position";
import type { AsymmetryTroveSummary } from "@/lib/sources/api/asymmetry-troves";

export type AsymmetryTroveView = LiquityTroveView;

export function AsymmetryPositionCard({
  v,
  receipts = false,
  explanation,
  viewHref,
  live,
  compact,
  surplus,
  panel,
  exports,
}: {
  v: AsymmetryTroveView;
  /** The Trove page's render (receipts, panel, (i)); the listing omits it. */
  receipts?: boolean;
  /** The card's Explanation section (live narration + risk strips). */
  explanation?: ReactNode;
  /** Copy-this-view control: the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** The detail page's live branch read — see LiquityPositionCard for the
   *  live-override behaviour. Listings omit it. */
  live?: LiquityForkTroveChainResponse | null;
  /** Listing render: debt headline in approximate notation ("48.1k"). */
  compact?: boolean;
  /** A liquidated Trove's collateral surplus, read at the head. */
  surplus?: LiquityTroveSurplus | null;
  /** The panel's rows from the live read (`liquityForkPanelColumns`). */
  panel?: PositionPanelColumns;
  /** The card ⋮'s export shapes (`liquityForkExports`). */
  exports?: PositionCardExports | null;
}) {
  return (
    <LiquityPositionCard
      protocol="asymmetry"
      v={v}
      surface={receipts ? "detail" : "listing"}
      explanation={explanation}
      viewHref={viewHref}
      live={live ? liveFromForkChain(live) : live}
      compact={compact}
      surplus={surplus}
      panel={panel}
      exports={exports}
    />
  );
}

/** Build a card view from the listing summary row. */
export function viewFromSummary(s: AsymmetryTroveSummary): AsymmetryTroveView {
  return viewFromForkSummary("asymmetry", s);
}
