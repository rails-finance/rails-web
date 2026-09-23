// Live Polaris reads — the chain detail reader for one CDP and the market
// board for both markets. SERVER-ONLY: imported by the two
// /api/chain/polaris/* route handlers, the markets page, the CDP and wallet
// share-image routes — never by anything a client component reaches.
//
// The ABI slice below is taken from the scoping fixture; every getter was
// probed against the live Sepolia contracts on 2026-09-05 before this file
// was written (block 11,638,962):
//
//   • cdpManager: getCDP, getCDPEntireDebt/Coll, the five pending-leg
//     getters, getICR, getInterestRate + primaryRate + secondaryRate,
//     isDefensiveMode, getReserveToDebtRatio, MCR, DEFENSIVE_MODE_MCR,
//     getTotalColl, getTotalDebt, stabilityPool, priceFeed.
//   • cdpNft.ownerOf — reverts (0x7e273289, ERC721NonexistentToken) once the
//     NFT is burned, which is what a closed or liquidated CDP looks like at
//     head; read with allowFailure and answered as null.
//   • priceFeed.previewPrice() — pETH in the debt unit, the VIEW twin of the
//     nonpayable getPrice(); previewReservePriceInDebt() — ETH in the debt
//     unit. ⚠️ The plan's `getPrice(uint256)` is the BONDING CURVE's function
//     (price at a supply), not the feed's, and `medianiser()` exists on the
//     USDp feed only — the GOLDp feed is a different contract that answers the
//     two preview getters but names neither medianiser. So the medianisers are
//     read at their catalog addresses directly.
//   • medianiser.previewExternalPrice() — the VIEW twin of getExternalPrice();
//     ETH/USD on one, XAU/USD on the other, 1e18.
//   • bondingCurve.currentPrice() — pETH in ETH, 1e18.
//   • stabilityPool.P() and getTotalStableTokenDeposits().
//
// Identity, checked by the probe: previewPrice = currentPrice × reserve price
// in debt (USDp 2.0825 × 2453.17 = 5108.77 ✓; GOLDp 2.0825 × 0.5495 = 1.1444 ✓,
// where 0.5495 = ETH/USD ÷ XAU/USD).

import { parseAbi, getAddress } from "viem";
import { chainClient } from "./rpc";
import {
  POLARIS_CHAIN_ID,
  POLARIS_CORE,
  POLARIS_MARKET_CONFIG,
  POLARIS_MARKETS,
  type PolarisMarket,
} from "@/lib/polaris/asset-catalog";
import type { PolarisChainResponse, PolarisPriceLegs } from "@/lib/api/fetch-polaris-position";

export const CDP_MANAGER_ABI = parseAbi([
  "function getCDP(uint256 _id) view returns ((uint256 coll, uint256 debt, uint256 gasCompDeposit, uint256 snapshotTimeWeightedRateSum, uint256 snapshotStableRewardSum, uint256 snapshotBcTokenRewardSum, int256 snapshotMintRedeemDebtSum, uint128 snapshotMintRedeemCollProd, uint64 snapshotRate, uint48 lastTouchTime, uint48 snapshotLastRateUpdateTime, bool isOpen))",
  "function getCDPEntireDebt(uint256 _id) view returns (int256)",
  "function getCDPEntireColl(uint256 _id) view returns (uint256)",
  "function getCDPAccruedInterest(uint256 _id) view returns (uint256)",
  "function getCDPAccruedStables(uint256 _id) view returns (uint256)",
  "function getCDPBcTokenGain(uint256 _id) view returns (uint256)",
  "function getCDPMintRedeemCollChange(uint256 _id) view returns (int256)",
  "function getCDPMintRedeemDebtChange(uint256 _id) view returns (int256)",
  "function getICR(uint256 _id) view returns (uint256)",
  "function getInterestRate() view returns (uint256)",
  "function primaryRate() view returns (uint256)",
  "function secondaryRate() view returns (uint256)",
  "function isDefensiveMode() view returns (bool)",
  "function getReserveToDebtRatio() view returns (uint256)",
  "function MCR() view returns (uint256)",
  "function DEFENSIVE_MODE_MCR() view returns (uint256)",
  "function getTotalColl() view returns (uint256)",
  "function getTotalDebt() view returns (uint256)",
  "function stabilityPool() view returns (address)",
  "function priceFeed() view returns (address)",
]);

