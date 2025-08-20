import { TokenIcon } from "@/components/icons/tokenIcon";

interface AssetActionProps {
  action: string;
  asset: string;
  amount?: number;
  className?: string;
}

export function AssetAction({ action, asset, amount }: AssetActionProps) {
  return (
    <div className="flex items-center space-x-1">
      <span className="text-slate-400 mr-1">{action}</span>
      {amount && <span className="font-medium">{amount}</span>}
      <TokenIcon assetSymbol={asset} />
    </div>
  );
}
