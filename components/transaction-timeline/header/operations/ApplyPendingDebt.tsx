import { TroveTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { AssetAction } from "../components/AssetAction";

export function ApplyPendingDebtHeader({ tx }: { tx: TroveTransaction }) {
  const { debtIncreaseFromRedist, collIncreaseFromRedist, debtChangeFromOperation } = tx.troveOperation;

  const hasRedistribution = debtIncreaseFromRedist > 0 || collIncreaseFromRedist > 0;
  const hasInterest = debtChangeFromOperation > 0;

  return (
    <>
      <OperationBadge label="BATCH MANAGER UPDATE" color="purple" />
      <div className="flex items-center gap-1">
        {hasRedistribution && (
          <>
            <span className="text-slate-400">Redistribution applied</span>
            {collIncreaseFromRedist > 0 && <AssetAction action="+" asset={tx.collateralType} />}
            {debtIncreaseFromRedist > 0 && <AssetAction action="+" asset={tx.assetType} />}
          </>
        )}
        {hasInterest && (
          <>
            {hasRedistribution && <span className="text-slate-500">•</span>}
            <AssetAction
              action="Interest applied"
              asset={tx.assetType}
              amount={debtChangeFromOperation}
              alwaysShowAmount
              valueType="debt"
            />
          </>
        )}
      </div>
    </>
  );
}
