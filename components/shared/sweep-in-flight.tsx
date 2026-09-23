"use client";

// What a Base wallet page shows while its history SWEEP is in flight: the
// page's sentence saying what is being read and why it takes a moment, LEADS
// — a reader should know what they are waiting for before the placeholder
// asks them to wait — then the timeline's own shape beneath it: a header row
// and an event spine fading down the stack, pulsing. The sweep is ONE request
// from the contract's first block to now (no chunk counter comes back), so
// there is nothing to meter: a progress bar would invent a figure, a spinner
// would say only "busy". A skeleton in the timeline's shape reserves the
// space the events land into and reads as the page already knowing what it
// will show — the same grammar as DetailBodySkeleton, minus the card the page
// has already drawn live above it.
//
// Blocks are solid and borderless (skeleton-card.tsx), flush with the real
// toolbar's own left edge (no inset — the header row carries none), heights
// come from the measured section defaults refined per route
// (useSkeletonSizes), and the pulse sits on the container. The caption is the
// page's own sentence — each explorer names its own source (the Pool, the
// Comets, the singleton…).

import type { ReactNode } from "react";
import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { useSkeletonSizes } from "@/hooks/useSkeletonSizes";

const SPINE_DECAY = [1, 0.75, 0.5, 0.3];

export function SweepInFlight({ children }: { children: ReactNode }) {
  const { sizes } = useSkeletonSizes();
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <p className="text-center text-sm text-rb-500">{children}</p>
      <div className="animate-pulse space-y-3" aria-hidden="true">
        <SkeletonBlock height={sizes["detail-timeline-header"]} className="rounded-md" />
        {SPINE_DECAY.map((opacity, i) => (
          <div key={i} style={{ opacity }}>
            <SkeletonBlock height={sizes["detail-event"]} />
          </div>
        ))}
      </div>
    </div>
  );
}
