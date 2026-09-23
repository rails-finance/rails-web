"use client";

import { useEffect, useLayoutEffect } from "react";

// Same before-paint mirror as HomeHero: the inline blocking script in
// app/layout.tsx handles hard loads; this covers App Router soft navigations.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Track lines graphic — the animated retro stripes, extracted from the hero
 * so it can live lower on the page (currently between the covered-positions
 * count and the explorer directory on the home page).
 *
 * The draw-on animation is gated by its own `data-tracks-seen` flag on <html>,
 * SESSION-scoped (sessionStorage) unlike the hero's once-per-browser
 * localStorage gate: it plays on the first load of each visit, then stays
 * static across reloads and soft navigations within that session. The inline
 * blocking script in app/layout.tsx flips the attribute before paint on hard
 * loads; the layout effect below replays the gate on soft navigations and
 * stores the flag after the genuine first play.
 *
 * Casing strokes must match the surface behind the graphic to read as gaps
 * where lines cross: they use --track-casing with --surface-raised as the
 * fallback. Its current home sits on the home gradient's constant floor, so
 * the wrapper there sets --background light / the INLINED rb-800 literal
 * rgb(20 22 30) dark (a `dark:to-rb-800` gradient stop inlines the @theme
 * value and never sees html.dark overrides, so var(--background) — which does
 * follow them — would land on the wrong tone there).
 */
