import { TokenIcon } from "@/components/icons/tokenIcon";

interface AssetActionProps {
  action: string;
  asset: string;
  amount?: number;
  className?: string;
  alwaysShowAmount?: boolean;
}

export function AssetAction({ action, asset, amount, alwaysShowAmount = false }: AssetActionProps) {
  return (
    <div className="flex items-center space-x-1">
      <span className="text-slate-400 mr-1">{action}</span>
      {amount && <span className={`font-medium ${alwaysShowAmount ? '' : 'sm:hidden'}`}>{amount}</span>}
      <TokenIcon assetSymbol={asset} />
    </div>
  );
}
