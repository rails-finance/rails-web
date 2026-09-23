export interface OraclePricesData {
  weth: number;
  reth: number;
  wsteth: number;
}

export interface OraclePricesResponse {
  success: boolean;
  data?: OraclePricesData;
  error?: string;
}
