import { isLiquidationTransaction, Transaction, isRedemptionTransaction, TroveRedemptionTransaction } from "@/types/api/troveHistory";
import { TransactionStateGrid } from "../../state-grid";
import { TransactionLinks } from "./TransactionLinks";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { formatUsdValue } from "@/lib/utils/format";
import { HighlightableValue } from "../../explanation/HighlightableValue";

export function ExpandedContent({ tx, previousTx, currentPrice }: { tx: Transaction; previousTx?: Transaction; currentPrice?: number }) {
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

  // Get liquidation price if this is a liquidation transaction
  const liquidationPrice = isLiquidationTransaction(transaction)
    ? transaction.systemLiquidation?.price
    : null;

  // Get redemption price if this is a redemption transaction
  const redemptionPrice = isRedemptionTransaction(transaction)
    ? transaction.systemRedemption?.redemptionPrice
    : null;

  // Determine if redemption price is higher or lower than market price
  const priceDiff = redemptionPrice && collateralPrice
    ? redemptionPrice - collateralPrice
    : null;

  // Compute per-redemption P/L
  const redemptionPL = isRedemptionTransaction(transaction) ? (() => {
    const redemption = transaction as TroveRedemptionTransaction;
    const debtRedeemed = Math.abs(redemption.troveOperation.debtChangeFromOperation);
    const collLost = Math.abs(redemption.troveOperation.collChangeFromOperation);
    const marketPrice = redemption.collateralPrice;
    const realizedPL = marketPrice ? debtRedeemed - collLost * marketPrice : null;
    const opportunityPL = currentPrice ? debtRedeemed - collLost * currentPrice : null;
    return { realizedPL, opportunityPL };
  })() : null;

  return (
    <div>
      <div className="px-4 sm:px-6 pb-2 space-y-4">
        <TransactionStateGrid tx={tx} previousTx={previousTx} />
      </div>

      {/* Gas cost and collateral price container - organic responsive layout */}
      <div className="px-4 sm:px-6 pb-2 flex flex-wrap-reverse justify-between items-center gap-2">
        <TransactionLinks transaction={tx} />

        {/* Redemption P/L text (left) + price badge (right) */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 grow">
          {/* Per-redemption P/L */}
          {redemptionPL?.realizedPL != null && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
              <span className="text-slate-500">Net outcome</span>
              <HighlightableValue
                type="netOutcome"
                state="change"
                className={redemptionPL.realizedPL >= 0
                  ? "text-green-700 dark:text-green-400"
                  : "text-red-700 dark:text-red-400"
                }
                value={redemptionPL.realizedPL}
                variant="card"
              >
                {redemptionPL.realizedPL >= 0 ? "+" : "\u2212"}{formatUsdValue(Math.abs(redemptionPL.realizedPL))}
              </HighlightableValue>
              {redemptionPL.opportunityPL != null && (
                <>
                  <span className="text-slate-500">or</span>
                  <HighlightableValue
                    type="netOutcome"
                    state="after"
                    className={redemptionPL.opportunityPL >= 0
                      ? "text-green-700 dark:text-green-400"
                      : "text-red-700 dark:text-red-400"
                    }
                    value={redemptionPL.opportunityPL}
                    variant="card"
                  >
                    {redemptionPL.opportunityPL >= 0 ? "+" : "\u2212"}{formatUsdValue(Math.abs(redemptionPL.opportunityPL))}
                  </HighlightableValue>
                  <span className="text-slate-500">today</span>
                </>
              )}
            </div>
          )}

          {/* Transaction-specific price - pulled to the right with negative margin */}
          {/* Shows liquidation price (red), redemption price (orange), or collateral price (gray) */}
          {(collateralPrice || redemptionPrice || liquidationPrice) && (
            <div className="flex justify-end -mr-4.5 sm:-mr-7 sm:ml-auto self-end">
              <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-700 shadow-b shadow-slate-900/50 rounded p-2">
                <TokenIcon
                  assetSymbol={transaction.collateralType}
                  className="inline-block w-4 h-4 grayscale opacity-40 mr-0.5"
                />
                {liquidationPrice ? (
                  <HighlightableValue
                    type="currentPrice"
                    state="after"
                    className="text-xs text-slate-500 font-bold"
                    value={liquidationPrice}
                    variant="card"
                  >
                    {formatUsdValue(liquidationPrice)}
                  </HighlightableValue>
                ) : redemptionPrice && collateralPrice && Math.abs(redemptionPrice - collateralPrice) > 0.1 ? (
                  <span className="text-xs flex items-center gap-1">
                    <HighlightableValue
                      type="redemptionPrice"
                      state="after"
                      className="text-orange-400 font-bold"
                      value={redemptionPrice}
                      variant="card"
                    >
                      {formatUsdValue(redemptionPrice)}
                    </HighlightableValue>
                  </span>
                ) : redemptionPrice ? (
                  <HighlightableValue
                    type="redemptionPrice"
                    state="after"
                    className="text-xs text-orange-400 font-bold"
                    value={redemptionPrice}
                    variant="card"
                  >
                    {formatUsdValue(redemptionPrice)}
                  </HighlightableValue>
                ) : collateralPrice ? (
                  <HighlightableValue
                    type="collateralPrice"
                    state="after"
                    className="text-xs text-slate-500 font-bold"
                    value={collateralPrice}
                    variant="card"
                  >
                    {formatUsdValue(collateralPrice)}
                  </HighlightableValue>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
