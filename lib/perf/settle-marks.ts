// ============================================================================
// SETTLE MARKS — §3.4 of rails-ops/playbooks/load-time-investigation.md
// ============================================================================
//
// Client-side waterfall instrumentation for the H4 hypothesis: pages paint
// fast but *settle* on bundle stream → hydrate → mount fetch in series. These
// marks are the only measurement that sees that sequence — server timings and
// curl matrices end at the HTML.
//
// The waterfall, as points on one clock:
//   nav-start      listing row click (soft nav, handed off via sessionStorage)
//                  or the document's own navigation start (hard load)
//   shell-mounted  the route's client shell ran its first effect — bundle
//                  loaded, hydrated, RSC payload applied
//   <label> start  a mount fetch left the component
//   <label> end    its JSON parsed
//   <label> settled two animation frames later — the state update has painted
//
// Everything is epoch-ms (Date.now): performance.now() is per-document, and
// the whole point of the sessionStorage handoff is to keep one clock across a
// soft navigation. ±1ms granularity is fine for 100ms-scale questions.
//
// Off by default in production builds. Enable on a deployed app with ?perf in
// the URL or localStorage.railsPerf = "1" — dev builds are always on but are
// NOT representative for H4 (dev bundles are unminified and uncached; measure
// the deployed app before drawing conclusions). Output: a console.table per
// settled page view, re-printed if later marks extend the view.

const HANDOFF_KEY = "rails:settle-nav-start";
const HANDOFF_MAX_AGE_MS = 30_000;
const REPORT_QUIET_MS = 600;

interface MarkRow {
  point: string;
  /** ms since nav-start */
  at: number;
}

let navStart: number | null = null;
let navMode: "soft" | "hard" = "hard";
let navTarget = "";
let rows: MarkRow[] = [];
let reportTimer: ReturnType<typeof setTimeout> | null = null;

function enabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV === "development") return true;
  try {
    return new URLSearchParams(window.location.search).has("perf") || window.localStorage.getItem("railsPerf") === "1";
  } catch {
    return false;
  }
}

/** Listing side: call on the row link click, before navigation. */
export function markNavStart(target: string): void {
  if (!enabled()) return;
  // A soft nav stays in this document, so this module instance survives the
  // navigation — reset the clock here directly, or a second row click would
  // keep accumulating on the first click's clock. The sessionStorage handoff
  // below only matters when the click ends in a new document (hard load).
  navStart = Date.now();
  navMode = "soft";
  navTarget = target;
  rows = [];
  try {
    window.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ target, t: navStart }));
  } catch {
    // storage unavailable (private mode) — the view degrades to hard-load timing
  }
}

/** Adopt a pending handoff (once) or fall back to the document clock. */
function ensureNavStart(): number {
  if (navStart != null) return navStart;
  navMode = "hard";
  navTarget = window.location.pathname;
  navStart = performance.timeOrigin;
  try {
    const raw = window.sessionStorage.getItem(HANDOFF_KEY);
    if (raw) {
      window.sessionStorage.removeItem(HANDOFF_KEY);
      const parsed = JSON.parse(raw) as { target: string; t: number };
      if (Date.now() - parsed.t < HANDOFF_MAX_AGE_MS) {
        navMode = "soft";
        navTarget = parsed.target;
        navStart = parsed.t;
      }
    }
  } catch {
    // unreadable handoff — keep the hard-load clock
  }
  rows = [];
  return navStart;
}

/** Record one waterfall point. */
export function settleMark(point: string): void {
  if (!enabled()) return;
  const at = Date.now() - ensureNavStart();
  rows.push({ point, at });
  scheduleReport();
}

/**
 * Bracket a mount fetch. Call at fetch start; invoke the returned closure once
 * the JSON has parsed — it records the end AND, two animation frames later,
 * the settled point (by then React has painted the state update; "two" because
 * the first frame can be the one already in flight).
 */
export function settleFetchMark(label: string): (ok: boolean) => void {
  if (!enabled()) return () => {};
  settleMark(`${label} start`);
  return (ok: boolean) => {
    settleMark(ok ? `${label} end` : `${label} FAILED`);
    if (!ok) return;
    requestAnimationFrame(() => requestAnimationFrame(() => settleMark(`${label} settled`)));
  };
}

function scheduleReport(): void {
  if (reportTimer != null) clearTimeout(reportTimer);
  reportTimer = setTimeout(() => {
    reportTimer = null;
    if (rows.length === 0) return;
    const sorted = [...rows].sort((a, b) => a.at - b.at);
    // eslint-disable-next-line no-console
    console.log(`[settle] ${navTarget} — ${navMode} nav, ${Math.round(sorted[sorted.length - 1].at)}ms to last mark`);
    // eslint-disable-next-line no-console
    console.table(sorted.map((r) => ({ point: r.point, "ms since nav": Math.round(r.at) })));
  }, REPORT_QUIET_MS);
}
