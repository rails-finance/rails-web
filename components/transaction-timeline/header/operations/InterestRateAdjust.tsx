import { TroveTransaction } from "@/types/api/troveHistory";
import { InterestRateBadge } from "../components/InterestRateBadge";

export function InterestRateAdjustHeader({ tx }: { tx: TroveTransaction }) {
  const oldRate = tx.stateBefore.annualInterestRate;
  const newRate = tx.troveOperation.annualInterestRate;
  const isIncrease = newRate > oldRate;
  const rateChangeText = isIncrease ? "Increase interest rate" : "Decrease interest rate";

  return (
    <>
      <span className="text-slate-400 font-medium">{rateChangeText}</span>
      <InterestRateBadge rate={tx.troveOperation.annualInterestRate} />
    </>
  );
}
