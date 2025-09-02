import { Transaction } from "@/types/api/troveHistory";
import { SingleStepIcon } from "../layouts/SingleStepIcon";
import { IconWrapper } from "../base/IconWrapper";
import { PercentIncreaseIcon } from "../symbols/PercentIncreaseIcon";
import { PercentDecreaseIcon } from "../symbols/PercentDecreaseIcon";

export function InterestRateAdjustIcon({ tx }: { tx: Transaction }) {
  const rateAfter = tx.stateAfter.annualInterestRate;
  const rateBefore = tx.stateBefore?.annualInterestRate;
  const isIncrease = (rateBefore && rateAfter > rateBefore) || false;
  const isDelegated = 'isInBatch' in tx && tx.isInBatch;

  const iconContent = isIncrease ? <PercentIncreaseIcon /> : <PercentDecreaseIcon />;

  if (isDelegated) {
    // Delegated operations don't have outer circle
    return (
      <div className="transaction-single" style={{ position: "relative", zIndex: 1 }}>
        <div className="transaction-step step-single">
          <IconWrapper>
            {iconContent}
          </IconWrapper>
        </div>
      </div>
    );
  }

  // Regular operations have outer circle
  return (
    <SingleStepIcon>
      {iconContent}
    </SingleStepIcon>
  );
}
