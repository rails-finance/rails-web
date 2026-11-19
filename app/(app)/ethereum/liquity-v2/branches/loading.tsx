"use client";

// Instant skeleton while the force-dynamic branches page runs its live chain
// read on the server. It draws the page's own shape: the real rail header,
// the title and stamp lines, the three branch cards in the view's grid, the
// Stability Pool depth table and the Redemption section, each at the height
// measured on the page (1440px and 390px wide), so nothing moves when the
// data lands (components/shared/skeleton-card.tsx for the loading grammar).

import { SkeletonBar, SkeletonBlock } from "@/components/shared/skeleton-card";
import { RailHeader } from "@/components/shared/rail-header";
import type { ReactNode } from "react";

/** One line of text at the height the page's line takes. */
function Line({ height, children }: { height: string; children: ReactNode }) {
  return <div className={`skel-wait flex items-center ${height}`}>{children}</div>;
}

/** A section's heading line, then a frame for the rest of its height. */
function Section({ heading, frameClass }: { heading: number; frameClass: string }) {
  return (
    <section className="mt-8">
      <Line height="h-5">
        <SkeletonBar width={heading} wait={false} />
      </Line>
      <div aria-hidden data-skel-placeholder="" className={`skel-wait mt-3 rounded-2xl bg-raised ${frameClass}`} />
    </section>
  );
}

export default function Loading() {
  return (
    <div className="min-h-screen">
      <div className="py-8" aria-busy="true">
        <header className="mb-6">
          <div className="mb-2.5">
            <RailHeader session="liquity-v2" venue="subPage" />
          </div>
          {/* The title, then the stamp, which wraps onto three lines below sm. */}
          <Line height="h-8">
            <SkeletonBar width={220} figure wait={false} />
          </Line>
          <Line height="h-[73px] sm:h-[25px]">
            <SkeletonBar width={140} wait={false} />
          </Line>
        </header>
        <section>
          <Line height="h-5">
            <SkeletonBar width={72} wait={false} />
          </Line>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <SkeletonBlock key={i} height={250} />
            ))}
          </div>
        </section>
        {/* Stability Pool depth, then Redemption. */}
        <Section heading={150} frameClass="h-[211px] lg:h-[272px]" />
        <Section heading={96} frameClass="h-[406px] lg:h-[213px]" />
      </div>
    </div>
  );
}
