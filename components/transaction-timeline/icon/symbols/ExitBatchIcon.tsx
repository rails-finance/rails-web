interface ExitBatchIconProps {
  x?: number;
  y?: number;
  scale?: number;
}

export function ExitBatchIcon({ x = 290, y = 80, scale = 12 }: ExitBatchIconProps) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <g transform={`scale(${scale})`}>
        <path 
          fill="#ef4444" // RED - leaving/exiting
          d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"
        />
      </g>
    </g>
  );
}