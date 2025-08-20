import { TroveTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { InterestRateBadge } from "../components/InterestRateBadge";

export function InterestRateAdjustHeader({ tx }: { tx: TroveTransaction }) {
  return (
    <>
      <OperationBadge label="SET RATE" color="purple" />
      <InterestRateBadge rate={tx.troveOperation.annualInterestRate} />
    </>
  );
}
