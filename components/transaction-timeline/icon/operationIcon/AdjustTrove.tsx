import { Transaction } from "@/types/api/troveHistory";
import { SingleStepIcon } from "../layouts/SingleStepIcon";
import { MultiStepIcon } from "../layouts/MultiStepIcon";
import { TimelineIconStep } from "@/types";
import { TokenIcon } from "@/components/icons/tokenIcon";

export function AdjustTroveIcon({ tx }: { tx: Transaction }) {
  const { debtChangeFromOperation, collChangeFromOperation } = tx.troveOperation;
  const debtChange = debtChangeFromOperation !== 0;
  const collChange = collChangeFromOperation !== 0;

  const debtIncrease = debtChangeFromOperation > 0; // Borrow
  const collIncrease = collChangeFromOperation > 0; // Deposit

  // Multi-step if both change
  if (debtChange && collChange) {
    let firstStep: TimelineIconStep;
    let secondStep: TimelineIconStep;

    if (debtIncrease && collIncrease) {
      // Borrow + Deposit
      firstStep = {
        children: <TokenIcon assetSymbol={tx.assetType} isTimeline />,
        arrowDirection: "in",
      };
      secondStep = {
        children: <TokenIcon assetSymbol={tx.collateralType} isTimeline />,
        arrowDirection: "out",
      };
    } else if (!debtIncrease && !collIncrease) {
      // Repay + Withdraw
      firstStep = {
        children: <TokenIcon assetSymbol={tx.collateralType} isTimeline />,
        arrowDirection: "in",
      };
      secondStep = {
        children: <TokenIcon assetSymbol={tx.assetType} isTimeline />,
        arrowDirection: "out",
      };
    } else if (!debtIncrease && collIncrease) {
      // Repay + Deposit (both TO protocol)
      firstStep = {
        children: <TokenIcon assetSymbol={tx.assetType} isTimeline />,
        arrowDirection: "out",
      };
      secondStep = {
        children: <TokenIcon assetSymbol={tx.collateralType} isTimeline />,
        arrowDirection: "out",
      };
    } else {
      // Withdraw + Borrow (both FROM protocol)
      firstStep = {
        children: <TokenIcon assetSymbol={tx.collateralType} isTimeline />,
        arrowDirection: "in",
      };
      secondStep = {
        children: <TokenIcon assetSymbol={tx.assetType} isTimeline />,
        arrowDirection: "in",
      };
    }

    return <MultiStepIcon firstStep={firstStep} secondStep={secondStep} />;
  }

  // Single step
  if (debtChange) {
    return (
      <SingleStepIcon arrowDirection={debtIncrease ? "in" : "out"}>
        <TokenIcon assetSymbol={tx.assetType} isTimeline />
      </SingleStepIcon>
    );
  }

  if (collChange) {
    return (
      <SingleStepIcon arrowDirection={collIncrease ? "out" : "in"}>
        <TokenIcon assetSymbol={tx.collateralType} isTimeline />
      </SingleStepIcon>
    );
  }

  // Fallback (shouldn't happen)
  return (
    <SingleStepIcon>
      <TokenIcon assetSymbol={tx.collateralType} isTimeline />
    </SingleStepIcon>
  );
}
