interface PercentIncreaseIconProps {
  x?: number;
  y?: number;
  r?: number;
  fillColor?: string;
  textColor?: string;
  fontSize?: number;
}

export function PercentIncreaseIcon({
  x = 400,
  y = 200,
  r = 100,
  fillColor = "#64748b",
  textColor = "white",
  fontSize = 120,
}: PercentIncreaseIconProps) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle cx="0" cy="0" r={r} fill={fillColor} />
      <text x="0" y="25" textAnchor="middle" fill={textColor} fontSize={fontSize} fontWeight="bold">
        %
      </text>
      <g transform="translate(80, 40)">
        <circle cx="0" cy="0" r="40" fill="#10B981" />
        <path d="M-20 0 L20 0" stroke="white" strokeWidth="6" strokeLinecap="round" />
        <path d="M0 -20 L0 20" stroke="white" strokeWidth="6" strokeLinecap="round" />
      </g>
    </g>
  );
}