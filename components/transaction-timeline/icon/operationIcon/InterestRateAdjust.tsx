import { Transaction } from "@/types/api/troveHistory";
import { SingleStepIcon } from "../layouts/SingleStepIcon";
import { PercentIncreaseIcon } from "../symbols/PercentIncreaseIcon";
import { PercentDecreaseIcon } from "../symbols/PercentDecreaseIcon";

export function InterestRateAdjustIcon({ tx }: { tx: Transaction }) {
  const rateAfter = tx.stateAfter.annualInterestRate;
  const rateBefore = tx.stateBefore?.annualInterestRate;

  const isIncrease = (rateBefore && rateAfter > rateBefore) || false;

  return (
    <SingleStepIcon>
      {isIncrease ? <PercentIncreaseIcon /> : <PercentDecreaseIcon />}
    </SingleStepIcon>
  );
}
