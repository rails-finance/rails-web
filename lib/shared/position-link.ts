// The link a position's ⋮ copies (ui-jobs 807): on the position's own page,
// the timeline's view (`hide`, `hideAssets`, `hideAddresses`, `from`/`to`;
// hooks/useTimelineEvents.ts), which the page's timeline registers here; the
// address bar where no timeline has; elsewhere the page's bare address. The
// address bar alone would miss a saved view on a load where nothing was
// toggled, since the hook writes no param before a toggle.

let viewLink: (() => string) | null = null;

/** The page's timeline registers its view link. */
export function registerViewLink(fn: () => string): void {
  viewLink = fn;
}

/** A timeline unmounting clears the slot only while it holds that timeline's
 *  link, so a second timeline's stays. */
export function unregisterViewLink(fn: () => string): void {
  if (viewLink === fn) viewLink = null;
}

/** The link to the position at `path`. Client only: reads `window.location`. */
export function positionLink(path: string): string {
  const here = window.location;
  const bare = (p: string) => decodeURIComponent(p.split(/[?#]/)[0]).replace(/\/+$/, "").toLowerCase();
  if (bare(here.pathname) !== bare(path)) return `${here.origin}${path}`;
  return viewLink ? viewLink() : here.href;
}
