"use client";

// The explanation slot a section head takes (rails-ops ui-jobs 549/550,
// proposal §6): the (i) toggle and its pane, a status lead and grouped bullets
// (`explain-groups.tsx`) with the section's "?" at the pane's foot
// (standards/explanation-copy-charter.md §3, §4). The position card draws its
// pane through this; the vitals band and the other product-page heads take it
// the same way, naming their own anatomy codes.

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";

/** What a head hands its explanation slot. */
export interface SectionExplainerSlot {
  /** The pane's bullets; `null` draws no (i). */
  body: ReactNode | null;
  /** Open the pane on mount (a surface that remembers it). */
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  /** The pane's copy-this-view link. */
  viewHref?: () => string;
}

export function SectionExplainer({
  slot,
  label,
  learnMore = null,
  anatomy,
  rowExtra,
  snippet = false,
  className = "mt-3",
}: {
  slot: SectionExplainerSlot;
  /** The (i) button's noun: "Show vault explanation". */
  label: string;
  /** The section's "?" at the pane's foot. */
  learnMore?: LearnMoreContent | null;
  /** The pane's and the "?"'s app-anatomy codes. */
  anatomy?: { explanation?: string; learnMore?: string };
  /** Content on the (i)'s row, at its right (the card's counters). */
  rowExtra?: ReactNode;
  /** Let search quote the pane. Off by default: a pane restates live figures,
   *  which decay. */
  snippet?: boolean;
  className?: string;
}) {
  return (
    <ProvenanceInfoTabs
      className={className}
      rowExtra={rowExtra}
      explanation={slot.body == null ? undefined : snippet ? slot.body : <div data-nosnippet="">{slot.body}</div>}
      learnMore={learnMore}
      viewHref={slot.viewHref}
      explanationDefaultOpen={slot.defaultOpen}
      onExplanationToggle={slot.onToggle}
      anatomy={{ ...anatomy, explanation: anatomy?.explanation ? `${anatomy.explanation} K3` : "K3" }}
      label={label}
    />
  );
}
