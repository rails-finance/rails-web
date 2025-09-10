import { Transaction, isTroveTransaction } from "@/types/api/troveHistory";
import { SingleStepIcon } from "../layouts/SingleStepIcon";
import { MultiStepIcon } from "../layouts/MultiStepIcon";
import { IconWrapper } from "../base/IconWrapper";
import { RedistributionIcon } from "../symbols/RedistributionIcon";
import { ApplyDebtIcon } from "../symbols/ApplyDebtIcon";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { TimelineIconStep } from "@/types";

export function ApplyPendingDebtIcon({ tx }: { tx: Transaction }) {
  if (!isTroveTransaction(tx)) {
    return (
      <SingleStepIcon arrowDirection="in">
        <ApplyDebtIcon />
      </SingleStepIcon>
    );
  }
  
  const { debtIncreaseFromRedist, collIncreaseFromRedist, debtChangeFromOperation } = tx.troveOperation;

  const hasRedistribution = debtIncreaseFromRedist > 0 || collIncreaseFromRedist > 0;
  const hasInterest = debtChangeFromOperation > 0;

  // If both redistribution and interest, show multi-step
  if (hasRedistribution && hasInterest) {
    const firstStep: TimelineIconStep = {
      children: <RedistributionIcon />,
      arrowDirection: "in",
    };
    const secondStep: TimelineIconStep = {
      children: <ApplyDebtIcon />,
      arrowDirection: "in",
    };
    return <MultiStepIcon firstStep={firstStep} secondStep={secondStep} />;
  }

  // Only redistribution
  if (hasRedistribution) {
    // If both collateral and debt redistribution, could show multi-step
    if (collIncreaseFromRedist > 0 && debtIncreaseFromRedist > 0) {
      const firstStep: TimelineIconStep = {
        children: <TokenIcon assetSymbol={tx.collateralType} isTimeline />,
        arrowDirection: "in",
      };
      const secondStep: TimelineIconStep = {
        children: <TokenIcon assetSymbol={tx.assetType} isTimeline />,
        arrowDirection: "in",
      };
      return <MultiStepIcon firstStep={firstStep} secondStep={secondStep} />;
    }

    // Single redistribution icon - no outer circle since this is a batch manager action
    return (
      <div className="transaction-single" style={{ position: "relative", zIndex: 1 }}>
        <div className="transaction-step step-single">
          <IconWrapper>
            <RedistributionIcon />
          </IconWrapper>
        </div>
      </div>
    );
  }

  // Only interest - no outer circle since this is a batch manager action
  if (hasInterest) {
    return (
      <div className="transaction-single" style={{ position: "relative", zIndex: 1 }}>
        <div className="transaction-step step-single">
          <IconWrapper>
            <ApplyDebtIcon />
          </IconWrapper>
        </div>
      </div>
    );
  }

  // Fallback - shouldn't happen normally - no outer circle
  return (
    <div className="transaction-single" style={{ position: "relative", zIndex: 1 }}>
      <div className="transaction-step step-single">
        <IconWrapper>
          <RedistributionIcon />
        </IconWrapper>
      </div>
    </div>
  );
}
