// Compound V2's own oracle price for a market at a past block — what the flows
// panel values each row at, so a 2020 deposit reads at 2020's price.
// ----------------------------------------------------------------------------
// For each block: the Comptroller's `oracle()` at that block, then that
// oracle's `getUnderlyingPrice(cToken)` for each market asked. The answer is
// scaled 1e(36 − underlying decimals). Before block 10,678,764 (the oracle
// migration of August 2020) Compound's oracle priced in ETH, not dollars; there
// the market's ETH price is divided by the same oracle's USDC price at the same
// block (ETH per USDC), which is how many dollars one ETH was worth to
// Compound. The liquidation rows' own at-block prices use the same boundary
// (lib/compound-v2/liquidation-values.ts).
//
// Archive `eth_call`s, batched. Multicall3 did not exist before 2022, so each
// read is its own call. A past block's answer never changes, so answers are
// kept in memory for the life of the process.
//
// SERVER-ONLY.

import { parseAbi, type PublicClient } from "viem";
import { chainBatchClient } from "./rpc";
import { COMPOUND_V2_ADDRESSES, COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import { COMPOUND_V2_USD_ORACLE_BLOCK, compoundV2UsdAtBlock } from "@/lib/compound-v2/at-block-prices";

export { COMPOUND_V2_USD_ORACLE_BLOCK };

const COMPTROLLER_ABI = parseAbi(["function oracle() view returns (address)"]);
const ORACLE_ABI = parseAbi(["function getUnderlyingPrice(address cToken) view returns (uint256)"]);

const cache = new Map<string, number | null>();
const MAX_CACHE = 20_000;

/** `pairs` are `${block}:${marketKey}`. Returns USD per underlying token for
 *  each pair it could read; a pair it could not is absent. */
export async function compoundV2PricesAt(pairs: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const byBlock = new Map<number, Set<string>>();
  for (const p of pairs) {
    const [b, market] = p.split(":");
    const block = Number(b);
    if (!Number.isInteger(block) || block <= 0 || !COMPOUND_V2_MARKET_BY_KEY[market]) continue;
    const hit = cache.get(p);
    if (hit !== undefined) {
      if (hit != null) out[p] = hit;
      continue;
    }
    const set = byBlock.get(block) ?? new Set<string>();
    set.add(market);
    byBlock.set(block, set);
  }
  if (byBlock.size === 0) return out;

  const client = chainBatchClient() as PublicClient;
  await Promise.all(
    [...byBlock.entries()].map(async ([block, markets]) => {
      const blockNumber = BigInt(block);
      let oracle: `0x${string}`;
      try {
        oracle = (await client.readContract({
          address: COMPOUND_V2_ADDRESSES.COMPTROLLER as `0x${string}`,
          abi: COMPTROLLER_ABI,
          functionName: "oracle",
          blockNumber,
        })) as `0x${string}`;
      } catch {
        return;
      }
      const inEth = block < COMPOUND_V2_USD_ORACLE_BLOCK;
      const wanted = [...markets];
      if (inEth && !markets.has("usdc")) wanted.push("usdc");
      const raws = await Promise.all(
        wanted.map((m) =>
          client
            .readContract({
              address: oracle,
              abi: ORACLE_ABI,
              functionName: "getUnderlyingPrice",
              args: [COMPOUND_V2_MARKET_BY_KEY[m].ctoken as `0x${string}`],
              blockNumber,
            })
            .then((r) => r as bigint)
            .catch(() => null),
        ),
      );
      // The conversion the stored prices take too (lib/compound-v2/at-block-prices.ts).
      const usdByMarket = compoundV2UsdAtBlock(block, markets, new Map(wanted.map((m, i) => [m, raws[i]])));
      for (const m of markets) {
        const key = `${block}:${m}`;
        const usd = usdByMarket.get(m) ?? null;
        if (cache.size > MAX_CACHE) cache.clear();
        cache.set(key, usd);
        if (usd != null) out[key] = usd;
      }
    }),
  );
  return out;
}