export const CDP_NFT_ABI = parseAbi(["function ownerOf(uint256 tokenId) view returns (address)"]);

export const PRICE_FEED_ABI = parseAbi([
  "function previewPrice() view returns (uint256)",
  "function previewReservePriceInDebt() view returns (uint256)",
]);

export const MEDIANISER_ABI = parseAbi(["function previewExternalPrice() view returns (uint256)"]);

export const BONDING_CURVE_ABI = parseAbi(["function currentPrice() view returns (uint256)"]);

export const STABILITY_POOL_ABI = parseAbi([
  "function P() view returns (uint256)",
  "function getTotalStableTokenDeposits() view returns (uint256)",
]);

type Res = { status: string; result?: unknown };
const ok = <T>(r: Res | undefined): T | null => (r?.status === "success" && r.result != null ? (r.result as T) : null);

const E18 = 1e18;
const n18 = (v: bigint | null | undefined): number => (v == null ? 0 : Number(v) / E18);
const raw = (v: bigint | null | undefined): string => (v == null ? "0" : v.toString());

/** getICR answers 0 for a debt-free or closed CDP and a value beyond any real
 *  ratio when the debt is dust; both are "no ratio", never a figure. */
function icrOf(v: bigint | null): number | null {
  if (v == null || v === BigInt(0)) return null;
  const f = Number(v) / E18;
  return Number.isFinite(f) && f < 1e6 ? f : null;
}

function stub(market: PolarisMarket, cdpId: string): PolarisChainResponse {
  return {
    market,
    cdpId,
    blockNumber: 0,
    blockTimestamp: 0,
    owner: null,
    isOpen: false,
    recordedColl: 0,
    recordedCollRaw: "0",
    recordedDebt: 0,
    recordedDebtRaw: "0",
    entireColl: 0,
    entireCollRaw: "0",
    entireDebt: 0,
    entireDebtRaw: "0",
    accruedInterest: 0,
    accruedInterestRaw: "0",
    accruedStables: 0,
    accruedStablesRaw: "0",
    bcTokenGain: 0,
    bcTokenGainRaw: "0",
    mintRedeemCollChange: 0,
    mintRedeemCollChangeRaw: "0",
    mintRedeemDebtChange: 0,
    mintRedeemDebtChangeRaw: "0",
    icr: null,
    icrRaw: "0",
    gasCompDeposit: 0,
    lastTouchTime: 0,
    interestRate: 0,
    primaryRate: 0,
    secondaryRate: 0,
    defensiveMode: false,
    reserveToDebtRatio: 0,
    mcr: 0,
    defensiveMcr: 0,
    price: null,
    chainStale: true,
  };
}

/** The price legs for one market, from one multicall's results. */
function priceLegs(
  market: PolarisMarket,
  pf: Res[],
  curveRes: Res,
  ethRes: Res,
  xauRes: Res | undefined,
): PolarisPriceLegs {
  const pethInDebt = ok<bigint>(pf[0]);
  const ethInDebt = ok<bigint>(pf[1]);
  const curve = ok<bigint>(curveRes);
  const ethUsd = ok<bigint>(ethRes);
  const xauUsd = market === "goldp" ? ok<bigint>(xauRes) : null;
  return {
    pethInDebt: n18(pethInDebt),
    pethInDebtRaw: raw(pethInDebt),
    ethInDebt: n18(ethInDebt),
    curve: n18(curve),
    curveRaw: raw(curve),
    ethUsd: n18(ethUsd),
    ethUsdRaw: raw(ethUsd),
    xauUsd: xauUsd != null ? n18(xauUsd) : null,
    pethUsd: n18(curve) * n18(ethUsd),
  };
}

