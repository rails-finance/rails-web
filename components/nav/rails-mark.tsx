import type { CSSProperties } from "react";

// The mark against a line of type (the hero's h1, the phone bar's brand): the right-hand leg of RailsMark (viewBox
// 0 0 200 200), from the top of its upper segment (y 47.853) to the foot of the
// lower step (y 142.388), is one cap height. The negative block margins leave a
// margin box of exactly that leg, so the line box ignores the rest of the mark
// and baseline alignment puts the leg's foot on the baseline. The negative left
// margin starts the box at the long stroke's ink (x 20.295), so the line's
// measured width runs from ink to ink.
const STROKE_LEFT = 20.295;
const STROKE_TOP = 47.853;
const STROKE_BOTTOM = 142.388;
const CAP = STROKE_BOTTOM - STROKE_TOP;
export const MARK_CAP_STYLE = {
  width: `${200 / CAP}cap`,
  height: `${200 / CAP}cap`,
  marginTop: `${-STROKE_TOP / CAP}cap`,
  marginBottom: `${-(200 - STROKE_BOTTOM) / CAP}cap`,
  marginLeft: `${-STROKE_LEFT / CAP}cap`,
  marginRight: "0.16em",
  verticalAlign: "baseline",
} as const;

/** The Rails mark: three bars, the first two at 85%. Drawn by the rail's glyph
 *  (H1), the header bar's mark (H2) and the home hero's h1 (S1), which
 *  sizes it in cap units through `style` and draws it `uniform`. */
export function RailsMark({
  size,
  className,
  style,
  uniform = false,
}: {
  size: number;
  className?: string;
  style?: CSSProperties;
  /** All three bars at 85%, one tone (the hero's h1, ui-jobs 498). */
  uniform?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      style={style}
      viewBox="0 0 200 200"
      fill="none"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        style={{ opacity: 0.85 }}
        d="M 79.763 159.671 L 111.637 159.671 L 52.168 41.625 L 20.295 41.625 L 79.763 159.671 Z"
      />
      <path
        fill="currentColor"
        style={{ opacity: 0.85 }}
        d="M 98.578 97.056 L 130.451 97.056 L 105.044 47.853 L 73.171 47.853 L 98.578 97.056 Z"
      />
      <path
        fill="currentColor"
        style={uniform ? { opacity: 0.85 } : undefined}
        d="M 148.892 142.388 L 180.766 142.388 L 155.359 93.185 L 123.486 93.185 L 148.892 142.388 Z"
      />
    </svg>
  );
}
