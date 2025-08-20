import { TokenIcon } from "@/components/icons/tokenIcon";

interface AssetActionProps {
  action: string;
  asset: string;
  className?: string;
}

export function AssetAction({ action, asset }: AssetActionProps) {
  return (
    <>
      <span className={`text-slate-400`}>{action}</span>
      <TokenIcon assetSymbol={asset} />
    </>
  );
}
