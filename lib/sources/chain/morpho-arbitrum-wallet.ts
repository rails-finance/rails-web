// Every Morpho Blue position one wallet holds on Arbitrum One — server-only.
// ----------------------------------------------------------------------------
// The Base wallet read (morpho-wallet.ts) at one pinned block: the head block
// is read once, `position(id, user)` is asked of every censused market (258,
// one multicall) plus any market the wallet's history names that the census
// does not hold, and each held market's full read (market state, the market's
// oracle, the IRM) runs at that same block. Then the Aave V3 Arbitrum oracle
// prices the held markets' loan tokens at that block, for the dollar figures
// (lib/morpho-arbitrum/usd.ts). Returns a `chainStale` stub on failure, never
// an empty roster.
//
// SERVER-ONLY.

import { getAddress, parseAbi } from "viem";
import { chainClient } from "./rpc";
import { loadMorphoPositionFromChain } from "./morpho-position";
import { MORPHO_ARBITRUM_DEPLOYMENT } from "./morpho-deployments";
import type { MorphoWalletChainResponse } from "@/lib/api/fetch-morpho-wallet";
import { AAVE_V3_ARBITRUM_ORACLE } from "@/lib/aave-v3-arbitrum/asset-catalog";

const BLUE_ABI = parseAbi([
  "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
]);
const AAVE_ORACLE_ABI = parseAbi(["function getAssetPrice(address asset) view returns (uint256)"]);

const ZERO = BigInt(0);
/** The Aave oracle's base currency unit: USD with 8 decimals. */
const AAVE_USD_UNIT = 1e8;
/** Held markets read in full; `positionsFound` states any beyond. */
const MAX_DETAILED = 40;
const DETAIL_CONCURRENCY = 4;
const MARKET_ID = /^0x[0-9a-f]{64}$/;

function stub(wallet: string, marketsScanned = 0): MorphoWalletChainResponse {
  return {
    wallet,
    blockNumber: 0,
    censusBlock: MORPHO_ARBITRUM_DEPLOYMENT.censusBlock,
    marketsScanned,
    positionsFound: 0,
    positions: [],
    chainStale: true,
  };
}

async function pooled<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await work(items[i]);
      }
    }),
  );
  return out;
}

/** `extraMarketIds`: markets the wallet's history names, asked beside the
 *  census (a market created after the census block is otherwise not asked). */
export async function loadMorphoArbitrumWallet(
  walletRaw: string,
  extraMarketIds: readonly string[] = [],
): Promise<MorphoWalletChainResponse> {
  const deployment = MORPHO_ARBITRUM_DEPLOYMENT;
  let wallet: `0x${string}`;
  try {
    wallet = getAddress(walletRaw);
  } catch {
    return stub(walletRaw.toLowerCase());
  }
  const ids = [...new Set([...deployment.markets.map((m) => m.id.toLowerCase()), ...extraMarketIds.map(norm)])].filter(
    (id) => MARKET_ID.test(id),
  );

  try {
    const client = chainClient(deployment.chainId);
    const blue = deployment.blue as `0x${string}`;
    const blockNumber = await client.getBlockNumber();
    const slots = (await client.multicall({
      allowFailure: true,
      blockNumber,
      batchSize: 0,
      contracts: ids.map((id) => ({
        address: blue,
        abi: BLUE_ABI,
        functionName: "position" as const,
        args: [id as `0x${string}`, wallet] as const,
      })),
    })) as { status: string; result?: readonly [bigint, bigint, bigint] }[];
    if (slots.some((r) => r.status !== "success")) {
      console.error("Morpho Arbitrum wallet read: a position slot did not answer");
      return stub(wallet.toLowerCase(), ids.length);
    }

    const held = ids.filter((_, i) => {
      const p = slots[i].result;
      return p != null && (p[0] > ZERO || p[1] > ZERO || p[2] > ZERO);
    });
    // The keyless gateway refuses a burst now and then; a market whose full
    // read failed is asked once more before the answer counts as stale.
    const detailed = await pooled(held.slice(0, MAX_DETAILED), DETAIL_CONCURRENCY, async (id) => {
      const first = await loadMorphoPositionFromChain(id, wallet, deployment, blockNumber);
      return first.chainStale ? loadMorphoPositionFromChain(id, wallet, deployment, blockNumber) : first;
    });
    // A held market whose full read failed is a read we do not have: the
    // whole answer is stale rather than quietly short.
    if (detailed.some((p) => p.chainStale)) {
      console.error("Morpho Arbitrum wallet read: a held market's full read failed twice");
      return stub(wallet.toLowerCase(), ids.length);
    }
    const positions = detailed.sort((a, b) => b.currentDebt - a.currentDebt || b.collateralValue - a.collateralValue);

    return {
      wallet: wallet.toLowerCase(),
      blockNumber: Number(blockNumber),
      censusBlock: deployment.censusBlock,
      marketsScanned: ids.length,
      positionsFound: held.length,
      positions,
      chainStale: false,
      loanUsd: await loanUsdAt(client, [...new Set(positions.map((p) => p.loanToken.toLowerCase()))], blockNumber),
    };
  } catch (error) {
    console.error("Morpho Arbitrum wallet read failed:", error);
    return stub(wallet.toLowerCase(), ids.length);
  }
}

/** Dollars per whole token from the Aave V3 Arbitrum oracle at `blockNumber`,
 *  for the tokens it prices; a token it does not list reverts and is left out. */
export async function loanUsdAt(
  client: ReturnType<typeof chainClient>,
  tokens: string[],
  blockNumber: bigint,
): Promise<Record<string, number>> {
  if (tokens.length === 0) return {};
  const res = await client.multicall({
    allowFailure: true,
    blockNumber,
    contracts: tokens.map((t) => ({
      address: AAVE_V3_ARBITRUM_ORACLE as `0x${string}`,
      abi: AAVE_ORACLE_ABI,
      functionName: "getAssetPrice" as const,
      args: [t as `0x${string}`] as const,
    })),
  });
  const out: Record<string, number> = {};
  tokens.forEach((t, i) => {
    const r = res[i];
    if (r.status === "success" && (r.result as bigint) > ZERO) out[t] = Number(r.result as bigint) / AAVE_USD_UNIT;
  });
  return out;
}

const norm = (id: string): string => (id.startsWith("0x") ? id : `0x${id}`).toLowerCase();
