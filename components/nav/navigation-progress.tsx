"use client";

/** Navigation progress bar — a click is acknowledged within a frame, on every route.
 *
 *  It covers ONE wait: the click → the new route commits. The wait that follows
 *  (skeleton → settled rows) is the skeleton's job; a bar stretched over data
 *  loading would need every page to report that its data had landed, which no
 *  page does.
 *
 *  Why it listens at the document rather than wrapping each link: 91 files
 *  import `next/link` and three navigate with `router.push`
 *  (morpho-market-link, detail-back-row, wallet-pill). A pair of click
 *  listeners covers the 91 (why a pair: at the effect below); the three call
 *  `startNavigationProgress()`.
 *
 *  Why it is written here and not installed: `nextjs-toploader` and its kind
 *  patch `history.pushState`, which breaks across Next upgrades. Next 15.5.7 /
 *  React 19.1 App Router, 2026-09-21.
 *
 *  Reading the bar from a test: it stamps `data-nav-progress` with the state it
 *  is in — "running" while a navigation is outstanding, "done" while it runs out
 *  and fades, absent when idle (`claims-carry-their-proof.md`, "read a page only
 *  in a state it has declared"). `scripts/verify/verify-nav-progress.mjs` reads
 *  that marker, not the transform.
 */

import { Suspense, useCallback, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Nothing is drawn for this long, so a prefetched navigation that commits in
 *  60 ms never flashes a bar. */
const DRAW_DELAY_MS = 120;
/** The quick run off the left edge: 0 → 30% over this, then the easing climb. */
const RISE_MS = 180;
/** How fast the climb approaches 90% once the run is done. */
const CLIMB_MS = 1400;
/** A navigation that is cancelled, or that redirects to the URL it started
 *  from, never changes the pathname and so never finishes the bar. Clear it. */
const STALL_MS = 15000;
/** The run-out to 100% and the fade that follows it. */
const FINISH_MS = 140;
const FADE_MS = 200;

/** 0 → 0.3 over RISE_MS, then an easing climb that approaches 0.9 without
 *  reaching it. Continuous at the join (0.9 − 0.6 = 0.3). */
function widthAt(elapsed: number): number {
  if (elapsed <= RISE_MS) return 0.3 * (elapsed / RISE_MS);
  return 0.9 - 0.6 * Math.exp(-(elapsed - RISE_MS) / CLIMB_MS);
}

/** Set by the mounted component. The module-level indirection is what lets the
 *  three `router.push` callers start the bar without a context or a prop. */
let startFromOutside: () => void = () => {};

/** Start the bar for a navigation this module cannot see — a `router.push`.
 *  Pass the href being pushed: a push to the URL already showing never changes
 *  the pathname, so it would hold the bar until STALL_MS (a wallet pill on a
 *  listing already filtered to that wallet). A no-op before the component
 *  mounts, and on the server. */
export function startNavigationProgress(href?: string): void {
  if (href != null && typeof window !== "undefined") {
    try {
      const url = new URL(href, window.location.href);
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
    } catch {
      return;
    }
  }
  startFromOutside();
}

function NavigationProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const bar = useRef<HTMLDivElement | null>(null);
  const frame = useRef<number | null>(null);
  const began = useRef<number | null>(null);
  /** pathname + search of the route that last committed. */
  const committed = useRef<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const reduced = () =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const paint = useCallback((scale: number, opacity: number) => {
    const el = bar.current;
    if (!el) return;
    el.style.transform = `scaleX(${scale})`;
    el.style.opacity = String(opacity);
  }, []);

  const reset = useCallback(() => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null;
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    began.current = null;
    const el = bar.current;
    if (el) {
      el.style.transition = "none";
      el.removeAttribute("data-nav-progress");
      paint(0, 0);
    }
  }, [paint]);

  const begin = useCallback(() => {
    // A second click restarts the run rather than stacking a second bar.
    reset();
    began.current = performance.now();
    const el = bar.current;
    if (el) el.dataset.navProgress = "running";

    if (reduced()) {
      // No movement: a full-width bar at reduced opacity, still held back by
      // DRAW_DELAY_MS so a fast navigation shows nothing at all.
      timers.current.push(setTimeout(() => paint(1, 0.4), DRAW_DELAY_MS));
    } else {
      const tick = (now: number) => {
        const elapsed = now - (began.current ?? now) - DRAW_DELAY_MS;
        if (elapsed >= 0) paint(widthAt(elapsed), 1);
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    }
    timers.current.push(setTimeout(reset, STALL_MS));
  }, [paint, reset]);

  const finish = useCallback(() => {
    if (began.current == null) return;
    const drawn = performance.now() - began.current >= DRAW_DELAY_MS;
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null;
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    began.current = null;

    const el = bar.current;
    if (!el) return;
    el.dataset.navProgress = "done";
    if (!drawn) {
      // Never drawn, so there is nothing to run out — the whole point of the
      // delay is that a fast navigation is silent.
      reset();
      return;
    }
    if (reduced()) {
      timers.current.push(setTimeout(reset, FADE_MS));
      return;
    }
    el.style.transition = `transform ${FINISH_MS}ms ease-out`;
    paint(1, 1);
    timers.current.push(
      setTimeout(() => {
        const node = bar.current;
        if (node) node.style.transition = `opacity ${FADE_MS}ms ease-out`;
        paint(1, 0);
      }, FINISH_MS),
    );
    timers.current.push(setTimeout(reset, FINISH_MS + FADE_MS));
  }, [paint, reset]);

  // Start: a plain left click on a same-origin link that changes the URL, and
  // that nothing inside the link consumed.
  //
  // Two listeners, because one cannot tell. Card rows are whole <Link>s with
  // controls inside them — copy buttons, the bookmark star, a provenance pick,
  // a touch reveal — and each of those calls preventDefault + stopPropagation
  // so the card does not navigate. `closest("a[href]")` finds the card's link
  // from any of them, and `defaultPrevented` cannot separate the cases because
  // Next's Link prevents default on every click it navigates. What does
  // separate them is propagation: React dispatches at the document, so a
  // handler's stopPropagation keeps the click from reaching `window`, and a
  // Link's navigation does not. So the capture listener at the document picks
  // out the candidate click, and the bubble listener on `window` starts the bar
  // only if that same click arrived.
  useEffect(() => {
    startFromOutside = begin;
    let candidate: MouseEvent | null = null;

    const onClickCapture = (e: MouseEvent) => {
      candidate = null;
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // A hash-only change is not a navigation — same document, no wait.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      candidate = e;
    };

    const onClickArrived = (e: MouseEvent) => {
      if (e !== candidate) return;
      candidate = null;
      begin();
    };

    // Back/forward. The guard is what matters here: Next 15.5 restores a
    // history entry from the tree it stored in `history.state`, and its own
    // popstate listener (registered before this one) commits that route in the
    // same task — so by the time this runs, the finish effect has usually
    // recorded the new URL and there is no wait to cover. Without the guard the
    // bar started AFTER the commit and held until STALL_MS on every back step
    // (measured 2026-09-21, verify-nav-progress). The browser also fires
    // popstate for a hash-only step, which the same comparison leaves alone.
    const onPop = () => {
      if (window.location.pathname + window.location.search === committed.current) return;
      begin();
    };

    document.addEventListener("click", onClickCapture, true);
    window.addEventListener("click", onClickArrived);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("click", onClickArrived);
      window.removeEventListener("popstate", onPop);
      if (startFromOutside === begin) startFromOutside = () => {};
      reset();
    };
  }, [begin, reset]);

  // Finish: the route has committed. On first mount there is nothing running
  // and `finish` returns at once.
  useEffect(() => {
    committed.current = window.location.pathname + window.location.search;
    finish();
    // `searchParams` is a fresh object per navigation, which is the signal for
    // a search-only change (?folders=0). Its identity is the dependency.
  }, [pathname, searchParams, finish]);

  return (
    <div
      ref={bar}
      aria-hidden="true"
      data-nav-progress-bar=""
      // z above the header (z-40), the chain switcher's overlay (z-50) and the
      // bookmarks modal (z-[9999]): the acknowledgement of a click must never
      // be the thing that is covered. It is 2px and pointer-events-none, so
      // sitting on top costs nothing.
      className="pointer-events-none fixed inset-x-0 top-0 z-[10000] h-0.5 origin-left"
      style={{
        background: "var(--text-link)",
        transform: "scaleX(0)",
        opacity: 0,
        willChange: "transform, opacity",
      }}
    />
  );
}

/** `useSearchParams` opts its subtree into client rendering; without the
 *  boundary the build fails on every static route. */
export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressBar />
    </Suspense>
  );
}
