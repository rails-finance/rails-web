import { TroveTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { InterestRateBadge } from "../components/InterestRateBadge";
import { BatchManagerInfo } from "../components/BatchManagerInfo";
import { BatchIcon } from "../components/BatchIcon";
import { AssetAction } from "../components/AssetAction";
import { Image, Plus, Users } from "lucide-react";
import { getBatchManagerByAddress } from "@/lib/services/batch-manager-service";

export function OpenTroveAndJoinBatchHeader({ tx }: { tx: TroveTransaction }) {
  const { collChangeFromOperation, debtChangeFromOperation } = tx.troveOperation;
  const isJoiningExistingDelegate = tx.batchUpdate?.operation === "joinBatch";
  const isBecomingDelegate = tx.batchUpdate?.operation === "registerBatchManager";

  return (
    <div>
      <div className="flex items-center flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <OperationBadge label="OPEN" color="green" />
          <InterestRateBadge
            rate={tx.stateAfter.annualInterestRate}
            isDelegate={isJoiningExistingDelegate}
            isNewDelegate={isBecomingDelegate}
          />
          <AssetAction
            action="Supply"
            asset={tx.collateralType}
            amount={collChangeFromOperation}
            valueType="collateral"
          />
          <AssetAction action="Borrow" asset={tx.assetType} amount={debtChangeFromOperation} valueType="debt" />
          <div className="flex items-center space-x-1">
            <span className="text-slate-400 mr-1">Mint</span>
            <Image size={16} className="text-slate-300" />
          </div>
        </div>
      </div>
    </div>
  );
}
