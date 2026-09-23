// Live Moonwell per-account position — the chain detail reader. A Compound v2
// fork cross-collateralises everything through one Comptroller, so ONE read
// covers the whole account: per-market balances (exact mTokens + stored
// borrow), the pool's own exchange rates, the Comptroller's oracle prices and
// live collateral factors, getAssetsIn membership (mint alone does NOT enter a
// market — an un-entered supply backs nothing), and the Comptroller's OWN
// verdict getAccountLiquidity (shortfall > 0 = liquidatable now). The client
// HF replica (capacity ÷ debt) is proven EXACT against the Comptroller's
// truncation order by scripts/verify-moonwell-chain.mjs.
//
// One reader, two deployments (Ethereum and Base — see MoonwellDeployment).
// The arithmetic below is the part that must not diverge between them: exchange
// rate scaling, the oracle's 1e(36 − decimals) convention, and which supplies
// count toward capacity are fork facts, not chain facts, and a second copy of
// them is how two explorers start disagreeing about the same protocol. What
// DOES differ is only where the market roster comes from — written down on
// Ethereum, read from the Comptroller on Base — and that difference is
// resolved before any of this runs.
//
// SERVER-ONLY.

import { parseAbi, getAddress, type ContractFunctionParameters } from "viem";
import { chainClient } from "./rpc";
import { resolveMoonwellRoster } from "./moonwell-roster";
import { MOONWELL_DEPLOYMENT, MTOKEN_DECIMALS, type MoonwellDeployment } from "@/lib/moonwell/asset-catalog";
import type { MoonwellChainMarket, MoonwellChainResponse } from "@/lib/api/fetch-moonwell-position";

const COMPTROLLER_ABI = parseAbi([
  "function getAssetsIn(address account) view returns (address[])",
  "function getAccountLiquidity(address account) view returns (uint256 err, uint256 liquidity, uint256 shortfall)",
  "function closeFactorMantissa() view returns (uint256)",
  "function liquidationIncentiveMantissa() view returns (uint256)",
  "function markets(address mToken) view returns (bool isListed, uint256 collateralFactorMantissa)",
]);
const MTOKEN_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function borrowBalanceStored(address account) view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
  "function borrowRatePerTimestamp() view returns (uint256)",
  "function supplyRatePerTimestamp() view returns (uint256)",
]);
const ORACLE_ABI = parseAbi(["function getUnderlyingPrice(address mToken) view returns (uint256)"]);

const FACTOR = 1e18;
const SECONDS_PER_YEAR = 31_536_000;
const ZERO = BigInt(0);

function stub(wallet: string): MoonwellChainResponse {
  return {
    wallet,
    blockNumber: 0,
    blockTimestamp: 0,
    markets: [],
    liquidityUsd: 0,
    shortfallUsd: 0,
    collateralValueUsd: 0,
    collateralCapacityUsd: 0,
    debtValueUsd: 0,
    healthFactor: null,
    closeFactor: 0,
    liquidationIncentive: 0,
    chainStale: true,
  };
}

/**
 * Read an account's live Moonwell position straight from chain. Returns a
 * `chainStale` stub on RPC failure so the caller falls back to its
 * event-derived numbers (the risk surfaces just stay off) — or, on a
 * deployment with no index behind it, says plainly that it could not read.
 */
