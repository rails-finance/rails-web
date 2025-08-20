interface TokenIconProps {
  assetSymbol?: string;
  // For timeline SVG positioning
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  // For regular usage
  className?: string;
  // Explicit flag for timeline usage
  isTimeline?: boolean;
}

export const TokenIcon = ({
  assetSymbol,
  x,
  y,
  width,
  height,
  className = "inline-block w-4 h-4 mr-1",
  isTimeline = false,
}: TokenIconProps) => {
  let iconId: string;
  switch (assetSymbol?.toLowerCase()) {
    case "eth":
    case "weth":
      iconId = "icon-eth";
      break;
    case "reth":
      iconId = "icon-reth";
      break;
    case "steth":
    case "wsteth":
      iconId = "icon-wsteth";
      break;
    case "bold":
      iconId = "icon-bold";
      break;
    default:
      iconId = "icon-default";
      break;
  }

  if (isTimeline) {
    return <use href={`#${iconId}`} x={290} y={90} width={220} height={220} />;
  }

  // Otherwise render for regular usage
  return (
    <svg className={className} viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <use href={`#${iconId}`} />
    </svg>
  );
};
