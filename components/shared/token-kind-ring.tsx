// The ring round a token icon that names what kind of token the mark stands
// for. Pendle's PT and YT wear Pendle's PT green or YT blue
// (`--color-pendle-*`, app/globals.css), the colours the Pendle app gives the
// two tokens and the ring Aave draws round PT collateral, so a reader coming
// from either sees the same split. Polaris's fpETH, vpETH and svpETH wear
// pETH's mark inside a ring (ui-jobs 871): fpETH, the floor part, a calm ring
// in the muted-text grey (rb-500); vpETH, the part above the floor, a brighter
// ring in purple, the hue of pETH's mark; svpETH, staked vpETH, vpETH's ring
// with a small lock in the top-right corner, the one corner the spine's badges
// leave free.
//
// The ring sits inside the icon's box, the mark shrunk to fit with a gap of
// page ground between them, so a ringed node keeps the footprint of a bare one
// and the corner badges sit on top of it. Pendle's LP and SY take no ring; the
// flank unit names them.

import { Lock } from "lucide-react";
import type { ReactNode } from "react";

export type TokenKindRing = "pt" | "yt" | "fpeth" | "vpeth" | "svpeth";

const RING_CLASS: Record<TokenKindRing, string> = {
  pt: "border-pendle-pt-ink dark:border-pendle-pt",
  yt: "border-pendle-yt-ink dark:border-pendle-yt",
  fpeth: "border-rb-500",
  vpeth: "border-purple-600 dark:border-purple-400",
  svpeth: "border-purple-600 dark:border-purple-400",
};

/** The flank unit's text in the ring's hue: the -ink shade in light mode,
 *  the hue in dark. */
export const RING_UNIT_CLASS: Record<TokenKindRing, string> = {
  pt: "text-pendle-pt-ink dark:text-pendle-pt",
  yt: "text-pendle-yt-ink dark:text-pendle-yt",
  fpeth: "text-rb-500",
  vpeth: "text-purple-600 dark:text-purple-400",
  svpeth: "text-purple-600 dark:text-purple-400",
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
      {ring === "svpeth" && <StakedMark size={size} offset={width} />}
    </span>
  );
}

/** svpETH's staked mark: a disc in the ring's purple at the icon's top-right
 *  corner, a white lock in it from a 10px disc (an icon of 28px), with the
 *  corner badges' ring of page ground. `offset` is the ring's width: the disc
 *  is placed against the icon's box, outside the border. */
function StakedMark({ size, offset }: { size: number; offset: number }) {
  const d = Math.max(6, Math.round(size * 0.36));
  return (
    <span
      className="absolute inline-flex items-center justify-center rounded-full bg-purple-600 text-white dark:bg-purple-400 dark:text-rb-900"
      style={{
        top: -offset,
        right: -offset,
        width: d,
        height: d,
        boxShadow: "0 0 0 1.5px var(--spine-ground, var(--background))",
      }}
      data-staked-mark=""
      aria-hidden
    >
      {d >= 10 && <Lock size={Math.round(d * 0.64)} strokeWidth={3} aria-hidden />}
    </span>
  );
}
