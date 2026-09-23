// Live Compound V2 per-account position — the chain detail reader. The
// Comptroller (0x3d98…Cd3B) cross-collateralises all twenty listed markets, so
// ONE read covers the whole account: per-market balances (exact cTokens +
// stored borrow), the pool's own exchange rates, the Comptroller's oracle
// prices (with the fixed-price/no-feed flag from the oracle's own config) and
// live collateral factors, getAssetsIn membership (supplying alone does NOT
// enter a market — an un-entered supply backs nothing), and the Comptroller's
// OWN verdict getAccountLiquidity.
//
// getAccountLiquidity returns (error, liquidity, shortfall) — a tuple, not a
// boolean verdict. That tuple is the chain fact this reader leads with;
// `healthReplica` (capacity ÷ debt) is client arithmetic over the same reads,
// labeled a REPLICA everywhere it renders — unlike Moonwell's, it has not been
// proven exact against the Comptroller's truncation order.
//
// Rates are per BLOCK (original V2), annualized on each market's OWN interest
// rate model's blocksPerYear() — cETH's model says 2,628,000, the rest
// 2,102,400; one hardcoded constant would misstate the biggest market by 25%.
//
// SERVER-ONLY.

import { parseAbi, getAddress, type ContractFunctionParameters } from "viem";
import { alchemyClient } from "./rpc";
import { COMPOUND_V2_MARKETS, COMPOUND_V2_ADDRESSES, CTOKEN_DECIMALS } from "@/lib/compound-v2/asset-catalog";
import type { CompoundV2ChainMarket, CompoundV2ChainResponse } from "@/lib/api/fetch-compound-v2-position";

const COMPTROLLER_ABI = parseAbi([
  "function getAssetsIn(address account) view returns (address[])",
  "function getAccountLiquidity(address account) view returns (uint256 err, uint256 liquidity, uint256 shortfall)",
  "function closeFactorMantissa() view returns (uint256)",
  "function liquidationIncentiveMantissa() view returns (uint256)",
  "function markets(address cToken) view returns (bool isListed, uint256 collateralFactorMantissa, bool isComped)",
  "function oracle() view returns (address)",
]);
const CTOKEN_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function borrowBalanceStored(address account) view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
  "function borrowRatePerBlock() view returns (uint256)",
  "function supplyRatePerBlock() view returns (uint256)",
  "function interestRateModel() view returns (address)",
]);
const IRM_ABI = parseAbi(["function blocksPerYear() view returns (uint256)"]);
const ORACLE_ABI = parseAbi([
  "function getUnderlyingPrice(address cToken) view returns (uint256)",
  "function getConfig(address cToken) view returns ((uint8 underlyingAssetDecimals, address priceFeed, uint256 fixedPrice))",
]);

const FACTOR = 1e18;
const ZERO = BigInt(0);
const isZeroAddr = (a: string | undefined | null) => !a || BigInt(a) === ZERO;

type Res = { status: string; result?: unknown };
const ok = <T>(r: Res | undefined): T | null => (r?.status === "success" && r.result != null ? (r.result as T) : null);

function stub(wallet: string): CompoundV2ChainResponse {
  return {
    wallet,
    blockNumber: 0,
    oracle: null,
    markets: [],
    liquidityUsd: 0,
    shortfallUsd: 0,
    collateralValueUsd: 0,
    collateralCapacityUsd: 0,
    debtValueUsd: 0,
    healthReplica: null,
    closeFactor: 0,
    liquidationIncentive: 0,
    chainStale: true,
  };
}

/**
 * Read an account's live Compound V2 position straight from chain. Returns a
 * `chainStale` stub on RPC failure so the caller falls back to its
 * event-derived numbers (the risk surfaces just stay off).
 */
