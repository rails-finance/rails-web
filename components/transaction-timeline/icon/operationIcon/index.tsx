import { Transaction } from "@/types/api/troveHistory";
import { OpenTroveIcon } from "./OpenTrove";
import { CloseTroveIcon } from "./CloseTrove";
import { AdjustTroveIcon } from "./AdjustTrove";
import { LiquidateIcon } from "./Liquidate";
import { RedeemCollateralIcon } from "./RedeemCollateral";
import { SetBatchManagerIcon } from "./SetBatchManager";
import { RemoveFromBatchIcon } from "./RemoveFromBatch";
import { InterestRateAdjustIcon } from "./InterestRateAdjust";
import { TransferTroveIcon } from "./TransferTrove";
import { ApplyPendingDebtIcon } from "./ApplyPendingDebt";
import { OpenTroveAndJoinBatchIcon } from "./OpenTroveAndJoinBatch";
import { SingleStepIcon } from "../layouts/SingleStepIcon";
import { Circle } from "../base/Circle";

// Internal component for selecting the right icon based on operation
export function OperationIcon({ tx }: { tx: Transaction }) {
  switch (tx.operation) {
    case "openTrove":
      return <OpenTroveIcon tx={tx} />;

    case "closeTrove":
      return <CloseTroveIcon tx={tx} />;

    case "adjustTrove":
      return <AdjustTroveIcon tx={tx} />;

    case "adjustTroveInterestRate":
      return <InterestRateAdjustIcon tx={tx} />;

    case "applyPendingDebt":
      return <ApplyPendingDebtIcon tx={tx} />;

    case "liquidate":
      return <LiquidateIcon />;

    case "redeemCollateral":
      return <RedeemCollateralIcon />;

    // batch management
    case "openTroveAndJoinBatch":
      return <OpenTroveAndJoinBatchIcon tx={tx} />;

    case "setInterestBatchManager":
      return <SetBatchManagerIcon />;

    case "removeFromBatch":
      return <RemoveFromBatchIcon />;

    // case "transferTrove":
    //   return <TransferTroveIcon />;

    default:
      return <DefaultIcon />;
  }
}

// Default icon for unknown/missing operations
function DefaultIcon() {
  return (
    <SingleStepIcon>
      <Circle cx={400} cy={200} r={100} fill="#DC2626" />
    </SingleStepIcon>
  );
}
