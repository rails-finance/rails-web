interface PercentIncreaseIconProps {
  x?: number;
  y?: number;
  r?: number;
  fillColor?: string;
  textColor?: string;
  fontSize?: number;
}

export function PercentIncreaseIcon({
  x = 210,
  y = 10,
  r = 190,
}: PercentIncreaseIconProps) {
  return (
    <foreignObject 
      x={x} 
      y={y} 
      width={r * 2} 
      height={r * 2}
    >
      <img 
        src="/icons/icons.002.png" 
        alt="Percent Increase"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
        }}
      />
    </foreignObject>
  );
}