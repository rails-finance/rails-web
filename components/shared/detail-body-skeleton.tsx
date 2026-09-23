"use client";

// Cold-load placeholder for a position DETAIL body: one solid block per real
// section — the position card, the economics panel, the timeline header, then
// the event spine — no inner anatomy (see skeleton-card.tsx). Heights are the
// measured section defaults, refined per route by what the browser observed
// last visit (useSkeletonSizes), so the shape the page lands into is reserved
// without drawing a guess at its contents.
//
// BODY ONLY — the page owns its toolbar (back + export). Inline-branch pages
// (`{loading ? <DetailBodySkeleton/> : …}`) render it below their always-present
// toolbar; full-return pages keep their real back button and swap this in for the
// body. It brings its own `space-y-6`, so callers just drop it in.

import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { useSkeletonSizes } from "@/hooks/useSkeletonSizes";

// Decaying opacity down the spine — later events fade out (as the real spine's
// entrance cascade does), so the list reads as continuing past the fold.
const SPINE_DECAY = [1, 0.75, 0.5, 0.3];

export function DetailBodySkeleton() {
  const { sizes } = useSkeletonSizes();
  return (
    <div className="animate-pulse space-y-6">
      {/* The position card. */}
      <SkeletonBlock height={sizes["detail-card"]} />

      {/* Economics (lifetime-flows) panel. */}
      <SkeletonBlock height={sizes["detail-economics"]} />

      {/* Timeline header — flush with the real row's own left edge. */}
      <SkeletonBlock height={sizes["detail-timeline-header"]} className="rounded-md" />

      {/* Event spine — one block per row, fading down the stack. */}
      <div className="space-y-3">
        {SPINE_DECAY.map((opacity, i) => (
          <div key={i} style={{ opacity }}>
            <SkeletonBlock height={sizes["detail-event"]} />
          </div>
        ))}
      </div>
    </div>
  );
}