export function TrackLines() {
  useIsomorphicLayoutEffect(() => {
    try {
      if (sessionStorage.getItem("rails-tracks-seen")) {
        document.documentElement.dataset.tracksSeen = "1";
      } else {
        sessionStorage.setItem("rails-tracks-seen", "1");
      }
    } catch {
      /* ignore */
    }
  }, []);

  return (
    // Capped at max-w-5xl so the graphic sits inside the live-example
    // frame's column rather than filling it; below that width the svg keeps
    // its 1100px floor and the overflow clip + edge masks absorb the
    // difference.
    <div className="w-full max-w-5xl mx-auto overflow-hidden flex justify-center">
      <svg
        viewBox="0 0 1100 300"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full min-w-[1024px] h-auto"
        style={{
          maskImage:
            "linear-gradient(to bottom, black 0%, black 75%, transparent 100%), linear-gradient(to right, transparent 0%, black 260px, black calc(100% - 260px), transparent 100%)",
          maskComposite: "intersect",
          WebkitMaskComposite: "source-in",
        }}
      >
        <defs>
          <clipPath id="green-right">
            <rect x="370" y="0" width="700" height="500" />
          </clipPath>
          <clipPath id="green-mirror-left">
            <rect x="0" y="0" width="640" height="500" />
          </clipPath>
        </defs>

        {/* Blue group */}
        {[0, 1, 2, 3, 4].map((i) => {
          const r = 60 + i * 12;
          const colors = ["#89C7F0", "#4FAEEA", "#4090D1", "#3270B8", "#2F56A8"];
          const d = `M0,${222 - r} L565,${222 - r} A${r},${r} 0 0,1 ${565 + r},222 L${565 + r},377`;
          return (
            <g key={`bg${i}`}>
              <path
                fill="none"
                strokeWidth="12"
                strokeLinecap="round"
                opacity="0.5"
                stroke="var(--track-casing, var(--surface-raised))"
                d={d}
              />
              <path
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
                opacity="0.5"
                stroke="var(--track-casing, var(--surface-raised))"
                d={d}
              />
              <path
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
                stroke={colors[i]}
                d={d}
                pathLength="1"
                className="hero-track-line"
                style={{ ["--hero-line-delay" as string]: `${1.6 + i * 0.15}s` }}
              />
            </g>
          );
        })}

        {/* Green group (left leg) */}
        {[0, 1, 2, 3, 4].map((i) => {
          const r = 60 + i * 12;
          const colors = ["#D5E38D", "#C0D651", "#71A450", "#79A950", "#507D49"];
          const d = `M0,${432 - i * 12} L195,${432 - i * 12} A${110 - i * 12},${110 - i * 12} 0 0,0 ${365 - r},322 L${365 - r},297 A${r},${r} 0 0,1 365,${297 - r} L375,${297 - r} A${r},${r} 0 0,1 ${375 + r},297 L${375 + r},537`;
          return (
            <g key={`gg${i}`}>
              <path
                fill="none"
                strokeWidth="12"
                strokeLinecap="round"
                opacity="0.5"
                stroke="var(--track-casing, var(--surface-raised))"
                d={d}
              />
              <path
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
                opacity="0.5"
                stroke="var(--track-casing, var(--surface-raised))"
                d={d}
              />
              <path
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
                stroke={colors[i]}
                d={d}
                pathLength="1"
                className="hero-track-line"
                style={{ ["--hero-line-delay" as string]: `${1.6 + i * 0.15}s` }}
              />
            </g>
          );
        })}

        {/* Green group (right leg, clipped, in front of blue) */}
        <g clipPath="url(#green-right)">
          {[0, 1, 2, 3, 4].map((i) => {
            const r = 60 + i * 12;
            const colors = ["#D5E38D", "#C0D651", "#71A450", "#79A950", "#507D49"];
            const d = `M0,${432 - i * 12} L195,${432 - i * 12} A${110 - i * 12},${110 - i * 12} 0 0,0 ${365 - r},322 L${365 - r},297 A${r},${r} 0 0,1 365,${297 - r} L375,${297 - r} A${r},${r} 0 0,1 ${375 + r},297 L${375 + r},537`;
            return (
              <g key={`grg${i}`}>
                <path
                  fill="none"
                  strokeWidth="12"
                  strokeLinecap="round"
                  opacity="0.5"
                  stroke="var(--track-casing, var(--surface-raised))"
                  d={d}
                />
                <path
                  fill="none"
                  strokeWidth="7"
                  strokeLinecap="round"
                  opacity="0.5"
                  stroke="var(--track-casing, var(--surface-raised))"
                  d={d}
                />
                <path
                  fill="none"
                  strokeWidth="7"
                  strokeLinecap="round"
                  stroke={colors[i]}
                  d={d}
                  pathLength="1"
                  className="hero-track-line"
                  style={{ ["--hero-line-delay" as string]: `${1.6 + i * 0.15}s` }}
                />
              </g>
            );
          })}
        </g>

        {/* Red mirrored group (right side) */}
        {[0, 1, 2, 3, 4].map((i) => {
          const r = 60 + i * 12;
          const colors = ["#F8D94C", "#EDC64A", "#E0773D", "#D64033", "#A72D22"];
          const d = `M1400,${252 - i * 12} L815,${252 - i * 12} A${110 - i * 12},${110 - i * 12} 0 0,1 ${645 + r},142 L${645 + r},117 A${r},${r} 0 0,0 645,${117 - r} L635,${117 - r} A${r},${r} 0 0,0 ${635 - r},117 L${635 - r},357`;
          return (
            <g key={`rmg${i}`}>
              <path
                fill="none"
                strokeWidth="12"
                strokeLinecap="round"
                opacity="0.5"
                stroke="var(--track-casing, var(--surface-raised))"
                d={d}
              />
              <path
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
                opacity="0.5"
                stroke="var(--track-casing, var(--surface-raised))"
                d={d}
              />
              <path
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
                stroke={colors[i]}
                d={d}
                pathLength="1"
                className="hero-track-line"
                style={{ ["--hero-line-delay" as string]: `${i * 0.15}s` }}
              />
            </g>
          );
        })}

        {/* Red mirrored (left leg, clipped) */}
        <g clipPath="url(#green-mirror-left)">
          {[0, 1, 2, 3, 4].map((i) => {
            const r = 60 + i * 12;
            const colors = ["#F8D94C", "#EDC64A", "#E0773D", "#D64033", "#A72D22"];
            const d = `M1400,${252 - i * 12} L815,${252 - i * 12} A${110 - i * 12},${110 - i * 12} 0 0,1 ${645 + r},142 L${645 + r},117 A${r},${r} 0 0,0 645,${117 - r} L635,${117 - r} A${r},${r} 0 0,0 ${635 - r},117 L${635 - r},357`;
            return (
              <g key={`rmlg${i}`}>
                <path
                  fill="none"
                  strokeWidth="12"
                  strokeLinecap="round"
                  opacity="0.5"
                  stroke="var(--track-casing, var(--surface-raised))"
                  d={d}
                />
                <path
                  fill="none"
                  strokeWidth="7"
                  strokeLinecap="round"
                  opacity="0.5"
                  stroke="var(--track-casing, var(--surface-raised))"
                  d={d}
                />
                <path
                  fill="none"
                  strokeWidth="7"
                  strokeLinecap="round"
                  stroke={colors[i]}
                  d={d}
                  pathLength="1"
                  className="hero-track-line"
                  style={{ ["--hero-line-delay" as string]: `${i * 0.15}s` }}
                />
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
