// The loading grammar's primitives (placeholders that hold still):
//
// 1. Every section holds its final size before its data lands: the outer
//    frame takes the section's measured height (lib/shared/skeleton-sizes
//    defaults, refined per route by the localStorage memory layer via
//    useSkeletonSizes), so nothing beneath it moves when the data arrives.
// 2. The frame is the real card's frame (bg-raised, the edge-raised hairline,
//    the card's radius). Inside it stand a few coarse bars, one per line where
//    the main lines and figures go: rounded pills about text x-height, in the
//    hairline's colour, deliberately approximate. The frame holds the size and
//    the bars are coarse, so the inner anatomy cannot drift.
// 3. No pulse and no shimmer. A placeholder takes its space at once and
//    appears at 150 ms (`.skel-wait`, app/globals.css); the unit that replaces
//    it enters with a 120 ms fade (`.reveal-in`).
// 4. A placeholder carries no figures, hidden ones included: a slot that must
//    hold a figure's width is an empty inline-block with a min-width in ch.
//
// `SkeletonBlock` is the framed form, the main one; `SkeletonBar` is one pill,
// for a pending figure inside a real card or a bare row (a toolbar).

import type { CSSProperties, ReactNode } from "react";

/** One coarse bar. `figure` is a headline figure's line; the default is a
 *  text line. `wait` (default) delays it 150 ms; a bar inside a frame that
 *  already waits passes `false`. */
export function SkeletonBar({
  width,
  figure = false,
  wait = true,
  className = "",
}: {
  /** CSS width: px number, or a string ("60%", "6rem"). */
  width: number | string;
  figure?: boolean;
  wait?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-skel-bar=""
      className={`skel-bar ${figure ? "h-3.5" : "h-2"} ${wait ? "skel-wait" : ""} ${className}`}
      style={{ width }}
    />
  );
}

/** A figure's slot of fixed width with nothing in it: the width a figure of
 *  `ch` tabular digits takes, so the line beside it holds still. */
export function FigureSlot({ ch, className = "" }: { ch: number; className?: string }) {
  return <span aria-hidden className={`inline-block ${className}`} style={{ minWidth: `${ch}ch` }} />;
}

/** The default bars: a label line over a figure, where a card's first line
 *  and headline go. */
const DEFAULT_BARS = (
  <div className="flex flex-col gap-4">
    <SkeletonBar width="22%" wait={false} />
    <SkeletonBar width="38%" figure wait={false} />
  </div>
);

/** A section's placeholder: the card's frame at the section's height, with
 *  coarse bars inside. `bars={null}` draws the frame empty (a caller that
 *  lays words over it); `frame={false}` draws the bars on the canvas (a
 *  toolbar, a header strip). */
export function SkeletonBlock({
  height,
  bars = DEFAULT_BARS,
  frame = true,
  className = "",
  style,
}: {
  height: number;
  bars?: ReactNode;
  frame?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden
      data-skel-placeholder=""
      style={{ height, ...style }}
      className={`skel-wait overflow-hidden ${
        frame ? "rounded-2xl border border-edge-raised bg-raised px-5 py-4" : ""
      } ${className}`}
    >
      {bars}
    </div>
  );
}
