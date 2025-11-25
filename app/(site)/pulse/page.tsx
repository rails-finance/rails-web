'use client';

import { TimelinePage } from "@/components/pulse/TimelinePage";

export default function PulsePage() {
  return (
    <div className="container mx-auto md:px-6 px-4 pt-32 pb-12 max-w-7xl">
      <TimelinePage
        title="Rails Pulse"
        description="A timeline of what we're building and sharing. "
      />
    </div>
  );
}
