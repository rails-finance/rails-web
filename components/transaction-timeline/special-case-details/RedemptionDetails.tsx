import { TroveRedemptionTransaction } from "@/types/api/troveHistory";
import { RedemptionSummary } from "./RedemptionSummary";
import { ProfitLossCalculator } from "./ProfitLossCalculator";
import { ZombieStatus } from "./ZombieStatus";

export function RedemptionDetails({ tx }: { tx: TroveRedemptionTransaction }) {
  const debtCleared = Math.abs(tx.troveOperation.debtChangeFromOperation);
  const collateralRedeemed = Math.abs(tx.troveOperation.collChangeFromOperation);
  const redemptionFee = tx.systemRedemption.ETHFee;

  return (
    <div className="mt-6 p-4 space-y-2 bg-slate-800 rounded-md">
      <p className="text-slate-400 text-sm font-medium">
        Collateral was redeemed against this trove's debt.
        {tx.isZombieTrove && <span className="text-yellow-400"> This created a zombie trove.</span>}
      </p>

      <RedemptionSummary
        collateralRedeemed={collateralRedeemed}
        debtCleared={debtCleared}
        redemptionFee={redemptionFee}
      />

      <ProfitLossCalculator
        collateralRedeemed={collateralRedeemed}
        debtCleared={debtCleared}
        redemptionFee={redemptionFee}
        redemptionPrice={tx.systemRedemption.redemptionPrice}
        collateralType={tx.collateralType}
      />

      {tx.isZombieTrove && <ZombieStatus finalDebt={tx.stateAfter.debt} />}
    </div>
  );
}
