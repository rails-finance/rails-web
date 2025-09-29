interface PercentIncreaseIconProps {
  x?: number;
  y?: number;
  r?: number;
  fillColor?: string;
  textColor?: string;
  fontSize?: number;
}

export function PercentIncreaseIcon({ x = 210, y = 10, r = 190 }: PercentIncreaseIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width={r * 2} height={r * 2} x={x} y={y}>
      <g fill="#333333" transform="matrix(1.338017, 0, 0, 1.338017, -22.748203, -15.316317)">
        <circle
          cx="37.336"
          cy="37.336"
          r="8.336"
          style={{ fillRule: "evenodd", fill: "none", strokeWidth: "3.73687px", stroke: "rgb(255, 255, 255)" }}
        ></circle>
        <line
          x1="30"
          y1="70"
          x2="70"
          y2="30"
          strokeWidth="4"
          strokeLinecap="round"
          style={{ stroke: "rgb(255, 255, 255)" }}
        ></line>
        <circle
          cx="61.704"
          cy="64.344"
          r="8.336"
          style={{ fillRule: "evenodd", fill: "none", strokeWidth: "3.73687px", stroke: "rgb(255, 255, 255)" }}
        ></circle>
      </g>
      <path
        d="M 96.608 85.1065 H 144.474 L 144.474 76.869 L 168.99 90.1065 L 144.474 103.344 L 144.474 95.1065 H 96.608 V 85.1065 Z"
        style={{ fill: "rgb(30, 158, 0)" }}
        transform="matrix(0, -1, 1, 0, 6.50235, 186.714371)"
      ></path>
    </svg>
  );
}
