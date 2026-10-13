const TEAR_R = 7.5;

const NUB_PATH =
  "M 0 10 C 0.039 9.998 0.078 9.996 0.117 9.994 C 7.253 8.192 11.311 0.058 17.709 0.058 C 18.55 0.058 21.552 0.059 22.389 0.059 C 28.784 0.059 32.841 8.186 39.971 9.993 C 40.013 9.995 40.056 9.997 40.098 9.999 L 39.996 9.999 C 39.997 9.999 39.999 10 40 10 L 0 10 Z";

/**
 * ArrowFromDot — the flank pointer beside a leg's glyph: a small filled
 * triangle on the amount's side, its base against the 32 px node's edge and
 * its tip pointing in `direction`, toward the amount (ui-jobs 331). It draws
 * inside the 18 px flank cell of `.spine-grid` and keeps to the glyph side of
 * it. The ink is `color` when given (a warning leg passes its tone, the same
 * ink as its glyph and dotted line) and the neutral grey otherwise (an owner
 * leg).
 */
export function ArrowFromDot({
  direction,
  size = 18,
  color,
}: {
  direction: "left" | "right";
  size?: number;
  color?: string;
}) {
  const w = Math.round(size * 0.44);
  const h = Math.round(size * 0.5);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fill="currentColor"
      className={`shrink-0 ${color ? "" : "text-rb-500 "}${direction === "left" ? "justify-self-end -mr-px" : "justify-self-start -ml-px"}`}
      style={color ? { color } : undefined}
      aria-hidden="true"
      data-spine-pointer={direction}
    >
      <path d={direction === "left" ? `M${w} 0V${h}L0 ${h / 2}Z` : `M0 0V${h}L${w} ${h / 2}Z`} />
    </svg>
  );
}
