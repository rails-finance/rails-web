// A Morpho Blue market's oracle price at a list of past blocks, for the
// Lifetime flows panel's one price per UTC day (lib/morpho/price-days.ts;
// rails-ops TO-DO-ui-jobs.md item 687). The market's params are read once a
// process, at the highest block first asked (they are immutable, and a past
// block replays from cache), then one oracle price() per block. The opened card's fuller read,
// the borrow rate and the block before, stays on /api/chain/morpho/at-block.
//
// SERVER-ONLY.

import { parseAbi, type PublicClient } from "viem";
import { chainBatchClient, chainClient } from "./rpc";
import { resolveErc20Meta, assertDecimalsRead } from "./erc20-meta";
import { MORPHO_DEPLOYMENT, type MorphoDeployment } from "./morpho-deployments";
import { ARBITRUM_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

const MORPHO_ABI = parseAbi([
  "function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
]);
const ORACLE_ABI = parseAbi(["function price() view returns (uint256)"]);

/** A market's params, by chain and id, for the process's life: they never change. */
const PARAMS = new Map<
  string,
  Promise<readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, bigint]>
>();

export interface MorphoPricesResponse {
  marketId: string;
  /** [block, loan token per one collateral token]; 0 where the oracle did
   *  not answer at that block. Ascending by block. */
  prices: [number, number][];
}

export interface MorphoPricesDeps {
  client?: Pick<PublicClient, "readContract">;
  /** The loan and collateral tokens' decimals. */
  decimals?: (loanToken: string, collateralToken: string) => Promise<[number, number]>;
}

async function readDecimals(loanToken: string, collateralToken: string, chainId: ChainId): Promise<[number, number]> {
  const metas = await resolveErc20Meta([loanToken.toLowerCase(), collateralToken.toLowerCase()], chainId);
  assertDecimalsRead(metas, [loanToken, collateralToken]);
  return [metas.get(loanToken.toLowerCase())?.decimals ?? 18, metas.get(collateralToken.toLowerCase())?.decimals ?? 18];
}

/** The oracle's price at each block, ascending. Throws where the params read
 *  fails; a block whose price() fails answers 0. */
export async function loadMorphoPricesAtBlocks(
  marketRaw: string,
  blocks: readonly number[],
  deployment: MorphoDeployment = MORPHO_DEPLOYMENT,
  deps: MorphoPricesDeps = {},
): Promise<MorphoPricesResponse> {
  const marketId = (marketRaw.startsWith("0x") ? marketRaw : `0x${marketRaw}`).toLowerCase() as `0x${string}`;
  const sorted = [...new Set(blocks)].sort((a, b) => a - b);
  if (sorted.length === 0) return { marketId, prices: [] };
  const arbitrum = deployment.chainId === ARBITRUM_CHAIN_ID;
  // Batched on the keyed providers; the keyless Arbitrum gateway takes two at a time.
  const client = deps.client ?? (arbitrum ? chainClient(deployment.chainId) : chainBatchClient(deployment.chainId));
  const key = `${deployment.chainId}:${marketId}`;
  let params = PARAMS.get(key);
  if (!params) {
    params = client.readContract({
      address: deployment.blue as `0x${string}`,
      abi: MORPHO_ABI,
      functionName: "idToMarketParams",
      args: [marketId],
      blockNumber: BigInt(sorted[sorted.length - 1]),
    });
    PARAMS.set(key, params);
    params.catch(() => PARAMS.delete(key));
  }
  const [loanToken, collateralToken, oracle] = await params;
  const [loanDecimals, collateralDecimals] = await (
    deps.decimals ?? ((l, c) => readDecimals(l, c, deployment.chainId))
  )(loanToken, collateralToken);
  const scale = 10 ** (36 + loanDecimals - collateralDecimals);
  const out: [number, number][] = sorted.map((b) => [b, 0]);
  let next = 0;
  const worker = async () => {
    while (next < sorted.length) {
      const i = next++;
      try {
        const raw = await client.readContract({
          address: oracle,
          abi: ORACLE_ABI,
          functionName: "price",
          blockNumber: BigInt(sorted[i]),
        });
        out[i][1] = raw > BigInt(0) ? Number(raw) / scale : 0;
      } catch {
        out[i][1] = 0;
      }
    }
  };
  const atOnce = arbitrum ? 2 : sorted.length;
  await Promise.all(Array.from({ length: Math.min(atOnce, sorted.length) }, worker));
  return { marketId, prices: out };
}
