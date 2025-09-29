interface TransferTroveIconProps {
  x?: number;
  y?: number;
  r?: number;
  fillColor?: string;
  textColor?: string;
  fontSize?: number;
}

export function TransferTroveIcon({ x = 210, y = 10, r = 190 }: TransferTroveIconProps) {
  return (
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" width={r * 2} height={r * 2} x={x} y={y}>
      {/* Green arc (top-right to bottom) */}
      <path
        d="M 125 45
               A 55 55 0 0 1 175 100
               A 55 55 0 0 1 125 155"
        stroke="#22C55E"
        strokeWidth="20"
        fill="none"
        strokeLinecap="round"
      />

      {/* Red arc (bottom-left to top) */}
      <path
        d="M 75 155
               A 55 55 0 0 1 25 100
               A 55 55 0 0 1 75 45"
        stroke="#EF4444"
        strokeWidth="20"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
