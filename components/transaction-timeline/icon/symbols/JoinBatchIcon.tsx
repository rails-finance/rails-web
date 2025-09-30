interface JoinBatchIconProps {
  x?: number;
  y?: number;
  scale?: number;
}

export function JoinBatchIcon({ x = 290, y = 80, scale = 9 }: JoinBatchIconProps) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <g transform={`scale(${scale})`}>
        <g stroke="#4C5563" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* Users icon with plus sign */}
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <path d="M16 3.128a4 4 0 0 1 0 7.744"/>
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <circle cx="9" cy="7" r="4"/>
          {/* Plus sign */}
         <g transform="translate(-36,0)">
          <circle cx="29" cy="27" r="8" fill="var(--svg-inner-bg)" stroke="green" />
          <line x1="25" x2="32" y1="27" y2="27" stroke="green" strokeWidth="2" />
          <line x1="29" x2="29" y1="24" y2="30"  stroke="green" strokeWidth="2" />
        </g>
        </g>
      </g>
    </g>
  );
}