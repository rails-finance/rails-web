// The ring round a Pendle PT or YT icon: Pendle's PT green or YT blue
// (`--color-pendle-*`, app/globals.css), the colours the Pendle app gives the
// two tokens and the ring Aave draws round PT collateral, so a reader coming
// from either sees the same split. The ring sits inside the icon's box, the
// mark shrunk to fit with a gap of page ground between them, so a ringed node
// keeps the footprint of a bare one and the corner badges sit on top of it.
// LP and SY take no ring; the flank unit names them.

import type { ReactNode } from "react";

export type TokenKindRing = "pt" | "yt";

const RING_CLASS: Record<TokenKindRing, string> = {
  pt: "border-pendle-pt-ink dark:border-pendle-pt",
  yt: "border-pendle-yt-ink dark:border-pendle-yt",
};

/** The flank unit's text in the ring's hue: the -ink shade in light mode,
 *  the hue in dark. */
export const RING_UNIT_CLASS: Record<TokenKindRing, string> = {
  pt: "text-pendle-pt-ink dark:text-pendle-pt",
  yt: "text-pendle-yt-ink dark:text-pendle-yt",
};

/** The ring's width and gap at an icon of `size` px: about 8% of the
 *  diameter for the ring (3px at 32, 2px at 20), 1px of ground inside it. */
function ringMetrics(size: number) {
  const width = Math.max(1, Math.round(size * 0.08));
  return { width, gap: 1, inner: size - 2 * (width + 1) };
}

/** The mark's size inside a ring on an icon of `size` px. */
export const kindRingInner = (size: number) => ringMetrics(size).inner;

/** A ring of `size` px round `children`, a mark drawn at kindRingInner(size). */
export function KindRing({ ring, size, children }: { ring: TokenKindRing; size: number; children: ReactNode }) {
  const { width } = ringMetrics(size);
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full border-solid ${RING_CLASS[ring]}`}
      style={{ width: size, height: size, borderWidth: width }}
      data-anatomy="L3.1"
      data-kind-ring={ring}
    >
      {children}
    </span>
  );
}