const priceCalls = (market: PolarisMarket) => {
  const cfg = POLARIS_MARKET_CONFIG[market];
  return [
    { address: getAddress(cfg.priceFeed), abi: PRICE_FEED_ABI, functionName: "previewPrice" },
    { address: getAddress(cfg.priceFeed), abi: PRICE_FEED_ABI, functionName: "previewReservePriceInDebt" },
    { address: getAddress(POLARIS_CORE.bondingCurve), abi: BONDING_CURVE_ABI, functionName: "currentPrice" },
    { address: getAddress(POLARIS_CORE.ethUsdMedianiser), abi: MEDIANISER_ABI, functionName: "previewExternalPrice" },
    { address: getAddress(POLARIS_CORE.xauUsdMedianiser), abi: MEDIANISER_ABI, functionName: "previewExternalPrice" },
  ] as const;
};

/** The cdpManager getters read for one CDP, in call order. */
const CDP_FNS = [
  "getCDP",
  "getCDPEntireDebt",
  "getCDPEntireColl",
  "getCDPAccruedInterest",
  "getCDPAccruedStables",
  "getCDPBcTokenGain",
  "getCDPMintRedeemCollChange",
  "getCDPMintRedeemDebtChange",
  "getICR",
] as const;
const MARKET_FNS = [
  "getInterestRate",
  "primaryRate",
  "secondaryRate",
  "isDefensiveMode",
  "getReserveToDebtRatio",
  "MCR",
  "DEFENSIVE_MODE_MCR",
] as const;

interface CdpStruct {
  coll: bigint;
  debt: bigint;
  gasCompDeposit: bigint;
  lastTouchTime: number | bigint;
  isOpen: boolean;
}

/**
 * Read one CDP live at head. Returns a `chainStale` stub on RPC failure so the
 * page states that rather than rendering an empty position.
 */
