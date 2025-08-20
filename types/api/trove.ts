// Type definitions for Trove API responses

export interface TroveBackedBy {
  amount: number;
  amountRaw: string; // Raw value from DB (NUMERIC stored as string)
  valueUsd: number;
  symbol: string; // "WETH", "wstETH", or "rETH"
  peakAmount: number;
  peakAmountRaw: string; // Raw value from DB (NUMERIC stored as string)
}

export interface TroveMetrics {
  interestRate: number;
  redemptionCount: number;
  collateralRatio: number;
}

export interface TroveActivity {
  created: number;
  lastActivity: number;
  lifetimeDays: number;
  transactionCount: number;
}

export interface TroveBatchMembership {
  isMember: boolean;
  batchManager: string | null;
  batchInterestRate: number;
  managementFeeRate: number;
}

export interface TroveData {
  troveId: string;
  assetType: string; // Set based on protocol_id (e.g., "bold" for liquity-v2)
  collateralType: string; // "WETH", "wstETH", or "rETH"
  status: "open" | "closed" | "liquidated";
  mainValue: number; // Current debt value formatted
  mainValueRaw: string; // Current debt value raw from DB (NUMERIC stored as string)
  peakValue: number; // Peak debt value formatted
  peakValueRaw: string; // Peak debt value raw from DB (NUMERIC stored as string)
  backedBy: TroveBackedBy;
  metrics: TroveMetrics;
  activity: TroveActivity;
  walletAddress: string | null;
  walletEns: null; // Always null for now
  batchMembership: TroveBatchMembership;
}

// API Response types
export interface TrovesResponse {
  data: TroveData[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface TrovesQueryParams {
  limit?: number;
  offset?: number;
  status?: "open" | "closed" | "liquidated";
  collateralType?: string;
  walletAddress?: string;
  troveId?: string;
}

// Helper functions
export function getAssetTypeFromProtocol(protocolId: string): string {
  switch (protocolId) {
    case "liquity-v2":
      return "bold";
    default:
      return "unknown";
  }
}
