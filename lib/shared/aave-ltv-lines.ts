/**
 * The two loan-to-value lines of an Aave-family position's markdown export.
 * The first is the current ratio, debt over collateral from the chain read's
 * own totals, with the liquidation threshold. The second is the account's
 * maximum LTV (`getUserAccountData`'s `ltv`, the collateral-weighted cap on
 * borrowing), which reads 0 when every collateral reserve has its LTV set to 0.
 */

export interface AaveLtvRead {
  totalCollateralUsd: number;
  totalDebtUsd: number;
  /** Maximum LTV as a fraction (0.75 = 75%). */
  ltv: number;
  /** Average liquidation threshold as a fraction. */
  avgLiquidationThreshold: number;
}

const pct = (fraction: number): string => `${Number((fraction * 100).toFixed(1))}%`;

export function aaveLtvLines(chain: AaveLtvRead): string[] {
  const lines: string[] = [];
  if (chain.totalCollateralUsd > 0) {
    lines.push(
      `- **Loan-to-value:** ${pct(chain.totalDebtUsd / chain.totalCollateralUsd)} (debt over collateral); liquidation at ${pct(chain.avgLiquidationThreshold)}`,
    );
  }
  lines.push(
    chain.ltv > 0
      ? `- **Maximum loan-to-value:** ${pct(chain.ltv)}`
      : "- **Maximum loan-to-value:** 0%, so the account can borrow no more",
  );
  return lines;
}
