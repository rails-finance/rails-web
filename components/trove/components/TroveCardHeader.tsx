interface TroveCardHeaderProps {
  status: "open" | "closed" | "liquidated";
  assetType: string;
  isDelegated?: boolean;
  compact?: boolean;
}

function getProtocolConfig(assetType: string): { icon: string; className: string } {
  // For now, default to Liquity since it's the current protocol
  // In the future, this can be expanded to map different assetTypes to different protocols
  switch (assetType?.toLowerCase()) {
    case "bold":
    default:
      return {
        icon: "icon-liquity",
        className: "liquityv2",
      };
  }
}

export function TroveCardHeader({ status, assetType, isDelegated, compact = false }: TroveCardHeaderProps) {
  const { icon: protocolIcon, className: protocolClass } = getProtocolConfig(assetType);

  if (compact) {
    return (
      <div
        className={`px-4 rounded-br-lg rounded-tl-lg py-1  protocol-trove-header flex items-center justify-center ${protocolClass}`}
      >
        <div className="w-5 h-5  rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 " viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
            <use href={`#${protocolIcon}`} />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`pl-4 pr-5 rounded-br-lg rounded-tl-lg py-2 protocol-trove-header flex items-center justify-center ${protocolClass}`}
    >
      <div className="w-7 h-7 rounded-full flex items-center justify-center">
        <svg className="w-7 h-7" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <use href={`#${protocolIcon}`} />
        </svg>
      </div>
    </div>
  );
}
