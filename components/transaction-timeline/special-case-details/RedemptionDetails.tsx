import { TroveRedemptionTransaction } from "@/types/api/troveHistory";
import { ZombieStatus } from "./ZombieStatus";

export function RedemptionDetails({ tx }: { tx: TroveRedemptionTransaction }) {
  // Note: Detailed redemption info is now shown in RedeemCollateralExplanation
  // This component is kept minimal to avoid duplication

  return (
    <div className="mt-6 p-4 space-y-2 bg-slate-800 rounded-md">
      <p className="text-slate-400 text-sm font-medium">
        Collateral was redeemed against this trove's debt.
        {tx.isZombieTrove && <span className="text-yellow-400"> This created a zombie trove.</span>}
      </p>

      {tx.isZombieTrove && <ZombieStatus finalDebt={tx.stateAfter.debt} />}
    </div>
  );
}
