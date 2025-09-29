import { isLiquidationTransaction, Transaction } from "@/types/api/troveHistory";
import { TransactionStateGrid } from "../../state-grid";
import { TransactionLinks } from "./TransactionLinks";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { formatUsdValue } from "@/lib/utils/format";
import { HighlightableValue } from "../../explanation/HighlightableValue";

export function ExpandedContent({ tx }: { tx: Transaction }) {
  const transaction = tx as any;

  // Get collateral price per unit in USD
  const getCollateralPricePerUnit = () => {
    // Use collateralPrice if available
    if (transaction.collateralPrice) {
      return transaction.collateralPrice;
    }

    // Otherwise calculate from total value and amount
    const state =
      transaction.operation === "liquidate" && transaction.stateBefore
        ? transaction.stateBefore
        : transaction.stateAfter;
    if (state?.collateralInUsd && state?.coll && state.coll > 0) {
      return state.collateralInUsd / state.coll;
    }

    return null;
  };

  const collateralPrice = getCollateralPricePerUnit();

  return (
    <div className="relative">
      <div className="px-4 sm:px-6 pb-2 space-y-4">
        <TransactionStateGrid tx={tx} />

        <TransactionLinks transaction={tx} />
      </div>

      {/* Collateral price - positioned in the bottom right corner */}
      {collateralPrice && (
        <div className="absolute bottom-2 right-0 flex items-center gap-1 bg-slate-700 shadow-b shadow-slate-900/50 rounded-l p-2">
          <TokenIcon assetSymbol={transaction.collateralType} />
          <HighlightableValue
            type="collateralPrice"
            state="after"
            className="text-xs text-slate-400"
            value={collateralPrice}
          >
            {formatUsdValue(collateralPrice)}
          </HighlightableValue>
        </div>
      )}
    </div>
  );
}