export async function loadPolarisPositionFromChain(
  market: PolarisMarket,
  cdpId: string,
): Promise<PolarisChainResponse> {
  const cfg = POLARIS_MARKET_CONFIG[market];
  const manager = getAddress(cfg.cdpManager);
  const id = BigInt(cdpId);
  try {
    const client = chainClient(POLARIS_CHAIN_ID);
    // The head block itself, not just its number: its timestamp is what a live
    // market note states its elapsed time from.
    const [head, res] = await Promise.all([
      client.getBlock(),
      client.multicall({
        allowFailure: true,
        contracts: [
          ...CDP_FNS.map((functionName) => ({ address: manager, abi: CDP_MANAGER_ABI, functionName, args: [id] })),
          ...MARKET_FNS.map((functionName) => ({ address: manager, abi: CDP_MANAGER_ABI, functionName })),
          { address: getAddress(cfg.cdpNft), abi: CDP_NFT_ABI, functionName: "ownerOf", args: [id] },
          ...priceCalls(market),
        ] as const,
      }) as Promise<Res[]>,
    ]);

    const cdp = ok<CdpStruct>(res[0]);
    // No struct means the manager did not answer — a stub, never invented state.
    if (cdp == null) return stub(market, cdpId);
    const entireDebt = ok<bigint>(res[1]);
    const entireColl = ok<bigint>(res[2]);
    const accruedInterest = ok<bigint>(res[3]);
    const accruedStables = ok<bigint>(res[4]);
    const bcTokenGain = ok<bigint>(res[5]);
    const mrColl = ok<bigint>(res[6]);
    const mrDebt = ok<bigint>(res[7]);
    const icr = ok<bigint>(res[8]);
    const m = CDP_FNS.length;
    const interestRate = ok<bigint>(res[m]);
    const primaryRate = ok<bigint>(res[m + 1]);
    const secondaryRate = ok<bigint>(res[m + 2]);
    const defensive = ok<boolean>(res[m + 3]) ?? false;
    const reserveToDebt = ok<bigint>(res[m + 4]);
    const mcr = ok<bigint>(res[m + 5]);
    const defensiveMcr = ok<bigint>(res[m + 6]);
    const owner = ok<string>(res[m + 7]);
    const p = m + 8;
    const price = priceLegs(market, [res[p], res[p + 1]], res[p + 2], res[p + 3], res[p + 4]);

    return {
      market,
      cdpId,
      blockNumber: Number(head.number),
      blockTimestamp: Number(head.timestamp),
      owner: owner ? owner.toLowerCase() : null,
      isOpen: cdp.isOpen,
      recordedColl: n18(cdp.coll),
      recordedCollRaw: raw(cdp.coll),
      recordedDebt: n18(cdp.debt),
      recordedDebtRaw: raw(cdp.debt),
      entireColl: n18(entireColl),
      entireCollRaw: raw(entireColl),
      entireDebt: n18(entireDebt),
      entireDebtRaw: raw(entireDebt),
      accruedInterest: n18(accruedInterest),
      accruedInterestRaw: raw(accruedInterest),
      accruedStables: n18(accruedStables),
      accruedStablesRaw: raw(accruedStables),
      bcTokenGain: n18(bcTokenGain),
      bcTokenGainRaw: raw(bcTokenGain),
      mintRedeemCollChange: n18(mrColl),
      mintRedeemCollChangeRaw: raw(mrColl),
      mintRedeemDebtChange: n18(mrDebt),
      mintRedeemDebtChangeRaw: raw(mrDebt),
      icr: icrOf(icr),
      icrRaw: raw(icr),
      gasCompDeposit: n18(cdp.gasCompDeposit),
      lastTouchTime: Number(cdp.lastTouchTime),
      interestRate: n18(interestRate),
      primaryRate: n18(primaryRate),
      secondaryRate: n18(secondaryRate),
      defensiveMode: defensive,
      reserveToDebtRatio: n18(reserveToDebt),
      mcr: n18(mcr),
      defensiveMcr: n18(defensiveMcr),
      price,
      chainStale: false,
    };
  } catch {
    return stub(market, cdpId);
  }
}

// ── The market board ─────────────────────────────────────────────────────────

export interface PolarisMarketChainState {
  market: PolarisMarket;
  totalColl: number;
  totalCollRaw: string;
  totalDebt: number;
  totalDebtRaw: string;
  interestRate: number;
  primaryRate: number;
  secondaryRate: number;
  defensiveMode: boolean;
  reserveToDebtRatio: number;
  mcr: number;
  defensiveMcr: number;
  /** stabilityPool.getTotalStableTokenDeposits() */
  spDeposits: number;
  spDepositsRaw: string;
  /** stabilityPool.P() — the pool's running product, 1e36 at deploy. */
  spP: string;
  price: PolarisPriceLegs;
}

export interface PolarisMarketsChainResponse {
  blockNumber: number;
  markets: PolarisMarketChainState[];
  chainStale: boolean;
}

const BOARD_FNS = [...MARKET_FNS, "getTotalColl", "getTotalDebt"] as const;

// ── The board memo ───────────────────────────────────────────────────────────
// The board read takes no argument — it is the same read for every caller —
// and five callers make it: the markets page, /api/chain/polaris/markets, the
// CDP share-image route, the wallet share-image route, and the listing's board
// side-fetch through that JSON route. The share routes render on demand from a
// free parameter, so before this memo a burst of N distinct share URLs on one
// instance cost N Sepolia multicalls with nothing in front of them (Alchemy
// carries no per-caller limit of its own). One minute is the TTL: the card and
// the listing already sit behind a 5-minute edge cache and carry an "as of"
// line, and the markets page names the block it read at, so a read up to a
// minute old stays legible. `blockNumber` in the response is the block the
// memoised read happened at — it is not re-stamped on a memo hit.
//
// What is memoised is the PROMISE, not the settled value, so N concurrent
// misses on a cold instance share one in-flight read rather than only N
// sequential ones. The slot is dropped when the read settles to the
// `chainStale` stub or rejects: a failure must not outlive the failure (the
// rule lib/api/proxy-cache.ts states for CHAIN_MARKET_CACHE_CONTROL).
const BOARD_TTL_MS = 60_000;