export async function loadCompoundV2PositionFromChain(walletRaw: string): Promise<CompoundV2ChainResponse> {
  const wallet = getAddress(walletRaw);
  try {
    const client = alchemyClient();
    const comptroller = COMPOUND_V2_ADDRESSES.COMPTROLLER as `0x${string}`;
    const atC = (functionName: string, args: readonly unknown[] = []): ContractFunctionParameters =>
      ({ address: comptroller, abi: COMPTROLLER_ABI, functionName, args }) as ContractFunctionParameters;
    const atT = (ctoken: string, functionName: string, args: readonly unknown[] = []): ContractFunctionParameters =>
      ({ address: ctoken as `0x${string}`, abi: CTOKEN_ABI, functionName, args }) as ContractFunctionParameters;

    // Pass 1: the account across all twenty catalog markets, plus the
    // Comptroller's verdict, constants, and its own oracle address.
    const PER_MARKET = 7;
    const HEAD = 5;
    const [blockNumber, results] = await Promise.all([
      client.getBlockNumber().then(Number),
      client.multicall({
        allowFailure: true,
        contracts: [
          atC("getAssetsIn", [wallet]),
          atC("getAccountLiquidity", [wallet]),
          atC("closeFactorMantissa"),
          atC("liquidationIncentiveMantissa"),
          atC("oracle"),
          ...COMPOUND_V2_MARKETS.flatMap((m) => [
            atT(m.ctoken, "balanceOf", [wallet]),
            atT(m.ctoken, "borrowBalanceStored", [wallet]),
            atT(m.ctoken, "exchangeRateStored"),
            atT(m.ctoken, "borrowRatePerBlock"),
            atT(m.ctoken, "supplyRatePerBlock"),
            atC("markets", [m.ctoken]),
            atT(m.ctoken, "interestRateModel"),
          ]),
        ],
      }) as Promise<Res[]>,
    ]);

    const assetsIn = ok<string[]>(results[0]);
    const verdict = ok<readonly [bigint, bigint, bigint]>(results[1]);
    if (!assetsIn || !verdict) return stub(wallet.toLowerCase());
    const [liqErr, liquidity, shortfall] = verdict;
    if (liqErr !== ZERO) return stub(wallet.toLowerCase());
    const closeFactor = Number(ok<bigint>(results[2]) ?? ZERO) / FACTOR;
    const liquidationIncentive = Number(ok<bigint>(results[3]) ?? ZERO) / FACTOR;
    const oracle = ok<string>(results[4]);
    const entered = new Set(assetsIn.map((a) => a.toLowerCase()));

    // The account's touched markets — the only ones worth a second pass.
    const touched = COMPOUND_V2_MARKETS.map((m, i) => {
      const base = HEAD + i * PER_MARKET;
      const balance = ok<bigint>(results[base]) ?? ZERO;
      const borrow = ok<bigint>(results[base + 1]) ?? ZERO;
      return { m, i, balance, borrow };
    }).filter((t) => t.balance > ZERO || t.borrow > ZERO);

    // Pass 2 (touched markets only): the oracle's price + config, and each
    // market's own model's blocksPerYear.
    let second: Res[] = [];
    if (touched.length > 0 && oracle && !isZeroAddr(oracle)) {
      second = (await client.multicall({
        allowFailure: true,
        contracts: touched.flatMap(({ m, i }) => {
          const irm = ok<string>(results[HEAD + i * PER_MARKET + 6]);
          const irmAddr = (irm && !isZeroAddr(irm) ? irm : m.ctoken) as `0x${string}`;
          return [
            {
              address: oracle as `0x${string}`,
              abi: ORACLE_ABI,
              functionName: "getUnderlyingPrice",
              args: [m.ctoken as `0x${string}`],
            },
            {
              address: oracle as `0x${string}`,
              abi: ORACLE_ABI,
              functionName: "getConfig",
              args: [m.ctoken as `0x${string}`],
            },
            { address: irmAddr, abi: IRM_ABI, functionName: "blocksPerYear" },
          ] as const;
        }),
      })) as Res[];
    }

    let collateralValueUsd = 0;
    let collateralCapacityUsd = 0;
    let debtValueUsd = 0;
    const markets: CompoundV2ChainMarket[] = [];
    touched.forEach(({ m, i, balance, borrow }, j) => {
      const base = HEAD + i * PER_MARKET;
      const rateRaw = ok<bigint>(results[base + 2]);
      const exchangeRate = rateRaw != null ? Number(rateRaw) / 10 ** (18 + m.decimals - CTOKEN_DECIMALS) : 0;
      const supplyUnderlying = (Number(balance) / 10 ** CTOKEN_DECIMALS) * exchangeRate;
      const borrowUnderlying = Number(borrow) / 10 ** m.decimals;

      const priceRaw = ok<bigint>(second[j * 3]);
      const cfg = ok<{ underlyingAssetDecimals: number; priceFeed: string; fixedPrice: bigint }>(second[j * 3 + 1]);
      const priceUsd = priceRaw != null && priceRaw > ZERO ? Number(priceRaw) / 10 ** (36 - m.decimals) : null;
      const priceHasFeed = cfg != null ? !isZeroAddr(cfg.priceFeed) : true;

      const mkt = ok<readonly [boolean, bigint, boolean]>(results[base + 5]);
      const cfMantissa = mkt ? mkt[1] : null;
      // collateralFactor == 0 is not a 0% rung — the market is DISABLED as
      // collateral (8 of 20 markets today). Null so no surface renders a
      // parameter the market does not have.
      const collateralDisabled = cfMantissa != null && cfMantissa === ZERO;
      const collateralFactor = cfMantissa != null && cfMantissa > ZERO ? Number(cfMantissa) / FACTOR : null;
      const isEntered = entered.has(m.ctoken);

      const bpyRaw = ok<bigint>(second[j * 3 + 2]);
      const blocksPerYear = bpyRaw != null && bpyRaw > ZERO ? Number(bpyRaw) : null;
      const apr = (r: Res | undefined): number | null => {
        const v = ok<bigint>(r);
        return v != null && blocksPerYear != null ? (Number(v) / FACTOR) * blocksPerYear : null;
      };

      if (priceUsd != null) {
        if (isEntered) {
          collateralValueUsd += supplyUnderlying * priceUsd;
          if (collateralFactor != null) collateralCapacityUsd += supplyUnderlying * priceUsd * collateralFactor;
        }
        debtValueUsd += borrowUnderlying * priceUsd;
      }
      markets.push({
        market: m.key,
        symbol: m.symbol,
        decimals: m.decimals,
        ctokenBalanceRaw: balance.toString(),
        exchangeRate,
        supplyUnderlying,
        borrowBalanceRaw: borrow.toString(),
        borrowUnderlying,
        priceUsd,
        priceHasFeed,
        collateralFactor,
        collateralDisabled,
        entered: isEntered,
        supplyApr: apr(results[base + 4]),
        borrowApr: apr(results[base + 3]),
        blocksPerYear,
      });
    });

    return {
      wallet: wallet.toLowerCase(),
      blockNumber,
      oracle: oracle && !isZeroAddr(oracle) ? getAddress(oracle).toLowerCase() : null,
      markets,
      liquidityUsd: Number(liquidity) / FACTOR,
      shortfallUsd: Number(shortfall) / FACTOR,
      collateralValueUsd,
      collateralCapacityUsd,
      debtValueUsd,
      healthReplica: debtValueUsd > 0 ? collateralCapacityUsd / debtValueUsd : null,
      closeFactor,
      liquidationIncentive,
      chainStale: false,
    };
  } catch {
    return stub(wallet.toLowerCase());
  }
}
