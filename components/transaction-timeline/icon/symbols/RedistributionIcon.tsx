interface RedistributionIconProps {
  x?: number;
  y?: number;
}

export function RedistributionIcon({ x = 400, y = 200 }: RedistributionIconProps) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle cx="0" cy="0" r="100" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="8" />
      <circle cx="0" cy="0" r="12" fill="#F59E0B" />
      <path
        d="M-40 -40 L-20 -20 M40 -40 L20 -20 M-40 40 L-20 20 M40 40 L20 20"
        stroke="#F59E0B"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d="M-50 0 L-25 0 M50 0 L25 0 M0 -50 L0 -25 M0 50 L0 25"
        stroke="#F59E0B"
        strokeWidth="8"
        strokeLinecap="round"
      />
    </g>
  );
}
