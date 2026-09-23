// Live Compound V3 (Comet) account state — the chain detail reader.
// ----------------------------------------------------------------------------
// Comet has no aggregate account getter (no getUserAccountData analog), so the
// read assembles an account from the market's own parts: the signed base
// (balanceOf / borrowBalanceOf, interest included), each enumerated collateral
// asset's balance + configured oracle price + collateral factors
// (getAssetInfo), the contract's OWN account verdicts (isBorrowCollateralized /
// isLiquidatable), and the market economics (utilization → supply/borrow rate).
// Every assumption is verified on-chain by scripts/verify-compound-v3-chain.mjs.
//
// The unit is the MARKET's, not the dollar. Each Comet prices its base and all
// its collateral against one numeraire, stated per market in the catalog from
// the base feed's own `description()` — so the derived aggregates here are in
// the market's quote unit and are never summed across markets that disagree.
//
// Reads N markets at once, and the single-market call is the N = 1 case rather
// than a second code path. That matters because Base's front door is a WALLET
// rather than a (market, wallet) pair: Comet enumerates no accounts and Base's
// history is not indexed here, but a wallet's whole standing across a
// deployment is just its standing in every market of a roster that is already
// written down — three batched calls, whatever the roster's size. The
// arithmetic is identical either way, which is the point of one path.
//
// SERVER-ONLY.