export async function loadMoonwellPositionFromChain(
  walletRaw: string,
  deployment: MoonwellDeployment = MOONWELL_DEPLOYMENT,
): Promise<MoonwellChainResponse> {
  const wallet = getAddress(walletRaw);
  try {
    const roster = await resolveMoonwellRoster(deployment);
    if (!roster) return stub(wallet.toLowerCase());

    const client = chainClient(deployment.chainId);
    const comptroller = deployment.comptroller as `0x${string}`;
    const atC = (functionName: string, args: readonly unknown[] = []): ContractFunctionParameters =>
      ({ address: comptroller, abi: COMPTROLLER_ABI, functionName, args }) as ContractFunctionParameters;
    const atM = (mtoken: string, functionName: string, args: readonly unknown[] = []): ContractFunctionParameters =>
      ({ address: mtoken as `0x${string}`, abi: MTOKEN_ABI, functionName, args }) as ContractFunctionParameters;

    // With the roster in hand every address is known, so the whole account
    // assembles in ONE multicall alongside the head block number — four
    // markets on Ethereum, twenty-one on Base, same single round trip.
    const PER_MARKET = 7;
    // The head block itself, not just its number: its timestamp is what a
    // live market note states its elapsed time from (the Polaris pattern,
    // lib/sources/chain/polaris-position.ts).
    const [head, results] = await Promise.all([
      client.getBlock(),
      client.multicall({
        allowFailure: false,
        contracts: [
          atC("getAssetsIn", [wallet]),
          atC("getAccountLiquidity", [wallet]),
          atC("closeFactorMantissa"),
          atC("liquidationIncentiveMantissa"),
          ...roster.markets.flatMap((m) => [
            atM(m.mtoken, "balanceOf", [wallet]),
            atM(m.mtoken, "borrowBalanceStored", [wallet]),
            atM(m.mtoken, "exchangeRateStored"),
            atM(m.mtoken, "borrowRatePerTimestamp"),
            atM(m.mtoken, "supplyRatePerTimestamp"),
            {
              address: roster.oracle as `0x${string}`,
              abi: ORACLE_ABI,
              functionName: "getUnderlyingPrice",
              args: [m.mtoken as `0x${string}`],
            } as ContractFunctionParameters,
            atC("markets", [m.mtoken]),
          ]),
        ],
      }),
    ]);

    const assetsIn = results[0] as unknown as string[];
    const [liqErr, liquidity, shortfall] = results[1] as unknown as [bigint, bigint, bigint];
    if (liqErr !== ZERO) return stub(wallet.toLowerCase());
    const closeFactor = Number(results[2] as unknown as bigint) / FACTOR;
    const liquidationIncentive = Number(results[3] as unknown as bigint) / FACTOR;
    const entered = new Set(assetsIn.map((a) => a.toLowerCase()));

    let collateralValueUsd = 0;
    let collateralCapacityUsd = 0;
    let debtValueUsd = 0;
    const markets: MoonwellChainMarket[] = [];
    roster.markets.forEach((m, i) => {
      const base = 4 + i * PER_MARKET;
      const [balance, borrow, rateRaw, borrowRate, supplyRate] = results.slice(base, base + 5) as unknown as bigint[];
      const priceRaw = results[base + 5] as unknown as bigint;
      const [, cfMantissa] = results[base + 6] as unknown as [boolean, bigint];
      if (balance === ZERO && borrow === ZERO) return;

      const exchangeRate = Number(rateRaw) / 10 ** (18 + m.decimals - MTOKEN_DECIMALS);
      const supplyUnderlying = (Number(balance) / 10 ** MTOKEN_DECIMALS) * exchangeRate;
      const borrowUnderlying = Number(borrow) / 10 ** m.decimals;
      const priceUsd = priceRaw > ZERO ? Number(priceRaw) / 10 ** (36 - m.decimals) : null;
      const collateralFactor = Number(cfMantissa) / FACTOR;
      const isEntered = entered.has(m.mtoken);

      if (priceUsd != null) {
        if (isEntered) {
          collateralValueUsd += supplyUnderlying * priceUsd;
          collateralCapacityUsd += supplyUnderlying * priceUsd * collateralFactor;
        }
        debtValueUsd += borrowUnderlying * priceUsd;
      }
      markets.push({
        market: m.key,
        symbol: m.symbol,
        underlying: m.underlying,
        decimals: m.decimals,
        mtokenBalanceRaw: balance.toString(),
        exchangeRate,
        supplyUnderlying,
        borrowBalanceRaw: borrow.toString(),
        borrowUnderlying,
        priceUsd,
        collateralFactor,
        entered: isEntered,
        supplyApr: supplyRate != null ? (Number(supplyRate) / FACTOR) * SECONDS_PER_YEAR : null,
        borrowApr: borrowRate != null ? (Number(borrowRate) / FACTOR) * SECONDS_PER_YEAR : null,
      });
    });

    return {
      wallet: wallet.toLowerCase(),
      blockNumber: Number(head.number),
      blockTimestamp: Number(head.timestamp),
      markets,
      liquidityUsd: Number(liquidity) / FACTOR,
      shortfallUsd: Number(shortfall) / FACTOR,
      collateralValueUsd,
      collateralCapacityUsd,
      debtValueUsd,
      healthFactor: debtValueUsd > 0 ? collateralCapacityUsd / debtValueUsd : null,
      closeFactor,
      liquidationIncentive,
      chainStale: false,
    };
  } catch (error) {
    // Logged rather than swallowed: on a deployment with no index behind it the
    // stub is the whole page, and a silent stub reads as an empty account.
    console.error("Moonwell position read failed:", error);
    return stub(wallet.toLowerCase());
  }
}
