import { TroveLiquidationTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { AssetAction } from "../components/AssetAction";

export function LiquidateHeader({ tx }: { tx: TroveLiquidationTransaction }) {
  const { collChangeFromOperation, debtChangeFromOperation } = tx.troveOperation;
  return (
    <>
      <OperationBadge label="LIQUIDATION" color="red" />
      <div className="flex items-center gap-1">
        <AssetAction action="Liquidated" asset={tx.collateralType} amount={Math.abs(collChangeFromOperation)} alwaysShowAmount valueType="collateral" />
        <AssetAction action="Cleared" asset={tx.assetType} amount={Math.abs(debtChangeFromOperation)} alwaysShowAmount valueType="debt" />
      </div>
    </>
  );
}
