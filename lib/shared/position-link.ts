// The link a position's ⋮ copies (ui-jobs 807): on the position's own page,
// the address bar, which carries the timeline's view (`hide`, `hideAssets`,
// `hideAddresses`, `from`/`to`; hooks/useTimelineEvents.ts); elsewhere the
// page's bare address.

/** The link to the position at `path`. Client only: reads `window.location`. */
export function positionLink(path: string): string {
  const here = window.location;
  const bare = (p: string) => decodeURIComponent(p.split(/[?#]/)[0]).replace(/\/+$/, "").toLowerCase();
  return bare(here.pathname) === bare(path) ? here.href : `${here.origin}${path}`;
}
