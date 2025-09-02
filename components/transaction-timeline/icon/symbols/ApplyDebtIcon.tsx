interface ApplyDebtIconProps {
  x?: number;
  y?: number;
  r?: number;
  fillColor?: string;
  textColor?: string;
  fontSize?: number;
}

export function ApplyDebtIcon({
  x = 210,
  y = 10,
  r = 190,
}: ApplyDebtIconProps) {
  return (
    <foreignObject 
      x={x} 
      y={y} 
      width={r * 2} 
      height={r * 2}
    >
      <img 
        src="/icons/icons.004.png" 
        alt="Apply Debt"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
        }}
      />
    </foreignObject>
  );
}