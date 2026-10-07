"use client";

import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { fmtHeaderMagnitude } from "@/lib/shared/spine-format";
export { fmtHeaderMagnitude };
import { useMediaQuery } from "@/hooks/useMediaQuery";

// Event-card headers hide their value spans at ≥sm (640px) so the SpineColumn
// flanking values can take over without duplication, while below sm (no spine)
// the "amount + icon" stays visible inline with the action pill. A redemption
// or a liquidation hands off the same way: its spine draws the legs as nodes.
//
// The "Timeline values" option in the Display dropdown is the default-on
// preference: when on, values render in the spine and header amounts hide at ≥sm.
// When off, header amounts come back and the spine drops its flanking values.
//
// This is uniform across BOTH views. The chain-state ("On-chain values") view is
// NOT special-cased any more: it carries the same compact spine notation and the
// same ≥sm / <sm hand-off as the interpreted view (view-tiers.md — compact display
// is the one-step readability leeway the tier allows; the exact figure rides the
// provenance trace). Tier-2 protocols switched to on-chain mode obey this same
// floor. The sm breakpoint matches the card's own detail-grid breakpoint, so the
// spine and the card body reflow together.

// The phone spine view (components/shared/mobile-spine.tsx) draws the flank
// values below sm too, so its opened card hides them the same way.
const HIDE_CLASS = "sm:hidden mspine:max-sm:hidden";

export function useHeaderValueHideClass(): string {
  const { showTimelineValues } = useTimelineDisplay();
  if (!showTimelineValues) return "";
  return HIDE_CLASS;
}

/** Whether the "Timeline values" display toggle should be disabled, with a
 *  reason for the tooltip. It has no effect when the spine isn't shown — below
 *  sm the spine is hidden and values live in the card, so toggling it there does
 *  nothing. At ≥sm it is live in both views (chain-state included). */
export function useTimelineValuesDisabled(): { disabled: boolean; reason?: string } {
  const isWide = useMediaQuery("(min-width: 640px)");
  if (!isWide) return { disabled: true, reason: "Shown in the card at this width" };
  return { disabled: false };
}
