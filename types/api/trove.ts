// Type definitions for Trove API responses

// Trove Economics - aggregate financial metrics
export interface TroveEconomics {
  // Redemption metrics
  redemption: {
    totalDebtCleared: number;               // Sum of all debt cleared by redemptions
    totalCollateralLost: number;            // Sum of collateral sent to redeemers (in coll units)
    totalCollateralValueAtRedemption: number; // Collateral × price at each redemption
    totalFeesRetained: number;              // Redemption fees kept in trove
    realizedPL: number;                     // debtCleared - collValueAtRedemption
  } | null;  // null if no redemptions

  // Liquidation metrics
  liquidation: {
    totalDebtCleared: number;              // Sum of debt cleared by liquidations
    totalCollateralSeized: number;         // Collateral taken by liquidation (excluding surplus)
    totalCollateralSurplus: number;        // Claimable surplus collateral
  } | null;  // null if no liquidations

  // Gas costs
  gas: {
    totalGasUsed: number;                   // Sum of gas across all txs
    totalGasCostEth: number;                // Total gas in ETH
    totalGasCostUsd: number;                // Total gas in USD (at time of each tx)
  };

  // Interest & fees
  costs: {
    totalInterestPaid: number;              // Cumulative interest accrued
    totalUpfrontFees: number;               // Sum of debtIncreaseFromUpfrontFee
    totalManagementFees: number;            // Batch management fees (if applicable)
  };

  // Overall position summary
  position: {
    totalBorrowed: number;                  // Sum of all debt increases
    totalRepaid: number;                    // Sum of all debt repayments
    totalCollateralDeposited: number;       // Sum of all collateral deposits
    totalCollateralWithdrawn: number;       // Sum of all collateral withdrawals
    netCollateralChange: number;            // deposited - withdrawn - liquidated - redeemed
  };
}

// Collateral information
export interface TroveCollateral {
  amount: number; // Current collateral amount
  amountRaw: string; // Raw value from DB (wei)
  valueUsd: number; // Current USD value
  symbol: string; // "WETH", "wstETH", or "rETH"
  peakAmount: number; // Historical peak collateral
  peakAmountRaw: string; // Peak raw value (wei)
}

// Debt position
export interface TroveDebt {
  current: number; // Current debt in BOLD
  currentRaw: string; // Raw debt value (wei)
  peak: number; // Historical peak debt
  peakRaw: string; // Peak raw value (wei)
}

// Performance metrics
export interface TroveMetrics {
  collateralRatio: number; // Current collateral ratio (%)
  interestRate: number; // Annual interest rate (%)
}

// Activity tracking
export interface TroveActivity {
  createdAt: number; // Unix timestamp of creation
  lastActivityAt: number; // Unix timestamp of last activity
  lifetimeDays: number; // Days since creation
  transactionCount: number; // Total transaction count
  redemptionCount: number; // Number of redemptions
}

// Batch membership details
export interface TroveBatch {
  isMember: boolean; // Currently in a batch
  manager: string | null; // Batch manager address
  interestRate: number; // Batch interest rate (%)
  managementFee: number; // Management fee rate (%)
}

// Main trove summary data
export interface TroveSummary {
  // Identifiers
  id: string; // Trove NFT ID
  owner: string | null; // Current owner address (null if closed)
  lastOwner: string | null; // Last known owner (preserved after closure)
  ownerEns: string | null; // ENS name (future feature)

  // Status
  status: "open" | "closed" | "liquidated";
  isZombie: boolean; // Zombie trove (debt < 2000 BOLD with coll > 0)
  collateralType: string; // "WETH", "wstETH", or "rETH"
  assetType: string; // "BOLD", "afUSD", etc.
  protocolId: string; // "liquity_v2", etc.

  // Core data
  debt: TroveDebt; // Debt information
  collateral: TroveCollateral; // Collateral information

  // Additional info
  metrics: TroveMetrics; // Performance metrics
  activity: TroveActivity; // Activity tracking
  batch: TroveBatch; // Batch membership

  // Economics (optional - may be provided by backend or calculated client-side)
  economics?: TroveEconomics;
}

// API response wrapper
export interface TrovesResponse {
  success: boolean;
  data: TroveSummary[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
  };
  error?: string;
}
