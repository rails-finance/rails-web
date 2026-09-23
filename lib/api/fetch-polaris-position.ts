// ============================================================================
// FETCH POLARIS POSITION (chain state)
// ============================================================================
//
// One CDP read from the market's own contracts at the live Sepolia head — the
// primary truth on the detail page. One multicall on the cdpManager (the
// recorded slots, the entire-debt/entire-coll getters that add the pending
// legs, each pending leg on its own, the ICR the contract computes, the rate
// and mode in force, the two MCRs), one on the cdpNft (ownerOf — reverts once
// the NFT is burned), and the price legs: the market's price feed (pETH in the
// debt unit — the figure the ICR is judged at), the bonding curve (pETH in
// ETH) and the medianisers (ETH/USD, XAU/USD).
//
// Every figure ships as a scaled number beside its raw integer string.

import type { PolarisMarket } from "@/lib/polaris/asset-catalog";

export interface PolarisPriceLegs {
  /** priceFeed.previewPrice() — pETH in the market's debt unit (USDp: USD;
   *  GOLDp: troy ounces of gold). The price the protocol judges ICR at. */
  pethInDebt: number;
  pethInDebtRaw: string;
  /** priceFeed.previewReservePriceInDebt() — ETH in the debt unit. */
  ethInDebt: number;
  /** bondingCurve.currentPrice() — pETH in ETH. */
  curve: number;
  curveRaw: string;
  /** The ETH/USD medianiser's previewExternalPrice(). */
  ethUsd: number;
  ethUsdRaw: string;
  /** The XAU/USD medianiser's previewExternalPrice() — GOLDp only. */
  xauUsd: number | null;
  /** curve × ethUsd — pETH in USD by the protocol's own two legs. On USDp
   *  this equals `pethInDebt`; on GOLDp it is the USD leg the GOLDp feed
   *  divides by XAU/USD to reach its own unit. */
  pethUsd: number;
}

export interface PolarisChainResponse {
  market: PolarisMarket;
  cdpId: string;
  blockNumber: number;
  /** The head block's own timestamp (unix seconds); 0 on a stub. */
  blockTimestamp: number;
  /** ownerOf(id) — null once the NFT is burned (closed / liquidated). */
  owner: string | null;
  /** getCDP(id).isOpen */
  isOpen: boolean;

  /** getCDP(id).coll / .debt — the recorded slots (last touch). */
  recordedColl: number;
  recordedCollRaw: string;
  recordedDebt: number;
  recordedDebtRaw: string;
  /** getCDPEntireColl / getCDPEntireDebt — recorded + every pending leg. */
  entireColl: number;
  entireCollRaw: string;
  entireDebt: number;
  entireDebtRaw: string;
  /** The pending legs, each its own getter. */
  accruedInterest: number;
  accruedInterestRaw: string;
  accruedStables: number;
  accruedStablesRaw: string;
  bcTokenGain: number;
  bcTokenGainRaw: string;
  mintRedeemCollChange: number;
  mintRedeemCollChangeRaw: string;
  mintRedeemDebtChange: number;
  mintRedeemDebtChangeRaw: string;
  /** getICR(id) as a fraction (1.75 = 175%); null when the contract answers 0
   *  (no debt, or closed) or a sentinel beyond any real ratio. */
  icr: number | null;
  icrRaw: string;
  /** gasCompDeposit — the pETH escrowed at open for a liquidator. */
  gasCompDeposit: number;
  lastTouchTime: number;

  /** getInterestRate() = primary + secondary, fractions (0.0986 = 9.86%/yr). */
  interestRate: number;
  primaryRate: number;
  secondaryRate: number;
  defensiveMode: boolean;
  /** getReserveToDebtRatio(), fraction. */
  reserveToDebtRatio: number;
  /** MCR() and DEFENSIVE_MODE_MCR(), fractions (1.15, 1.5). */
  mcr: number;
  defensiveMcr: number;

  price: PolarisPriceLegs | null;

  /** True when the RPC read failed and this is an empty stub. */
  chainStale: boolean;
}

export async function fetchPolarisChainPosition(p: {
  market: PolarisMarket;
  cdpId: string;
  baseUrl?: string;
}): Promise<PolarisChainResponse> {
  const qs = new URLSearchParams({ market: p.market, id: p.cdpId });
  const url = `${p.baseUrl ?? ""}/api/chain/polaris/position?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchPolarisChainPosition failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as PolarisChainResponse;
}
