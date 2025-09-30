interface NFTIconProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export function NFTIcon({ x = 290, y = 90, width = 220, height = 220 }: NFTIconProps) {
  return (
    <svg viewBox="0 0 120 120" x={x} y={y} width={width} height={height}>
      <circle cx="60" cy="60" r="50" fill="#FB923C" stroke="#F97316" strokeWidth="4" />
      <rect x="40" y="40" width="40" height="40" rx="4" fill="currentColor" stroke="currentColor" strokeWidth="2" />
      <circle cx="70" cy="50" r="8" fill="#FB923C" />
      <path d="M35 85 L60 60 L85 85 Z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
