interface ConnectorProps {
  x: number;
  y1: number;
  y2: number;
  strokeColor?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  className?: string;
}

export function Connector({
  x,
  y1,
  y2,
  strokeColor = '#45556C',
  strokeWidth = 20,
  strokeDasharray = 'none',
  className = ''
}: ConnectorProps) {
  return (
    <line 
      className={`svg-stroke ${className}`}
      x1={x} 
      y1={y1} 
      x2={x} 
      y2={y2} 
      stroke={strokeColor} 
      strokeWidth={strokeWidth}
      strokeDasharray={strokeDasharray}
    />
  );
}