import { parseAbi, getAddress, type ContractFunctionParameters } from "viem";
import { chainClient } from "./rpc";
import { COMPOUND_DEPLOYMENT, type CometDeployment, type CometMarket } from "@/lib/compound/asset-catalog";
import { resolveErc20Meta } from "./erc20-meta";
import type { CompoundChainCollateral, CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import type { CompoundWalletChainResponse } from "@/lib/api/fetch-compound-wallet";

const COMET_ABI = parseAbi([
  "function baseTokenPriceFeed() view returns (address)",
  "function baseBorrowMin() view returns (uint104)",
  "function numAssets() view returns (uint8)",
  "function getAssetInfo(uint8 i) view returns ((uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap))",
  "function getPrice(address priceFeed) view returns (uint256)",
  "function getUtilization() view returns (uint256)",
  "function getSupplyRate(uint256 utilization) view returns (uint64)",
  "function getBorrowRate(uint256 utilization) view returns (uint64)",
  "function balanceOf(address account) view returns (uint256)",
  "function borrowBalanceOf(address account) view returns (uint256)",
  "function collateralBalanceOf(address account, address asset) view returns (uint128)",
  "function isBorrowCollateralized(address account) view returns (bool)",
  "function isLiquidatable(address account) view returns (bool)",
]);

interface AssetInfo {
  offset: number;
  asset: string;
  priceFeed: string;
  scale: bigint;
  borrowCollateralFactor: bigint;
  liquidateCollateralFactor: bigint;
  liquidationFactor: bigint;
  supplyCap: bigint;
}

const FACTOR = 1e18; // Comet factors + utilization/rates are 1e18-scaled
const PRICE = 1e8; // getPrice returns 8-decimal values in the market's quote unit
const SECONDS_PER_YEAR = 31_536_000;
const ZERO = BigInt(0);

/** Per-market slots in the account phase — the stride the result is read at. */
const PER_ACCOUNT = 8;

function stub(wallet: string, m: CometMarket): CompoundMarketChainResponse {
  return {
    wallet,
    market: m.key,
    comet: m.comet,
    blockNumber: 0,
    baseSymbol: m.baseSymbol,
    baseDecimals: m.baseDecimals,
    quoteUnit: m.quoteUnit,
    supplyBalanceRaw: "0",
    borrowBalanceRaw: "0",
    basePrice: 0,
    collateral: [],
    borrowCapacity: 0,
    liquidationCapacity: 0,
    debtValue: 0,
    healthFactor: null,
    isBorrowCollateralized: true,
    isLiquidatable: false,
    utilization: 0,
    supplyApr: 0,
    borrowApr: 0,
    baseBorrowMin: 0,
    chainStale: true,
  };
}

/**
 * Read one account's live Comet position in EACH of `markets`, at one head
 * block, in three batched calls regardless of how many markets there are.
 *
 * Throws on RPC failure — the callers decide what a failure means (a
 * single-market read falls back to its event-derived numbers; a wallet sweep
 * must not return a short list, because a partial sweep and an empty wallet
 * look identical).
 */
async function loadCompoundPositions(
  wallet: `0x${string}`,
  markets: CometMarket[],
  deployment: CometDeployment,
): Promise<{ blockNumber: number; positions: CompoundMarketChainResponse[] }> {
  const client = chainClient(deployment.chainId);
  // Heterogeneous multicalls: type the entries as the generic viem contract
  // parameters (the per-call return types are asserted at the result casts).
  const at = (comet: string, functionName: string, args: readonly unknown[] = []): ContractFunctionParameters =>
    ({ address: comet as `0x${string}`, abi: COMET_ABI, functionName, args }) as ContractFunctionParameters;

  // The head block is taken FIRST and every call below is pinned to it, rather
  // than read alongside them. On a 2-second chain the difference is not
  // theoretical: an unpinned batch can answer at a later block than the one the
  // response names, and then the receipt's "re-run this call at block N" does
  // not reproduce the figure it is a receipt for. One extra round trip buys a
  // block that is a fact about the answer rather than a label on it.
  const blockNumber = Number(await client.getBlockNumber());
  const atBlock = { blockNumber: BigInt(blockNumber) };

  // Phase 1 — every market's account slots, verdicts, asset count, base feed
  // and utilization, in one multicall.
  const p1 = (await client.multicall({
    allowFailure: false,
    ...atBlock,
    contracts: markets.flatMap((m) => [
      at(m.comet, "balanceOf", [wallet]),
      at(m.comet, "borrowBalanceOf", [wallet]),
      at(m.comet, "isBorrowCollateralized", [wallet]),
      at(m.comet, "isLiquidatable", [wallet]),
      at(m.comet, "numAssets"),
      at(m.comet, "baseTokenPriceFeed"),
      at(m.comet, "baseBorrowMin"),
      at(m.comet, "getUtilization"),
    ]),
  })) as unknown[];

  const numAssets = markets.map((_, i) => Number(p1[i * PER_ACCOUNT + 4] as number));
  const baseFeed = markets.map((_, i) => p1[i * PER_ACCOUNT + 5] as string);
  const utilization = markets.map((_, i) => p1[i * PER_ACCOUNT + 7] as bigint);

  // Phase 2 — every market's collateral roster (getAssetInfo per slot).
  const off2: number[] = [];
  const c2: ContractFunctionParameters[] = [];
  markets.forEach((m, i) => {
    off2[i] = c2.length;
    for (let a = 0; a < numAssets[i]; a++) c2.push(at(m.comet, "getAssetInfo", [a]));
  });
  const p2 = (await client.multicall({ allowFailure: false, ...atBlock, contracts: c2 })) as unknown[];
  const infos: AssetInfo[][] = markets.map((_, i) =>
    Array.from({ length: numAssets[i] }, (_, a) => p2[off2[i] + a] as AssetInfo),
  );

  // Phase 3 — per market: the account's balance in each collateral asset and
  // that asset's configured price, then the base price and the two
  // utilization-dependent rates.
  const off3: number[] = [];
  const c3: ContractFunctionParameters[] = [];
  markets.forEach((m, i) => {
    off3[i] = c3.length;
    for (const a of infos[i]) {
      c3.push(at(m.comet, "collateralBalanceOf", [wallet, a.asset]), at(m.comet, "getPrice", [a.priceFeed]));
    }
    c3.push(
      at(m.comet, "getPrice", [baseFeed[i]]),
      at(m.comet, "getSupplyRate", [utilization[i]]),
      at(m.comet, "getBorrowRate", [utilization[i]]),
    );
  });
  const p3 = (await client.multicall({ allowFailure: false, ...atBlock, contracts: c3 })) as unknown[];

  // Name the held collateral tokens across every market in one cached call.
  const held = markets.map((_, i) =>
    infos[i]
      .map((info, a) => ({
        info,
        balance: p3[off3[i] + a * 2] as bigint,
        price: Number(p3[off3[i] + a * 2 + 1] as bigint) / PRICE,
      }))
      .filter((h) => h.balance > ZERO),
  );
  const metas = await resolveErc20Meta(
    held.flat().map((h) => h.info.asset.toLowerCase()),
    deployment.chainId,
  );

  const positions = markets.map((m, i) => {
    const b = i * PER_ACCOUNT;
    const supply = p1[b] as bigint;
    const borrow = p1[b + 1] as bigint;
    const tail = off3[i] + infos[i].length * 2;
    const basePrice = Number(p3[tail] as bigint) / PRICE;

    let borrowCapacity = 0;
    let liquidationCapacity = 0;
    const collateral: CompoundChainCollateral[] = held[i].map((h) => {
      const addr = h.info.asset.toLowerCase();
      const meta = metas.get(addr);
      const units = Number(h.balance) / Number(h.info.scale);
      const bcf = Number(h.info.borrowCollateralFactor) / FACTOR;
      const lcf = Number(h.info.liquidateCollateralFactor) / FACTOR;
      borrowCapacity += units * h.price * bcf;
      liquidationCapacity += units * h.price * lcf;
      return {
        address: addr,
        symbol: meta?.symbol ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`,
        decimals: meta?.decimals ?? 18,
        balanceRaw: h.balance.toString(),
        price: h.price,
        borrowCollateralFactor: bcf,
        liquidateCollateralFactor: lcf,
        liquidationFactor: Number(h.info.liquidationFactor) / FACTOR,
      };
    });
    collateral.sort((x, y) => {
      const xv = (Number(x.balanceRaw) / 10 ** x.decimals) * x.price;
      const yv = (Number(y.balanceRaw) / 10 ** y.decimals) * y.price;
      return yv - xv;
    });

    const debtValue = (Number(borrow) / 10 ** m.baseDecimals) * basePrice;

    return {
      wallet: wallet.toLowerCase(),
      market: m.key,
      comet: m.comet,
      blockNumber,
      baseSymbol: m.baseSymbol,
      baseDecimals: m.baseDecimals,
      quoteUnit: m.quoteUnit,
      supplyBalanceRaw: supply.toString(),
      borrowBalanceRaw: borrow.toString(),
      basePrice,
      collateral,
      borrowCapacity,
      liquidationCapacity,
      debtValue,
      healthFactor: borrow > ZERO && debtValue > 0 ? liquidationCapacity / debtValue : null,
      isBorrowCollateralized: p1[b + 2] as boolean,
      isLiquidatable: p1[b + 3] as boolean,
      utilization: Number(utilization[i]) / FACTOR,
      supplyApr: (Number(p3[tail + 1] as bigint) * SECONDS_PER_YEAR) / FACTOR,
      borrowApr: (Number(p3[tail + 2] as bigint) * SECONDS_PER_YEAR) / FACTOR,
      baseBorrowMin: Number(p1[b + 6] as bigint) / 10 ** m.baseDecimals,
      chainStale: false,
    } satisfies CompoundMarketChainResponse;
  });

  return { blockNumber, positions };
}

/**
 * One account's live position in ONE market.
 *
 * Returns a `chainStale` stub on RPC failure so the caller falls back to its
 * event-derived numbers (the risk surfaces just stay off).
 */
export async function loadCompoundPositionFromChain(
  walletRaw: string,
  marketKey: string,
  deployment: CometDeployment = COMPOUND_DEPLOYMENT,
): Promise<CompoundMarketChainResponse> {
  const wallet = getAddress(walletRaw);
  const m = deployment.markets.find((x) => x.key === marketKey);
  // An unknown slug is a market this deployment has never heard of. Answer with
  // its own key rather than another market's figures.
  if (!m) return stub(wallet.toLowerCase(), { ...deployment.markets[0], key: marketKey });

  try {
    const { positions } = await loadCompoundPositions(wallet, [m], deployment);
    return positions[0];
  } catch {
    return stub(wallet.toLowerCase(), m);
  }
}

/**
 * Every position one account holds across a whole deployment.
 *
 * This is the Base explorer's front door, and it is exact rather than a sample:
 * every market in the roster is asked, so the smallest position is found as
 * reliably as the largest. A failed read makes the WHOLE sweep stale rather
 * than returning a short list — a partial sweep and an empty wallet look
 * identical on the page, and only one of them is true.
 */
export async function loadCompoundWalletFromChain(
  walletRaw: string,
  deployment: CometDeployment,
): Promise<CompoundWalletChainResponse> {
  const wallet = getAddress(walletRaw);
  const marketsScanned = deployment.markets.length;
  try {
    const { blockNumber, positions } = await loadCompoundPositions(wallet, deployment.markets, deployment);
    // "Holds something" is any of the three ways a Comet account can be
    // non-empty: lent base, borrowed base, or collateral parked against it.
    // The third stands alone — collateral with no debt is a real position, and
    // one worth seeing, since it is earning nothing where it sits.
    const held = positions.filter(
      (p) => p.supplyBalanceRaw !== "0" || p.borrowBalanceRaw !== "0" || p.collateral.length > 0,
    );
    return {
      wallet: wallet.toLowerCase(),
      blockNumber,
      marketsScanned,
      positionsFound: held.length,
      positions: held,
      chainStale: false,
    };
  } catch (error) {
    console.error("Compound V3 wallet sweep failed:", error);
    return {
      wallet: wallet.toLowerCase(),
      blockNumber: 0,
      marketsScanned,
      positionsFound: 0,
      positions: [],
      chainStale: true,
    };
  }
}
