interface PercentDecreaseIconProps {
  x?: number;
  y?: number;
  r?: number;
  fillColor?: string;
  textColor?: string;
  fontSize?: number;
}

export function PercentDecreaseIcon({ x = 210, y = 10, r = 190 }: PercentDecreaseIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width={r * 2} height={r * 2} x={x} y={y}>
      <g fill="#333333" transform="matrix(1.338017, 0, 0, 1.338017, -22.748203, -15.316317)">
        <circle
          cx="37.336"
          cy="37.336"
          r="8.336"
          style={{ fillRule: "evenodd", fill: "none", strokeWidth: "3.73687px", stroke: "currentColor" }}
        ></circle>
        <line
          x1="30"
          y1="70"
          x2="70"
          y2="30"
          strokeWidth="4"
          strokeLinecap="round"
          style={{ stroke: "currentColor" }}
        ></line>
        <circle
          cx="61.704"
          cy="64.344"
          r="8.336"
          style={{ fillRule: "evenodd", fill: "none", strokeWidth: "3.73687px", stroke: "currentColor" }}
        ></circle>
      </g>
      <path
        d="M 63.123 4.205 H 106.873 L 106.873 -6.854 L 136.364 7.892 L 106.873 22.637 L 106.873 11.578 H 63.123 V 4.205 Z"
        style={{ fill: "rgb(255, 0, 0)" }}
        transform="matrix(0, 1, -1, 0, 104.434189, -46.090397)"
      ></path>
    </svg>
  );
}
