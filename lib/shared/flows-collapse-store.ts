// Which protocols the reader has put the Lifetime-flows tower away on
// (ui-jobs 61). ONE STORED VALUE PER PROTOCOL, keyed by the roster id the
// route already carries (`protocolForPathname(...)?.id`, which is chain-
// qualified and unique): Aave V4 can be expanded while Liquity V2 is
// collapsed, and every position page inside a protocol reads its protocol's
// setting, so putting the tower away on one Aave V4 position puts it away on
// all of them. That is Miles's ruling, 2026-09-25 — the panel is tall and the
// reader who has finished with it has finished with it for that protocol, not
// for one address in it.
//
// Only COLLAPSED protocols are stored — absence means expanded — so the map
// only ever holds the explorers the reader has actually put away, and the
// default stays the tower on show.
//
// Reads tolerate SSR (no `window`) and malformed JSON by answering "expanded",
// matching lib/shared/card-open-store.ts. What does NOT match it is the read
// path on the page: an event card restores in a post-mount effect and a
// collapsed tower restored that way would flash open first, the panel being
// several hundred pixels tall. So the section also carries `collapseScript()`,
// a pre-paint inline script in the ThemeScript idiom that sets the attribute
// the CSS hides the body on before the browser paints. The effect still runs
// and is what React renders from afterwards; the script only covers the frames
// before it.

import { protocolForPathname } from "@/lib/shared/protocols";

const STORAGE_KEY = "rails-flows-collapsed-v1";

/** The key a ROUTE collapses under (ui-jobs 63): the roster id of the explorer
 *  the route sits inside. Every position and trove page reaches the tower this
 *  way, so the chevron and the stored setting arrive without a prop threaded
 *  through the two dozen call sites that draw it.
 *
 *  Null off the rails, and null on an explorer's own LISTING route. A listing
 *  draws no tower today, so the second guard buys nothing now; it is what keeps
 *  a future roster or coverage surface that did draw one from picking up the
 *  protocol's key and collapsing with the position pages. The case the key is
 *  for is a route BELOW the listing: a position, a trove, a vault holder under
 *  a sub-page. */
export function flowsCollapseKeyForPathname(pathname: string | null): string | null {
  const entry = protocolForPathname(pathname);
  if (!entry || pathname === entry.href) return null;
  return entry.id;
}

/** The attribute the pre-paint script writes and `app/globals.css` reads.
 *  "1" collapsed, "0" expanded. */
export const COLLAPSED_ATTR = "data-flows-collapsed";
/** The attribute the script reads its key from, set on the same element. */
export const COLLAPSE_KEY_ATTR = "data-flows-collapse-key";

function readMap(): Record<string, true> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, true>) : {};
  } catch {
    return {};
  }
}

export function isFlowsCollapsed(key: string): boolean {
  return readMap()[key] === true;
}

export function setFlowsCollapsed(key: string, collapsed: boolean): void {
  if (typeof window === "undefined") return;
  const map = readMap();
  if (collapsed) map[key] = true;
  else delete map[key];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

/** The pre-paint script's source, for a `<script dangerouslySetInnerHTML>` as
 *  the FIRST CHILD of the section it is about: it reads its key off
 *  `document.currentScript.parentElement`, so the section needs no id and two
 *  towers could never read each other's. Silent on every failure — a reader
 *  with storage blocked gets the default, which is the tower on show. */
export function collapseScript(): string {
  return `(function(){try{var e=document.currentScript.parentElement;var k=e.getAttribute(${JSON.stringify(COLLAPSE_KEY_ATTR)});if(!k)return;var m=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||"{}");e.setAttribute(${JSON.stringify(COLLAPSED_ATTR)},m[k]===true?"1":"0");}catch(_){}})();`;
}
