interface ExitBatchIconProps {
  x?: number;
  y?: number;
  scale?: number;
}

export function ExitBatchIcon({ x = 290, y = 80, scale = 9 }: ExitBatchIconProps) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <g transform={`scale(${scale})`}>
        <g stroke="#4C5563" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* Users icon with minus sign */}
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
          <path d="M16 3.128a4 4 0 0 1 0 7.744" opacity="0.4"/>
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" opacity="0.4"/>
          <circle cx="9" cy="7" r="4"/>
          {/* Minus sign */}
         <g transform="translate(3,0)">
          <circle cx="29" cy="27" r="8" fill="#171B24" stroke="red"  />
          <line x1="26" x2="32" y1="27" y2="27" stroke="red" strokeWidth="2" />
        </g>
        </g>
      </g>
    </g>
  );
}