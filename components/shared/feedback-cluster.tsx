"use client";

// The feedback cluster — the one-line ask and the teal Send-feedback pill,
// opening the shared FeedbackModal (→ /api/feedback, the private team chat).
// Extracted verbatim from the marketing SiteFooter so both footers (site +
// app) render the identical cluster; it owns its own modal state, so a host
// only mounts <FeedbackCluster />. Adapts to light and dark via tokens.
//
// Two layouts, selected by `variant`:
//   "stacked" (default) — the marketing site footer: "Feedback" heading, the
//     ask on its own line, pill below.
//   "inline" — the slim app footer: no heading, the ask and pill on one row in
//     small text.

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { FeedbackModal } from "@/components/shared/feedback-modal";

export function FeedbackCluster({ variant = "stacked" }: { variant?: "stacked" | "inline" }) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const inline = variant === "inline";
  return (
    <div className={inline ? "flex flex-wrap items-center justify-center gap-x-3 gap-y-2" : undefined}>
      {inline ? (
        <p className="text-xs text-rb-500">Spotted a wrong number or a rough edge?</p>
      ) : (
        <>
          <h4 className="text-sm font-semibold text-foreground mb-3">Feedback</h4>
          <p className="body-text mb-3">Spotted a wrong number or a rough edge? It goes straight to the team.</p>
        </>
      )}
      <button
        onClick={() => setFeedbackOpen(true)}
        className={`inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 text-white font-bold rounded-full transition-colors duration-150 cursor-pointer ${
          inline ? "text-xs px-3 py-1.5" : "text-sm px-4 py-2"
        }`}
      >
        <MessageSquarePlus className={`shrink-0 ${inline ? "w-3.5 h-3.5" : "w-4 h-4"}`} aria-hidden="true" />
        Send feedback
      </button>
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </div>
  );
}
