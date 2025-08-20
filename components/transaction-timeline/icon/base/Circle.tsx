interface CircleProps {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
}

export function Circle({ cx, cy, r, fill, stroke, strokeWidth = 0 }: CircleProps) {
  return <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
}
