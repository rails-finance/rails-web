const TEAR_R = 7.5;

const NUB_PATH =
  "M 0 10 C 0.039 9.998 0.078 9.996 0.117 9.994 C 7.253 8.192 11.311 0.058 17.709 0.058 C 18.55 0.058 21.552 0.059 22.389 0.059 C 28.784 0.059 32.841 8.186 39.971 9.993 C 40.013 9.995 40.056 9.997 40.098 9.999 L 39.996 9.999 C 39.997 9.999 39.999 10 40 10 L 0 10 Z";

/**
 * ArrowFromDot — directional arrow with a dot endpoint,
 * used in the icon column to indicate token flow direction.
 */
export function ArrowFromDot({ direction, size = 28 }: { direction: "left" | "right"; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-rb-500 shrink-0"
      style={{ transform: direction === "left" ? "rotate(-90deg)" : "rotate(90deg)" }}
      aria-hidden="true"
    >
      <path d="m5 9 7-7 7 7" />
      <path d="M12 22V2" />
    </svg>
  );
}
