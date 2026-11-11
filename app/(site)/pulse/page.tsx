"use client";

// focus: Rails' own news timeline, shown whole under any focus (Miles, 2026-11-11).

import { TimelinePage } from "@/components/pulse/TimelinePage";

export default function PulsePage() {
  return (
    <div className="container mx-auto md:px-6 px-4 pt-32 pb-12 max-w-3xl">
      <TimelinePage title="Pulse" description="A timeline of what we're building and sharing. " />
    </div>
  );
}
