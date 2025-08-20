interface ProfitLossCalculatorProps {
  collateralRedeemed: number;
  debtCleared: number;
  redemptionFee: number;
  redemptionPrice: number;
  collateralType: string;
}

export function ProfitLossCalculator({
  collateralRedeemed,
  debtCleared,
  redemptionFee,
  redemptionPrice,
  collateralType,
}: ProfitLossCalculatorProps) {
  // Calculate profit/loss
  const collateralValueUsd = collateralRedeemed * redemptionPrice;
  const feeValueUsd = redemptionFee * redemptionPrice;
  const netLoss = collateralValueUsd - debtCleared - feeValueUsd;
  const isProfit = netLoss < 0;
  const netAmount = Math.abs(netLoss);

  return (
    <div className="space-y-2">
      <div className="flex justify-between py-2 border-b border-t border-slate-500">
        <span>{collateralType}/USD</span>
        <span>{redemptionPrice}</span>
      </div>

      <div className="text-slate-400 text-xs">
        Net impact
        <span className={`font-medium ${isProfit ? "text-green-400" : "text-red-400"}`}>
          {isProfit ? " +" : " -"}
          {netAmount}
        </span>
        <span className="ml-1 text-slate-400">
          {isProfit ? "profit" : "loss"} after fee compensation. Based on {collateralRedeemed} ETH redeemed (
          {collateralValueUsd}) - {debtCleared} BOLD debt - {redemptionFee} ETH fee received (feeValueUsd)
        </span>
      </div>
    </div>
  );
}
