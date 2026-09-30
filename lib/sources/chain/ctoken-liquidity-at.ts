// Why a Compound V2-family account could be liquidated, read from the chain at
// the liquidation's block: the Comptroller's own `getAccountLiquidity` at the
// block before (a shortfall above zero is what lets anyone liquidate) and at
// the block itself (after the liquidation), the close factor in force, and the
// collateral market's `protocolSeizeShareMantissa` (the part of the seized
// cTokens/mTokens the market keeps as reserves).
//
// Archive `eth_call`s, one batch. SERVER-ONLY.

import { parseAbi, type PublicClient } from "viem";
import { chainBatchClient } from "./rpc";
import { COMPOUND_V2_ADDRESSES, COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import { MOONWELL_ADDRESSES, MOONWELL_MARKET_BY_KEY } from "@/lib/moonwell/asset-catalog";
import { MOONWELL_BASE_COMPTROLLER } from "@/lib/moonwell-base/asset-catalog";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { CTokenLiquidityAt, CTokenProtocol } from "@/lib/api/fetch-ctoken-liquidity-at";

const COMPTROLLER_ABI = parseAbi([
  "function getAccountLiquidity(address account) view returns (uint256, uint256, uint256)",
  "function closeFactorMantissa() view returns (uint256)",
]);
const CTOKEN_ABI = parseAbi([
  "function protocolSeizeShareMantissa() view returns (uint256)",
  "function borrowBalanceStored(address account) view returns (uint256)",
  "function borrowIndex() view returns (uint256)",
]);

const ADDRESS = /^0x[0-9a-f]{40}$/;

function deployment(protocol: CTokenProtocol): {
  chainId: ChainId;
  comptroller: string;
  token: (key: string) => string | undefined;
} {
  if (protocol === "compound-v2")
    return {
      chainId: MAINNET_CHAIN_ID,
      comptroller: COMPOUND_V2_ADDRESSES.COMPTROLLER,
      token: (k) => COMPOUND_V2_MARKET_BY_KEY[k]?.ctoken,
    };
  if (protocol === "moonwell")
    return {
      chainId: MAINNET_CHAIN_ID,
      comptroller: MOONWELL_ADDRESSES.COMPTROLLER,
      token: (k) => MOONWELL_MARKET_BY_KEY[k]?.mtoken,
    };
  return {
    chainId: BASE_CHAIN_ID,
    comptroller: MOONWELL_BASE_COMPTROLLER,
    // Base keys each market by its mToken address.
    token: (k) => (ADDRESS.test(k) ? k : undefined),
  };
}

const WAD = 1e18;

export async function readCTokenLiquidityAt(
  protocol: CTokenProtocol,
  wallet: string,
  block: number,
  collateral: string,
  debtMarket?: string,
): Promise<CTokenLiquidityAt | null> {
  const d = deployment(protocol);
  const collToken = d.token(collateral.toLowerCase());
  const debtToken = debtMarket ? d.token(debtMarket.toLowerCase()) : undefined;
  const client = chainBatchClient(d.chainId) as PublicClient;
  const comptroller = d.comptroller as `0x${string}`;
  const account = wallet as `0x${string}`;
  const liq = (b: number) =>
    client
      .readContract({
        address: comptroller,
        abi: COMPTROLLER_ABI,
        functionName: "getAccountLiquidity",
        args: [account],
        blockNumber: BigInt(b),
      })
      .then((r) => r as readonly [bigint, bigint, bigint])
      .catch(() => null);
  const read = (address: string | undefined, functionName: "borrowIndex" | "borrowBalanceStored", b: number) =>
    address
      ? client
          .readContract({
            address: address as `0x${string}`,
            abi: CTOKEN_ABI,
            functionName,
            args: functionName === "borrowBalanceStored" ? [account] : [],
            blockNumber: BigInt(b),
          } as never)
          .then((r) => r as bigint)
          .catch(() => null)
      : Promise.resolve(null);
  const [before, after, closeFactor, share, stored, idxBefore, idxAt] = await Promise.all([
    liq(block - 1),
    liq(block),
    client
      .readContract({
        address: comptroller,
        abi: COMPTROLLER_ABI,
        functionName: "closeFactorMantissa",
        blockNumber: BigInt(block - 1),
      })
      .then((r) => Number(r as bigint) / WAD)
      .catch(() => null),
    collToken
      ? client
          .readContract({
            address: collToken as `0x${string}`,
            abi: CTOKEN_ABI,
            functionName: "protocolSeizeShareMantissa",
            blockNumber: BigInt(block),
          })
          .then((r) => Number(r as bigint) / WAD)
          .catch(() => null)
      : Promise.resolve(null),
    read(debtToken, "borrowBalanceStored", block - 1),
    read(debtToken, "borrowIndex", block - 1),
    read(debtToken, "borrowIndex", block),
  ]);
  // The debt as the liquidation met it: the stored balance at the block
  // before, carried to the block's own borrow index (interest accrues once
  // per block, before the liquidation reads it).
  const debtBeforeRaw =
    stored != null && idxBefore != null && idxAt != null && idxBefore > BigInt(0)
      ? ((stored * idxAt) / idxBefore).toString()
      : null;
  if (!before && !after) return null;
  const side = (r: readonly [bigint, bigint, bigint] | null) =>
    r && r[0] === BigInt(0) ? { liquidityUsd: Number(r[1]) / WAD, shortfallUsd: Number(r[2]) / WAD } : null;
  return {
    block,
    before: side(before),
    after: side(after),
    closeFactor,
    protocolSeizeShare: share,
    debtBeforeRaw,
  };
}
