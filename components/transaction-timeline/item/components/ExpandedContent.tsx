import { isLiquidationTransaction, Transaction, isRedemptionTransaction } from "@/types/api/troveHistory";
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

  // Get redemption price if this is a redemption transaction
  const redemptionPrice = isRedemptionTransaction(transaction)
    ? transaction.systemRedemption?.redemptionPrice
    : null;

  // Determine if redemption price is higher or lower than market price
  const priceDiff = redemptionPrice && collateralPrice
    ? redemptionPrice - collateralPrice
    : null;

  return (
    <div className="relative">
      <div className="px-4 sm:px-6 pb-2 space-y-4">
        <TransactionStateGrid tx={tx} />

        <TransactionLinks transaction={tx} />
      </div>

      {/* Collateral price - positioned in the bottom right corner */}
      {collateralPrice && (
        <div className="absolute bottom-2 -right-0.5 flex items-center gap-1 bg-slate-200 dark:bg-slate-700 shadow-b shadow-slate-900/50 rounded-l p-2">
          <TokenIcon
            assetSymbol={transaction.collateralType}
            className="inline-block w-4 h-4 grayscale opacity-40 mr-0.5"
          />
          {redemptionPrice ? (
            <span className="text-xs flex items-center gap-1">
              <HighlightableValue
                type="redemptionPrice"
                state="after"
                className="text-orange-500 font-bold"
                value={redemptionPrice}
                variant="card"
              >
                {formatUsdValue(redemptionPrice)}
              </HighlightableValue>
              {priceDiff !== null && (
                <span className="text-slate-400">
                  {priceDiff > 0 ? '▲' : priceDiff < 0 ? '▼' : ''}
                </span>
              )}
              <span className="text-slate-400">/</span>
              <HighlightableValue
                type="collateralPrice"
                state="after"
                className="text-slate-500 font-bold"
                value={collateralPrice}
                variant="card"
              >
                {formatUsdValue(collateralPrice)}
              </HighlightableValue>
            </span>
          ) : (
            <HighlightableValue
              type="collateralPrice"
              state="after"
              className="text-xs text-slate-500 font-bold"
              value={collateralPrice}
              variant="card"
            >
              {formatUsdValue(collateralPrice)}
            </HighlightableValue>
          )}
        </div>
      )}
    </div>
  );
}
