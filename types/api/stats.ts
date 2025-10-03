// Simple stats types - just the essentials

export interface CollateralStats {
  totalDebt: number;
  totalCollateral: number;
  totalCollateralUsd: number;
  troveCount: number;
  openTroveCount: number;
}

export interface ProtocolStats {
  overall: CollateralStats;
  byCollateral: {
    [collateralType: string]: CollateralStats;
  };
}

export interface StatsResponse {
  success: boolean;
  data: ProtocolStats;
  error?: string;
}
