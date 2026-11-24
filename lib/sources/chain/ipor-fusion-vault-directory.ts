// Every vault the IPOR Fusion factory made on a chain, read at ONE pinned
// block: the roster behind /<chain>/ipor-fusion/vaults. SERVER-ONLY.
// ----------------------------------------------------------------------------
// The census (lib/ipor-fusion/vault-catalog.ts) says which vaults exist and what
// cannot change about them: address, creation, asset, share decimals. This
// loader reads what moves, per vault: `name()`, `totalAssets()`,
// `totalSupply()` and one whole share through `convertToAssets()`, each at one
// block the page prints.
//
// ONE WHOLE SHARE IS `convertToAssets(10 ** shareDecimals)`. A PlasmaVault's
// share carries a decimals offset over its asset (a WETH vault's shares have
// 20 decimals), so the exponent is the share's decimals from the census, and
// the answer is in the asset's units.
//
// A ZERO AND AN ABSENCE STAY APART: `totalAssets` zero is an empty vault, a
// reading; null is a call that did not answer.
//
// CACHED FOR FIVE MINUTES PER CHAIN, WITH THE BLOCK STATED; a failed read is
// never cached. The Yearn roster's loader keeps the same contract.

import { unstable_cache } from "next/cache";
import { parseAbi } from "viem";
import { vaultHeadClient } from "@/lib/sources/api/head-reads-client";
import { serverHeadStampAt } from "@/lib/sources/api/server-head-stamps";
import type { PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";
import type { RawAmount } from "./morpho-base-vault";
import { iporFusionRoster, type IporFusionChainId } from "@/lib/ipor-fusion/vault-roster";
import { rethrowAtBuild } from "@/lib/sources/api/route-gate";

const VAULT_ABI = parseAbi([
  "function name() view returns (string)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
]);
const PER = 4;

/** Multicall3 requests each chain's roster is split across, so a request
 *  holds about 290 calls (four per vault): Ethereum's 181 vaults in 3,
 *  Arbitrum's 257 and Base's 291 in 4. `batchSize: 0` stops viem splitting
 *  further, so the count is a fact about the code. */
const DIRECTORY_REQUESTS: Record<IporFusionChainId, number> = { 1: 3, 42161: 4, 8453: 4 };

export const IPOR_FUSION_DIRECTORY_REVALIDATE_SECONDS = 300;

type Call = { status: string; result?: unknown };
const ok = (r: Call | undefined): unknown => (r?.status === "success" ? r.result : undefined);
const amount = (raw: bigint, decimals: number): RawAmount => ({
  raw: raw.toString(),
  value: Number(raw) / Math.pow(10, decimals),
});

export interface IporFusionVaultDirectoryRow {
  /** Lowercased: the row's identity and its page's route. */
  address: string;
  /** The factory's clone index, from the creation event. */
  index: number;
  /** The factory version the event stamped; null for the mid-2025 struct signature. */
  version: number | null;
  createdBlock: number;
  /** `name()` at the pinned block; null when it did not answer. */
  name: string | null;
  /** `name()` and `symbol()` at the census block: labelled snapshots. */
  censusName: string | null;
  censusSymbol: string | null;
  asset: { address: string; symbol: string; decimals: number; named: boolean };
  shareDecimals: number;
  totalAssets: RawAmount | null;
  totalSupply: RawAmount | null;
  /** One whole share in the asset; null when the call did not answer. */
  sharePrice: RawAmount | null;
}

export interface IporFusionVaultDirectoryResponse {
  chainId: IporFusionChainId;
  blockNumber: number;
  head?: PositionHeadStamp;
  chainStale: boolean;
  /** The factory proxy whose creation events are the roster, lowercased. */
  factory: string;
  censusBlock: number;
  censusBlockIso: string;
  catalogSize: number;
  readAt: string;
  rows: IporFusionVaultDirectoryRow[];
}

async function readDirectory(chainId: IporFusionChainId): Promise<IporFusionVaultDirectoryResponse> {
  const roster = iporFusionRoster(chainId);
  const base = {
    chainId,
    factory: roster.factory,
    censusBlock: roster.censusBlock,
    censusBlockIso: roster.censusBlockIso,
    catalogSize: roster.vaults.length,
  };
  try {
    const client = vaultHeadClient(chainId);
    const blockNumber = await client.getBlockNumber();
    const vaults = roster.vaults;
    const requests = DIRECTORY_REQUESTS[chainId];
    const size = Math.ceil(vaults.length / requests);
    const chunks = Array.from({ length: requests }, (_, i) => vaults.slice(i * size, (i + 1) * size)).filter(
      (c) => c.length > 0,
    );
    const results = (await Promise.all(
      chunks.map((chunk) =>
        client.multicall({
          contracts: chunk.flatMap((v) => {
            const address = v.address as `0x${string}`;
            return [
              { address, abi: VAULT_ABI, functionName: "name" },
              { address, abi: VAULT_ABI, functionName: "totalAssets" },
              { address, abi: VAULT_ABI, functionName: "totalSupply" },
              {
                address,
                abi: VAULT_ABI,
                functionName: "convertToAssets",
                args: [BigInt(10) ** BigInt(v.shareDecimals)],
              },
            ];
          }),
          batchSize: 0,
          allowFailure: true,
          blockNumber,
        }),
      ),
    )) as Call[][];

    const rows: IporFusionVaultDirectoryRow[] = [];
    chunks.forEach((chunk, c) =>
      chunk.forEach((v, i) => {
        const at = (k: number) => ok(results[c][i * PER + k]);
        const ad = v.asset.decimals;
        const ta = at(1) as bigint | undefined;
        const ts = at(2) as bigint | undefined;
        const sp = at(3) as bigint | undefined;
        rows.push({
          address: v.address.toLowerCase(),
          index: v.index,
          version: v.version,
          createdBlock: v.createdBlock,
          name: (at(0) as string | undefined) ?? null,
          censusName: v.name,
          censusSymbol: v.symbol,
          asset: {
            address: v.asset.address.toLowerCase(),
            symbol: v.asset.symbol || v.asset.address.slice(0, 6),
            decimals: ad,
            named: Boolean(v.asset.symbol),
          },
          shareDecimals: v.shareDecimals,
          totalAssets: ta == null ? null : amount(ta, ad),
          totalSupply: ts == null ? null : amount(ts, v.shareDecimals),
          sharePrice: sp == null ? null : amount(sp, ad),
        });
      }),
    );
    return {
      ...base,
      blockNumber: Number(blockNumber),
      head: serverHeadStampAt(chainId, blockNumber),
      chainStale: false,
      readAt: new Date().toISOString(),
      rows,
    };
  } catch (error) {
    rethrowAtBuild(error);
    console.error(`IPOR Fusion vault roster chain read failed on chain ${chainId}:`, error);
    return { ...base, blockNumber: 0, chainStale: true, readAt: new Date().toISOString(), rows: [] };
  }
}

const isReadable = (d: IporFusionVaultDirectoryResponse) => !d.chainStale && d.rows.some((r) => r.totalAssets != null);

const cachedDirectory = unstable_cache(
  (chainId: IporFusionChainId) => readDirectory(chainId),
  ["ipor-fusion-vault-directory"],
  { revalidate: IPOR_FUSION_DIRECTORY_REVALIDATE_SECONDS },
);

/** Every censused IPOR Fusion vault on `chainId` at one pinned block, cached
 *  five minutes; a failed read is returned stale and not cached. */
export async function loadIporFusionVaultDirectory(
  chainId: IporFusionChainId,
): Promise<IporFusionVaultDirectoryResponse> {
  const cached = await cachedDirectory(chainId);
  if (isReadable(cached)) return cached;
  return readDirectory(chainId);
}
