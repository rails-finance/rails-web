"use client";

// Invisible observer that feeds the skeleton memory layer: on every route it
// finds the REAL page sections (the [data-skel-section] tags on the shared
// shells), watches their heights with a ResizeObserver, and records the
// settled values per route shape × viewport bucket. The skeletons themselves
// carry NO data-skel-section attribute, so a placeholder's own height can
// never be recorded.
//
// A ResizeObserver rather than a one-shot measure is load-bearing here: detail
// pages merge the live chain-state overlay AFTER first paint, which changes
// the card's height — a one-shot read would memorise the pre-merge height.
// And because the real sections mount after this effect fires (the loading
// skeleton is what's on screen when the pathname commits), a brief poll keeps
// scanning for sections that haven't mounted yet.

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { routeShapeKey, viewportBucket, type SkeletonSection } from "@/lib/shared/skeleton-sizes";
import { recordSkeletonSizes } from "@/lib/shared/skeleton-size-store";

/** How often to re-scan for late-mounting sections, and for how long. */
const SCAN_INTERVAL_MS = 400;
const SCAN_WINDOW_MS = 15000;

/** Quiet period after the last observed resize before writing to the store —
 *  lets a burst of settle-time reflow (fonts, overlay merge) coalesce. */
const RECORD_DEBOUNCE_MS = 500;

export function SkeletonSizeRecorder() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || typeof window === "undefined") return;
    const routeKey = routeShapeKey(pathname);
    const observed = new Set<SkeletonSection>();
    const latest: Partial<Record<SkeletonSection, number>> = {};
    let debounce: ReturnType<typeof setTimeout> | undefined;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const section = (entry.target as HTMLElement).dataset.skelSection as SkeletonSection | undefined;
        if (!section) continue;
        latest[section] = entry.target.getBoundingClientRect().height;
      }
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        // Bucket read at record time, so a mid-visit window resize files the
        // measurement under the viewport it was actually taken at.
        recordSkeletonSizes(routeKey, viewportBucket(window.innerWidth), latest);
      }, RECORD_DEBOUNCE_MS);
    });

    // First element per section key, in document order — the first listing row
    // / event card stands for its stack.
    const scan = () => {
      for (const el of document.querySelectorAll<HTMLElement>("[data-skel-section]")) {
        const section = el.dataset.skelSection as SkeletonSection | undefined;
        if (!section || observed.has(section)) continue;
        observed.add(section);
        observer.observe(el);
      }
    };
    scan();
    const poll = window.setInterval(scan, SCAN_INTERVAL_MS);
    const stopPolling = window.setTimeout(() => window.clearInterval(poll), SCAN_WINDOW_MS);

    return () => {
      window.clearInterval(poll);
      window.clearTimeout(stopPolling);
      if (debounce) clearTimeout(debounce);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
