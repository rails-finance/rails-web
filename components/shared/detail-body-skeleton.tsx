"use client";

// Cold-load placeholder for a position DETAIL body, in the loading grammar
// (skeleton-card.tsx): one framed placeholder per real section — the position
// card, the economics panel, the timeline header, then the event spine — each
// at the section's height, with coarse bars where its main lines and figures
// go. Heights are the measured section defaults, refined per route by what
// the browser observed last visit (useSkeletonSizes).
//
// The card and the sections beside it carry the sidebar lozenge (C20): 12px
// and a 6px gap below md, 40px and 8px from md, so the frames stand on the
// real body's left edge.
//
// BODY ONLY — the page owns its toolbar (back + export). Inline-branch pages
// (`{loading ? <DetailBodySkeleton/> : …}`) render it below their always-present
// toolbar; full-return pages keep their real back button and swap this in for the
// body. It brings its own `space-y-6`, so callers just drop it in.

import type { ReactNode } from "react";
import { SkeletonBar, SkeletonBlock } from "@/components/shared/skeleton-card";
import { useSkeletonSizes } from "@/hooks/useSkeletonSizes";

/** How many event rows the spine reserves. */
const SPINE_ROWS = 4;

/** The lozenge, then the section's frame beside it. */
export function LozengeRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-1.5 md:gap-2">
      <div aria-hidden className="skel-wait w-3 shrink-0 rounded-full bg-raised md:w-10" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** The card's bars: the heading line, then four headlines (label over
 *  figure), then the panel's row. */
const CARD_BARS = (
  <div className="flex flex-col gap-6">
    <SkeletonBar width={96} wait={false} />
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-3">
          <SkeletonBar width={56} wait={false} />
          <SkeletonBar width={i < 2 ? "70%" : "40%"} figure wait={false} />
        </div>
      ))}
    </div>
    <div className="grid grid-cols-3 gap-4 pt-6 lg:grid-cols-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-3">
          <SkeletonBar width={64} wait={false} />
          <SkeletonBar width={48} wait={false} />
        </div>
      ))}
    </div>
  </div>
);

/** The economics panel's bars: its title, then two sides (headline over a
 *  full-width bar). */
const ECONOMICS_BARS = (
  <div className="flex flex-col gap-6">
    <SkeletonBar width={88} wait={false} />
    {[0, 1].map((i) => (
      <div key={i} className="flex flex-col gap-3">
        <SkeletonBar width={72} figure wait={false} />
        <SkeletonBar width="100%" figure wait={false} />
      </div>
    ))}
  </div>
);

/** One event row: its title line, its figure at the right. */
export const EVENT_BARS = (
  <div className="flex h-full items-center justify-between gap-4">
    <SkeletonBar width="30%" wait={false} />
    <SkeletonBar width={72} wait={false} />
  </div>
);

export function DetailBodySkeleton() {
  const { sizes } = useSkeletonSizes();
  return (
    <div className="space-y-6" aria-busy="true">
      <LozengeRow>
        <SkeletonBlock height={sizes["detail-card"]} bars={CARD_BARS} />
      </LozengeRow>
      <LozengeRow>
        <SkeletonBlock height={sizes["detail-economics"]} bars={ECONOMICS_BARS} />
      </LozengeRow>
      <LozengeRow>
        <div className="space-y-3">
          {/* The timeline header: a bare row of bars. */}
          <SkeletonBlock
            height={sizes["detail-timeline-header"]}
            frame={false}
            bars={
              <div className="flex h-full items-center gap-3">
                <SkeletonBar width={120} wait={false} />
                <SkeletonBar width={64} wait={false} />
              </div>
            }
          />
          {Array.from({ length: SPINE_ROWS }, (_, i) => (
            <SkeletonBlock key={i} height={sizes["detail-event"]} bars={EVENT_BARS} className="!py-0" />
          ))}
        </div>
      </LozengeRow>
    </div>
  );
}
