"use client";

import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { fmtHeaderMagnitude } from "@/lib/shared/spine-format";
export { fmtHeaderMagnitude };
import { useSpineView } from "@/components/shared/mobile-spine";

// Event-card headers hide their value spans while the "Timeline values" option
// in the Display menu is on (the default): the spine's flank values carry them,
// at >=640px beside the card and below it in the phone spine view, which is the
// only phone view. With the option off, the header states the values and the
// spine drops its flank figures. The one exception is a pinned `/event/<id>`
// page below 640px, which draws no spine: its header keeps the values.
//
// This is uniform across BOTH views (interpreted and chain-state): the
// chain-state view carries the same compact spine notation and the same
// hand-off (view-tiers.md: compact display is the one-step readability leeway
// the tier allows; the exact figure rides the provenance trace).

export function useHeaderValueHideClass(): string {
  const { showTimelineValues } = useTimelineDisplay();
  const spineView = useSpineView();
  if (!showTimelineValues) return "";
  // Variants, so the hide wins over a span's display class.
  return spineView ? "max-sm:hidden sm:hidden" : "sm:hidden";
}
