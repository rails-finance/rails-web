"use client";

import { useEffect, useState } from "react";

/** Below this width a menu that floats beside its trigger on desktop opens as
 *  a slide-up sheet instead (filter-dropdown, the timeline's date range) — the
 *  coverage page's phone breakpoint, shared so every sheet flips at one width. */
export const PHONE_QUERY = "(max-width: 639.98px)";

/** SSR-safe media-query hook. Returns `false` on the server and the first client
 *  render, then reconciles to the real match after mount and stays live on
 *  viewport changes. Mirrors the `matchMedia` pattern in reveal-tip.tsx. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [query]);
  return matches;
}
