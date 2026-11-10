// The "decimals disagree" standing (Miles, 10 Nov 2026): a vault's asset that
// wraps another token (ERC-4626 `asset()`) and whose stated `decimals()`
// disagrees with the scale its own conversion works at.
// ----------------------------------------------------------------------------
// The test: `convertToAssets(10^18)` gives what 10^18 of the asset's units
// are worth in the token it wraps. Scaled to one unit at the stated decimals,
// a wrapper whose decimals are right gives back about one unit of what it
// wraps; Rails marks the asset when it gives back less than a millionth or
// more than a million. The decimals the conversion implies are the stated
// ones moved by that ratio's power of ten. Every figure stays as the chain
// states it, read at the stated decimals: the pill says by how much they read
// off. Wrapped USDL (wUSDL) states 6 and converts at 18.
//
// SERVER-ONLY: the reads use the RPC keys.

import "server-only";
import { unstable_cache } from "next/cache";
import { parseAbi, type Address } from "viem";
import type { ChainId } from "@/lib/shared/chains";
import { vaultHeadClient } from "@/lib/sources/api/head-reads-client";
import { impliedDecimals, type AssetScale } from "@/lib/vaults/asset-scale-words";

export type { AssetScale };

const PROBE = BigInt(10) ** BigInt(18);

const ABI = parseAbi([
  "function asset() view returns (address)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function convertToAssets(uint256) view returns (uint256)",
]);

async function readScales(chainId: ChainId, assets: string[]): Promise<Record<string, AssetScale>> {
  const c = vaultHeadClient(chainId);
  const list = [...new Set(assets.map((a) => a.toLowerCase()))] as Address[];
  const first = await c.multicall({
    allowFailure: true,
    contracts: list.flatMap((address) => [
      { address, abi: ABI, functionName: "asset" } as const,
      { address, abi: ABI, functionName: "decimals" } as const,
      { address, abi: ABI, functionName: "convertToAssets", args: [PROBE] } as const,
    ]),
  });
  const wrappers = list
    .map((address, i) => {
      const [a, d, p] = [first[i * 3], first[i * 3 + 1], first[i * 3 + 2]];
      return a.status === "success" && d.status === "success" && p.status === "success"
        ? { address, wraps: a.result as Address, stated: Number(d.result), per1e18: p.result as bigint }
        : null;
    })
    .filter((w) => w != null);
  if (wrappers.length === 0) return {};
  const second = await c.multicall({
    allowFailure: true,
    contracts: wrappers.flatMap((w) => [
      { address: w.wraps, abi: ABI, functionName: "decimals" } as const,
      { address: w.wraps, abi: ABI, functionName: "symbol" } as const,
    ]),
  });
  const out: Record<string, AssetScale> = {};
  wrappers.forEach((w, i) => {
    const [d, s] = [second[i * 2], second[i * 2 + 1]];
    if (d.status !== "success") return;
    const implied = impliedDecimals(w.stated, Number(d.result), w.per1e18);
    if (implied == null) return;
    out[w.address] = {
      stated: w.stated,
      implied,
      wraps: {
        address: w.wraps.toLowerCase(),
        symbol: s.status === "success" ? String(s.result) : w.wraps,
        decimals: Number(d.result),
      },
      per1e18: w.per1e18.toString(),
    };
  });
  return out;
}

/** The assets among `assets` whose scales disagree, by lowercased address.
 *  Cached for five minutes, the rosters' window; a read that fails marks
 *  nothing. */
export const loadAssetScales = unstable_cache(
  (chainId: ChainId, assets: string[]) =>
    readScales(chainId, assets).catch((error) => {
      console.error(`The asset scale read did not answer (chain ${chainId}):`, error);
      return {} as Record<string, AssetScale>;
    }),
  ["vault-asset-scales"],
  { revalidate: 300 },
);
