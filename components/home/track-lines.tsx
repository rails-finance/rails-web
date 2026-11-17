"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

// Same before-paint mirror as HomeHero: the inline blocking script in
// app/layout.tsx handles hard loads; this covers App Router soft navigations.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Track lines graphic — the animated retro stripes, extracted from the hero
 * so it can stand on its own (on the home page, right under the hero).
 *
 * The draw-on animation is gated by its own `data-tracks-seen` flag on <html>,
 * once per browser (localStorage, as the hero's): it plays on the first visit,
 * then stays static on every later load. The inline blocking script in
 * app/layout.tsx flips the attribute before paint on hard loads; the layout
 * effect below replays the gate on soft navigations. The flag is stored when
 * the draw starts, so a visitor who never scrolls down to it still gets it.
 *
 * The draw-on starts when the graphic scrolls into view: the lines are paused
 * in CSS until the wrapper carries `data-playing`, which an IntersectionObserver
 * sets on first intersection. Without it the 5s draw (plus delays) would run
 * from page load, finished before a visitor scrolls down to it.
 *
 * Casing strokes must match the surface behind the graphic to read as gaps
 * where lines cross: they use --track-casing with --surface-raised as the
 * fallback. On the home page the wrapper sets the gradient tone behind the
 * lines: --background light, a literal rgb(24 26 36) dark (the gradient's
 * colour at the middle of the graphic; a `dark:to-rb-800` gradient stop inlines
 * the @theme value and never sees html.dark overrides, so var(--background)
 * — which does follow them — would land on the wrong tone there).
 */
export function TrackLines() {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const play = () => {
      el.dataset.playing = "1";
      try {
        localStorage.setItem("rails-tracks-seen", "1");
      } catch {
        /* ignore */
      }
    };
    if (typeof IntersectionObserver === "undefined") {
      play();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          play();
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useIsomorphicLayoutEffect(() => {
    try {
      if (localStorage.getItem("rails-tracks-seen")) {
        document.documentElement.dataset.tracksSeen = "1";
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
    <div ref={wrapRef} className="track-lines w-full max-w-5xl mx-auto overflow-hidden flex justify-center">
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
