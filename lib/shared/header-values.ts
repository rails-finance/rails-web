"use client";

import { fmtHeaderMagnitude } from "@/lib/shared/spine-format";
export { fmtHeaderMagnitude };
import { useSpineView } from "@/components/shared/mobile-spine";

// Event-card headers hide their value spans: the spine's flank values carry
// them, at >=640px beside the card and below it in the phone spine view, which
// is the only phone view, so no figure is drawn twice (rails-ops
// TO-DO-position-card 326). The one exception is a pinned `/event/<id>` page
// below 640px, which draws no spine: its header keeps the values.
//
// This is uniform across BOTH views (interpreted and chain-state): the
// chain-state view carries the same compact spine notation and the same
// hand-off (view-tiers.md: compact display is the one-step readability leeway
// the tier allows; the exact figure rides the provenance trace).

export function useHeaderValueHideClass(): string {
  const spineView = useSpineView();
  // Variants, so the hide wins over a span's display class.
  return spineView ? "max-sm:hidden sm:hidden" : "sm:hidden";
}
