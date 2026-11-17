// The live reads behind a Polaris deposit page and a reserve-loan page, as the
// two /api/chain/polaris routes answer them (lib/sources/chain/polaris-sp.ts,
// lib/sources/chain/polaris-loan.ts). Raw integer strings beside the block
// they were read at; the pages scale them.

import type { PolarisMarket } from "@/lib/polaris/asset-catalog";

export interface PolarisDepositChain {
  market: PolarisMarket;
  tokenId: string;
  blockNumber: number;
  blockTimestamp: number;
  /** getCompoundedStableTokenDeposit(id): the deposit now, the loss since
   *  the last touch taken out. */
  compoundedRaw: string;
  /** deposits(id): the deposit recorded at the last touch. */
  recordedRaw: string;
  /** depositSnapshots(id): S, P, B, scale. */
  snapshotP: string;
  /** getDepositorStableTokenGainWithPending(id): the stable gain a touch
   *  would pay now. */
  stableGainRaw: string;
  /** getDepositorBcTokenGain(id): pETH gained since the last touch. */
  bcGainRaw: string;
  /** stashedBcTokens(id): pETH gained at earlier touches and not claimed. */
  stashedRaw: string;
  owner: string | null;
  /** The pool's P() now. */
  p: string;
  /** priceFeed.previewPrice(): pETH in the market's stablecoin. */
  pethInStableRaw: string | null;
  chainStale?: boolean;
}

export interface PolarisLoanChain {
  loanId: string;
  blockNumber: number;
  blockTimestamp: number;
  /** loans(id): fpETH collateral and debt shares. */
  collRaw: string;
  sharesRaw: string;
  /** getLoanDebt(id): the WETH owed now, ceil(shares × debt per share ÷ 1e27)
   *  with the fees accrued since the last FeesAccrued. */
  debtRaw: string;
  /** debtPerShare(): the index as stored at the last FeesAccrued. */
  debtPerShareRaw: string;
  /** The bonding curve's floorPrice(): fpETH in WETH. */
  floorPriceRaw: string;
  owner: string | null;
  chainStale?: boolean;
}

async function read<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return (await res.json()) as T;
}

export const fetchPolarisDepositChain = (market: PolarisMarket, tokenId: string) =>
  read<PolarisDepositChain>(`/api/chain/polaris/stability-pool?market=${market}&id=${tokenId}`);

export const fetchPolarisLoanChain = (loanId: string) =>
  read<PolarisLoanChain>(`/api/chain/polaris/reserve-loan?id=${loanId}`);
