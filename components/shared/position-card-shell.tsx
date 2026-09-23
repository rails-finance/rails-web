"use client";

// The one frame every position card renders in — the rounded-2xl raised box the
// protocol cards (Maker, Spark, Morpho, …) previously each declared by hand.
//
// `receipts` is the render-site switch: the detail page passes it so the card
// becomes its own receipts scope — every <Prov> inside registers into the
// card's registry, which the page-level inspector reads (prov-inspector.tsx),
// and the Explanation heading-button appears at the foot (the V4 spoke-card
// grammar). The listing renders the SAME card component without it: there the
// card sits inside a row <Link>, so it stays inert content — no scope, no
// button.
//
// That listing branch is the ONE place in the app where <Prov> is meant to
// trace nothing, and it is invisible from inside: the same figure component
// draws both renders and cannot know which it is in. This shell knows, so it
// declares it — <ProvUnscoped> below is what keeps the dev unscoped-<Prov>
// tripwire quiet for listing rows while leaving it loud everywhere else.

import type { ReactNode } from "react";
import { ProvReceiptsScope, ProvUnscoped, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

export function PositionCardShell({
  receipts = false,
  rowExtra,
  explanation,
  learnMore,
  viewHref,
  explanationDefaultOpen,
  onExplanationToggle,
  children,
}: {
  receipts?: boolean;
  /** Inline context content riding the heading-button row (the V2 trove card's
   *  one-line context strip: figures right-aligned after the buttons). Only
   *  meaningful with `receipts` — the listing render has no button row. */
  rowExtra?: ReactNode;
  /** The card's Explanation section (the V4/trove "About this position" home):
   *  narration bullets + any risk strips describing the position NOW. Only
   *  meaningful with `receipts`. */
  explanation?: ReactNode;
  /** The card's "?" FAQ — the position-level cell every state panel owns
   *  (grammar §5; the V2 trove card and V4 spoke card had it first). Renders
   *  at the foot of the Explanation pane; needs an `explanation` to sit under. */
  learnMore?: LearnMoreContent | null;
  /** Copy-this-view control, forwarded straight through to
   *  `ProvenanceInfoTabs` — the page's `useTimelineEvents().viewHref`. Only
   *  meaningful with `receipts`; a listing row never passes it. */
  viewHref?: () => string;
  /** Open the Explanation section on first mount — passed straight through to
   *  ProvenanceInfoTabs (a surface that persists the pane's open state, e.g.
   *  the V2 trove page, restores it here). */
  explanationDefaultOpen?: boolean;
  /** Fires when the Explanation section opens/closes — passed straight
   *  through, for a surface that persists that state. */
  onExplanationToggle?: (open: boolean) => void;
  children: ReactNode;
}) {
  const registry = useReceiptRegistry();
  const frame = (
    // group-hover/listing-row: the blue navigation hover border when the card sits
    // inside a listing's row <Link> (which declares the group) — inert everywhere else.
    // data-skel-section feeds the skeleton memory layer (skeleton-size-recorder):
    // `receipts` already distinguishes the detail render from the listing row.
    <div
      data-skel-section={receipts ? "detail-card" : "listing-row"}
      className="rounded-2xl border border-rb-300/40 dark:border-rb-700/40 bg-raised px-5 py-4 transition-colors group-hover/listing-row:border-blue-500 dark:group-hover/listing-row:border-blue-500"
    >
      {children}
      {receipts && (
        <ProvenanceInfoTabs
          className="mt-3"
          rowExtra={rowExtra}
          explanation={explanation}
          learnMore={learnMore}
          viewHref={viewHref}
          explanationDefaultOpen={explanationDefaultOpen}
          onExplanationToggle={onExplanationToggle}
        />
      )}
    </div>
  );
  return receipts ? (
    <ProvReceiptsScope registry={registry}>{frame}</ProvReceiptsScope>
  ) : (
    <ProvUnscoped>{frame}</ProvUnscoped>
  );
}
