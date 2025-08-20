interface RedemptionSummaryProps {
  collateralRedeemed: number;
  debtCleared: number;
  redemptionFee: number;
}

export function RedemptionSummary({ collateralRedeemed, debtCleared, redemptionFee }: RedemptionSummaryProps) {
  return (
    <div className="mt-2 text-sm text-slate-400">
      <div className="flex justify-between">
        <span>- Collateral Redeemed</span>
        <span>{collateralRedeemed} ETH</span>
      </div>
      <div className="flex justify-between">
        <span>- Debt Cleared</span>
        <span>{debtCleared} BOLD</span>
      </div>
      <div className="flex justify-between">
        <span>+ Compensation (redemption fee)</span>
        <span>{redemptionFee} ETH</span>
      </div>
    </div>
  );
}
