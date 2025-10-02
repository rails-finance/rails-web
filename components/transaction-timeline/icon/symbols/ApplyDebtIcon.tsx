interface ApplyDebtIconProps {
  x?: number;
  y?: number;
  r?: number;
  fillColor?: string;
  textColor?: string;
  fontSize?: number;
}

export function ApplyDebtIcon({ x = 210, y = 10, r = 190 }: ApplyDebtIconProps) {
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
      <g transform="matrix(0.673252, 0, 0, 0.673252, 90.413162, 51.66016)">
        <circle cx="0" cy="0" r="20" fill="#22C55E"></circle>
        <path d="M 0 -10 L 0 10 M -10 0 L 10 0" stroke="currentColor" strokeWidth="4" strokeLinecap="round"></path>
      </g>
    </svg>
  );
}
