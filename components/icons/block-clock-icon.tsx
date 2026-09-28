import type { SVGProps } from "react";

// "Block at a time" — a cube partly behind a clock, Miles's design. It stands
// in for the word "block" where a line states a block number (BlockRef,
// components/shared/block-ref.tsx). Lucide's 24×24 stroke grid and API
// (size, strokeWidth, className, currentColor), so it sits beside lucide icons
// at the same weight. The geometry is Miles's file unchanged: edit the paths
// only against a new drawing from him.

export interface BlockClockIconProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  size?: number | string;
  strokeWidth?: number | string;
}

export function BlockClockIcon({
  size = 24,
  strokeWidth = 2,
  color = "currentColor",
  "aria-hidden": ariaHidden = true,
  ...rest
}: BlockClockIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      {...rest}
    >
      <path d="M16 14v2.2l1.6 1" />
      <path d="M 21 8 C 20.999 7.286 20.618 6.627 20 6.27 L 13 2.27 C 12.381 1.913 11.619 1.913 11 2.27 L 4 6.27 C 3.382 6.627 3.001 7.286 3 8 L 3 16 C 3.001 16.714 3.382 17.373 4 17.73 L 8.124 19.887" />
      <path d="M 3.3 7 L 9.516 10.395" />
      <circle cx="16" cy="16" r="6" />
    </svg>
  );
}
