interface TransferTroveIconProps {
  x?: number;
  y?: number;
  r?: number;
  fillColor?: string;
  textColor?: string;
  fontSize?: number;
}

export function TransferTroveIcon({
  x = 210,
  y = 10,
  r = 190,
}: TransferTroveIconProps) {
  return (
    <foreignObject 
      x={x} 
      y={y} 
      width={r * 2} 
      height={r * 2}
    >
      <img 
        src="/icons/icons.003.png" 
        alt="Transfer Trove"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
        }}
      />
    </foreignObject>
  );
}