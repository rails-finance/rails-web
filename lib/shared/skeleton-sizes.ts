// The skeleton size vocabulary: every loading placeholder is a stack of solid
// blocks, one per REAL page section, and this module names those sections and
// carries their measured default heights. Defaults were read from the live
// pages (getBoundingClientRect on each [data-skel-section] element) at the lg
// viewport — /spark for the listing shape, a settled /spark/<wallet> detail for
// the detail shape, /compound/markets for the table shape — then refined per
// route by the localStorage memory layer (skeleton-size-store) on top.

export type SkeletonSection =
  | "listing-header-extra"
  | "listing-toolbar"
  | "listing-row"
  | "detail-card"
  | "detail-economics"
  | "detail-timeline-header"
  | "detail-event"
  | "page-header"
  | "page-table";

// Measured lg-bucket (1440×900) values, 2026-07-25 (see header comment for
// route provenance). Whole px. `page-table` measured 2022px on
// /compound/markets — past the memory layer's 16–900 sanity band and past any
// viewport — so it holds the 900 ceiling instead: below the first ~900px the
// two paint identically, and default and memory stay on one scale.
export const DEFAULT_SKELETON_SIZES: Record<SkeletonSection, number> = {
  "listing-header-extra": 24,
  "listing-toolbar": 68,
  "listing-row": 150,
  "detail-card": 220,
  "detail-economics": 232,
  "detail-timeline-header": 28,
  "detail-event": 56,
  "page-header": 376,
  "page-table": 900,
};

/** Route → stable shape key: id-like segments collapse to "*", so
 *  `/ethereum/liquity-v2/trove/WETH/1234` keys as /liquity-v2/trove with both trailing
 *  segments starred — every trove on a protocol shares one remembered size,
 *  while `/ethereum/compound-v3/markets` keeps its own. Id-like = hex (addresses, hashes),
 *  numeric (trove / market #), long opaque ids, or anything carrying an
 *  uppercase letter (token / vault symbols — the static route segments here
 *  are all lowercase). */
export function routeShapeKey(pathname: string): string {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((raw) => {
      let s = raw;
      try {
        s = decodeURIComponent(raw);
      } catch {
        // Malformed escape — key on the raw segment.
      }
      if (/^0x[0-9a-fA-F]+$/.test(s)) return "*"; // addresses / hashes
      if (/^\d+$/.test(s)) return "*"; // numeric ids (trove #, market #)
      if (s.length > 24) return "*"; // any other long opaque id
      if (/[A-Z]/.test(s)) return "*"; // token / vault symbols
      return s;
    });
  return "/" + segments.join("/");
}

/** Tailwind-aligned viewport bucket: below `sm` (640) → "sm", below `lg`
 *  (1024) → "md", else "lg". Sizes are remembered per bucket because the real
 *  sections reflow across these breakpoints. */
export function viewportBucket(width: number): "sm" | "md" | "lg" {
  if (width < 640) return "sm";
  if (width < 1024) return "md";
  return "lg";
}
