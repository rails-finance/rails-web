// Type definitions for Trove API responses

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
  owner: string | null; // Current owner address
  ownerEns: string | null; // ENS name (future feature)

  // Status
  status: "open" | "closed" | "liquidated";
  collateralType: string; // "WETH", "wstETH", or "rETH"

  // Core data
  debt: TroveDebt; // Debt information
  collateral: TroveCollateral; // Collateral information

  // Additional info
  metrics: TroveMetrics; // Performance metrics
  activity: TroveActivity; // Activity tracking
  batch: TroveBatch; // Batch membership
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
