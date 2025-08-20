import { Transaction } from "@/types/api/troveHistory";
import { MIN_DEBT } from "@/lib/constants";

export function ZombieWarning({ tx }: { tx: Transaction }) {
  const finalDebt = tx.stateAfter.debt;
  const finalCollateral = tx.stateAfter.coll;

  return (
    <div className="p-4 rounded-lg border border-orange-400/50 bg-orange-700/10">
      <div className="flex items-start space-x-2">
        <span className="text-yellow-500 text-lg">⚠️</span>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-yellow-400 mb-1">Zombie Trove Created</h3>
          <p className="text-xs text-yellow-300/90 mb-2">
            This redemption has left your trove with {finalDebt === 0 ? "zero" : `${finalDebt}`} BOLD debt, below the{" "}
            {MIN_DEBT} BOLD minimum. Your trove is now in "zombie" state.
          </p>
          <ul className="text-xs text-yellow-300/90 space-y-0.5">
            <li>• Your trove remains open and keeps its collateral ({finalCollateral} ETH)</li>
            <li>• It cannot be redeemed further while in this state</li>
            <li>• To revive it: borrow at least {MIN_DEBT} BOLD</li>
            <li>• It can still receive redistributions</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
