"use client";

// The home directory's heading (S10, ui-jobs 507): "Destination DeFi" at
// display size, a share of the column's width (cqw) so the line spans it, on
// the column's left edge. "Destination" in the muted body tone; "DeFi" in the
// marketing blue, and in dark turning through the live example's glow colours
// on its clock (components/home/glow-clock.ts). A statement more than a
// heading, so the turning colours carry no contrast floor (color-grammar.md
// §2). Under it, the muted line on how to use the directory.

import { useEffect, useRef } from "react";

import { joinGlowClock, syncGlowText } from "@/components/home/glow-clock";

export function DirectoryHeading() {
  const defi = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = defi.current;
    if (!el) return;
    const leave = joinGlowClock(el);
    const unsync = syncGlowText();
    return () => {
      leave();
      unsync();
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-8 @container" data-anatomy="S10">
      <h2
        className="whitespace-nowrap font-semibold leading-none tracking-tighter text-rb-500 text-[14cqw]"
        data-home-directory-heading=""
      >
        Destination{" "}
        <span ref={defi} className="glow-text" data-glow-text="">
          DeFi
        </span>
      </h2>
      <p className="mt-4 text-lg text-rb-500" data-home-directory-intro="">
        Choose a chain, then select a protocol.
      </p>
    </div>
  );
}