let boardSlot: { at: number; promise: Promise<PolarisMarketsChainResponse> } | null = null;

/** Both markets' own state at one head block, one multicall, memoised for
 *  BOARD_TTL_MS (see above). `now` is injectable so a probe can drive the
 *  clock; callers leave it alone. A `chainStale` stub on failure — the page
 *  says so rather than showing an empty board — and a stub is never memoised. */
export function loadPolarisMarketsFromChain(now: number = Date.now()): Promise<PolarisMarketsChainResponse> {
  if (boardSlot && now - boardSlot.at < BOARD_TTL_MS) return boardSlot.promise;
  const slot = { at: now, promise: readPolarisBoard() };
  boardSlot = slot;
  slot.promise.then(
    (res) => {
      if (res.chainStale && boardSlot === slot) boardSlot = null;
    },
    () => {
      if (boardSlot === slot) boardSlot = null;
    },
  );
  return slot.promise;
}

async function readPolarisBoard(): Promise<PolarisMarketsChainResponse> {
  try {
    const client = chainClient(POLARIS_CHAIN_ID);
    const contracts = POLARIS_MARKETS.flatMap((market) => {
      const cfg = POLARIS_MARKET_CONFIG[market];
      const manager = getAddress(cfg.cdpManager);
      const pool = getAddress(cfg.stabilityPool);
      return [
        ...BOARD_FNS.map((functionName) => ({ address: manager, abi: CDP_MANAGER_ABI, functionName })),
        { address: pool, abi: STABILITY_POOL_ABI, functionName: "getTotalStableTokenDeposits" },
        { address: pool, abi: STABILITY_POOL_ABI, functionName: "P" },
        ...priceCalls(market),
      ] as const;
    });
    const per = BOARD_FNS.length + 2 + 5;
    const [blockNumber, res] = await Promise.all([
      client.getBlockNumber().then(Number),
      client.multicall({ allowFailure: true, contracts }) as Promise<Res[]>,
    ]);
    const markets = POLARIS_MARKETS.map((market, i) => {
      const at = (j: number) => res[i * per + j];
      const b = BOARD_FNS.length;
      const totalColl = ok<bigint>(at(b - 2));
      const totalDebt = ok<bigint>(at(b - 1));
      const spDeposits = ok<bigint>(at(b));
      const spP = ok<bigint>(at(b + 1));
      const p = b + 2;
      return {
        market,
        totalColl: n18(totalColl),
        totalCollRaw: raw(totalColl),
        totalDebt: n18(totalDebt),
        totalDebtRaw: raw(totalDebt),
        interestRate: n18(ok<bigint>(at(0))),
        primaryRate: n18(ok<bigint>(at(1))),
        secondaryRate: n18(ok<bigint>(at(2))),
        defensiveMode: ok<boolean>(at(3)) ?? false,
        reserveToDebtRatio: n18(ok<bigint>(at(4))),
        mcr: n18(ok<bigint>(at(5))),
        defensiveMcr: n18(ok<bigint>(at(6))),
        spDeposits: n18(spDeposits),
        spDepositsRaw: raw(spDeposits),
        spP: raw(spP),
        price: priceLegs(market, [at(p), at(p + 1)], at(p + 2), at(p + 3), at(p + 4)),
      };
    });
    return { blockNumber, markets, chainStale: false };
  } catch {
    return { blockNumber: 0, markets: [], chainStale: true };
  }
}
