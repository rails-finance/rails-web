"use client";

import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { fmtSpine } from "@/components/shared/activity-timeline";
import { useMediaQuery } from "@/hooks/useMediaQuery";

// Event-card headers hide their value spans at ≥sm (640px) so the SpineColumn
// flanking values can take over without duplication, while below sm (no spine)
// the "amount + icon" stays visible inline with the action pill. Passive events
// (liquidations, challenges, rewards that happen TO the user) keep the value
// visible at ≥sm too — the amount IS the story of the event.
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

const HIDE_CLASS = "sm:hidden";

export function useHeaderValueHideClass(opts?: { isPassive?: boolean }): string {
  const { showTimelineValues } = useTimelineDisplay();
  if (!showTimelineValues) return "";
  if (opts?.isPassive) return "";
  return HIDE_CLASS;
}

/** Format a change magnitude for an event-card header. The header mirrors the
 *  spine's compact form (`fmtSpine`: "1.2M") so the two never disagree (the
 *  exact, byte-precise figure rides the provenance trace, not the header).
 *  Callers pass the magnitude (`Math.abs(...)`) and add their own +/− sign.
 *
 *  Below 0.01 this reads "<0.01" instead of `fmtSpine`'s scientific fallback
 *  (e.g. "1.94e-12") — the same headline threshold as `formatHeadlineAmount`
 *  in lib/utils/format.ts, kept as its own guard rather than a call to that
 *  helper: `fmtSpine`'s own compact rounding (1dp above 1M) stays intact for
 *  every other magnitude, so the header still never disagrees with the spine
 *  it mirrors. The exact figure still rides the provenance trace. */
export function fmtHeaderMagnitude(n: number): string {
  const abs = Math.abs(n);
  if (abs > 0 && abs < 0.01) return "<0.01";
  return fmtSpine(n);
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
