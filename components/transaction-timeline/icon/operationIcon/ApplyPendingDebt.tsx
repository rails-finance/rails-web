import { Transaction } from "@/types/api/troveHistory";
import { SingleStepIcon } from "../layouts/SingleStepIcon";
import { MultiStepIcon } from "../layouts/MultiStepIcon";
import { RedistributionIcon } from "../symbols/RedistributionIcon";
import { PercentIcon } from "../symbols/PercentIcon";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { TimelineIconStep } from "@/types";

export function ApplyPendingDebtIcon({ tx }: { tx: Transaction }) {
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
      children: <PercentIcon isIncrease={true} />,
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

    // Single redistribution icon
    return (
      <SingleStepIcon arrowDirection="in">
        <RedistributionIcon />
      </SingleStepIcon>
    );
  }

  // Only interest
  if (hasInterest) {
    return (
      <SingleStepIcon arrowDirection="in">
        <PercentIcon isIncrease={true} />
      </SingleStepIcon>
    );
  }

  // Fallback - shouldn't happen normally
  return (
    <SingleStepIcon>
      <RedistributionIcon />
    </SingleStepIcon>
  );
}
