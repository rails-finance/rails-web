interface TroveCardHeaderProps {
  status: "open" | "closed" | "liquidated";
  assetType: string;
  isDelegated?: boolean;
}

export function TroveCardHeader({ status, assetType, isDelegated }: TroveCardHeaderProps) {
  const statusBadge = () => {
    switch (status) {
      case "open":
        return <span className="text-xs font-semibold px-2 py-1 bg-green-900 text-green-400 rounded">OPEN</span>;
      case "liquidated":
        return <span className="text-xs font-semibold px-2 py-1 bg-red-900 text-red-400 rounded">LIQUIDATED</span>;
      default:
        return <span className="text-xs font-semibold px-2 py-1 bg-slate-800 text-slate-400 rounded">CLOSED</span>;
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <span className="mr-2 text-slate-200 font-bold">{assetType.toUpperCase()} LOAN</span>
          {statusBadge()}
          {isDelegated && status === "open" && (
            <span className="text-xs font-semibold px-2 py-1 bg-blue-900 text-blue-400 rounded ml-2">DELEGATED</span>
          )}
        </div>
      </div>
    </div>
  );
}