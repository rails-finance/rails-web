import { Transaction } from "@/types/api/troveHistory";
import { SingleStepIcon } from "../layouts/SingleStepIcon";
import { PercentIcon } from "../symbols/PercentIcon";

export function InterestRateAdjustIcon({ tx }: { tx: Transaction }) {
  const rateAfter = tx.stateAfter.annualInterestRate;
  const rateBefore = tx.stateBefore?.annualInterestRate;

  const isIncrease = (rateBefore && rateAfter > rateBefore) || false;

  return (
    <SingleStepIcon>
      <PercentIcon isIncrease={isIncrease} />
    </SingleStepIcon>
  );
}
