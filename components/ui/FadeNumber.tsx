"use client";

import { useEffect, useRef, useState } from "react";

interface FadeNumberProps {
  value: number;
  formatFn?: (value: number) => string | number;
  decimals?: number;
  animateOnMount?: boolean;
}

interface Layer {
  key: number;
  text: string;
  /** Fading out — pruned once the transition completes. */
  leaving: boolean;
  /** Plays the fade-in entrance (skipped for the first paint unless the caller opts in). */
  fadeIn: boolean;
}

/** Cross-fades a number in place when its value changes. CSS-only — the
 *  outgoing and incoming values stack in one grid cell (no layout shift, no
 *  blank gap between them), the newcomer plays the shared `fade-in` keyframe
 *  and the leaver transitions to transparent before being pruned. This used to
 *  be a framer-motion AnimatePresence pair; the CSS twin keeps framer out of
 *  every route that shows a live-updating number (same move as the `.ct-row`
 *  listing entrance). */
export function FadeNumber({ value, formatFn, decimals = 2, animateOnMount = false }: FadeNumberProps) {
  const formattedValue = formatFn
    ? String(formatFn(value))
    : value.toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
      });

  const nextKey = useRef(1);
  const [layers, setLayers] = useState<Layer[]>(() => [
    { key: 0, text: formattedValue, leaving: false, fadeIn: animateOnMount },
  ]);

  useEffect(() => {
    setLayers((prev) => {
      const top = prev[prev.length - 1];
      if (top && !top.leaving && top.text === formattedValue) return prev;
      return [
        ...prev.map((l) => ({ ...l, leaving: true })),
        { key: nextKey.current++, text: formattedValue, leaving: false, fadeIn: true },
      ];
    });
  }, [formattedValue]);

  // Prune fully-faded layers once their 300ms exit transition has played.
  useEffect(() => {
    if (!layers.some((l) => l.leaving)) return;
    const timer = setTimeout(() => setLayers((prev) => prev.filter((l) => !l.leaving)), 300);
    return () => clearTimeout(timer);
  }, [layers]);

  return (
    <span className="inline-grid">
      {layers.map((l) => (
        <span
          key={l.key}
          className={`col-start-1 row-start-1 transition-opacity duration-300 ${l.leaving ? "opacity-0" : "opacity-100"}`}
          style={l.fadeIn ? { animation: "fade-in 0.3s" } : undefined}
        >
          {l.text}
        </span>
      ))}
    </span>
  );
}
