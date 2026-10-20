// The cross-protocol vault index's read (rails-ops ui-jobs 39; decision 0028
// point 8): the union of the vault rosters that have a page, as one
// `VaultSummary[]`.
// ----------------------------------------------------------------------------
// A vault is what a protocol roster lists, and nothing else enters: Morpho's
// MetaMorpho roster on Base, Aave's vault roster on Ethereum (savings GHO, the
// static aTokens, the Umbrella stake tokens), Yearn V3's roster on Ethereum,
// and Maple's two syrup pools, which keep their pools page and join here
// as rows (survey 2026-10-20 §7.6). Each roster is read by its loader at its
// block, the same read its page makes, and the index names each
// block. Holders is each roster's census where it has one; Yield is the daily
// store's (decision 0047), which serves no Maple series.
//
// SERVER-ONLY: the loaders read ALCHEMY_URL, RAILS_API_URL and the bearer token.

import { unstable_cache } from "next/cache";
import { loadMorphoBaseVaultDirectory } from "@/lib/sources/chain/morpho-base-vault-directory";
import { loadAaveEthereumVaultDirectory } from "@/lib/sources/chain/aave-ethereum-vault-directory";
import { loadYearnEthereumVaultDirectory } from "@/lib/sources/chain/yearn-ethereum-vault-directory";
import { resolveMaplePoolState, type MaplePoolState } from "@/lib/sources/chain/maple-pool-state";
import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { ssrHop } from "@/lib/shared/listing-ssr";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { MAPLE_POOLS } from "@/lib/maple/asset-catalog";
import { aaveVaultAttestation } from "@/lib/aave-vaults/vault-catalog";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";
import {
  aaveEthereumVaultSummaries,
  maplePoolSummary,
  morphoBaseVaultSummaries,
  yearnVaultSummaries,
  type VaultSummary,
} from "@/lib/vaults/summary";
import { loadVaultYields } from "@/lib/vaults/yield-read";
import type { VaultYield } from "@/lib/vaults/yield";
import { vaultIndexKey, type VaultIndexRoster } from "@/lib/vaults/index-rosters";

export interface VaultIndexRead {
  vaults: VaultSummary[];
  /** Decision 0047's figure by `vaultIndexKey`. */
  yields: Record<string, VaultYield>;
  /** One entry per roster, in the index's order. */
  rosters: VaultIndexRoster[];
}

/** One chain's census header: the rows' Holders. An unanswered census leaves
 *  the figure out. */
async function loadCensus(chainId: number): Promise<VaultCensusRow[]> {
  try {
    const hop = await ssrHop();
    const r = await fetchVaultPositions({ chainId, overlay: false, limit: 1, ...hop });
    return r.census;
  } catch (error) {
    console.error(`The vault census did not answer for the vault index (chain ${chainId}):`, error);
    return [];
  }
}

/** Maple's pool read, cached for five minutes like the rosters' loaders. The
 *  pools page reads the same function on a ten-minute ISR. */
const loadMaplePools = unstable_cache(
  async (): Promise<{ states: MaplePoolState[]; readAt: string }> => {
    const map = await resolveMaplePoolState();
    return { states: [...map.values()], readAt: new Date().toISOString() };
  },
  ["vault-index-maple-pools"],
  { revalidate: 300 },
);

export async function loadVaultIndex(): Promise<VaultIndexRead> {
  const [morpho, aave, yearn, maple, baseCensus, ethCensus] = await Promise.all([
    loadMorphoBaseVaultDirectory(),
    loadAaveEthereumVaultDirectory(),
    loadYearnEthereumVaultDirectory(),
    loadMaplePools().catch((error) => {
      console.error("Maple's pools did not answer for the vault index:", error);
      return { states: [] as MaplePoolState[], readAt: new Date().toISOString() };
    }),
    loadCensus(BASE_CHAIN_ID),
    loadCensus(MAINNET_CHAIN_ID),
  ]);

  const morphoVaults = morphoBaseVaultSummaries(morpho, baseCensus);
  const aaveVaults = aaveEthereumVaultSummaries(
    aave,
    (address) => aaveVaultAttestation(address, aave.rows.find((r) => r.address === address)!.family).kind === "book",
    ethCensus,
  );
  const yearnVaults = yearnVaultSummaries(yearn);
  const mapleBlock = maple.states[0]?.blockNumber ?? 0;
  const mapleStale = maple.states.length === 0;
  const mapleVaults = mapleStale
    ? []
    : MAPLE_POOLS.map((p) =>
        maplePoolSummary(
          p,
          maple.states.find((s) => s.pool === p.key),
          { block: mapleBlock, timestamp: maple.readAt },
        ),
      );

  const [baseYields, ethYields] = await Promise.all([
    loadVaultYields(
      BASE_CHAIN_ID,
      morphoVaults.map((v) => v.address),
    ),
    loadVaultYields(
      MAINNET_CHAIN_ID,
      [...aaveVaults, ...yearnVaults].map((v) => v.address),
    ),
  ]);
  const yields: Record<string, VaultYield> = {};
  for (const v of morphoVaults) if (baseYields[v.address]) yields[vaultIndexKey(v)] = baseYields[v.address];
  for (const v of [...aaveVaults, ...yearnVaults])
    if (ethYields[v.address]) yields[vaultIndexKey(v)] = ethYields[v.address];
  // The store keeps no Maple series (decision 0047, "Out of scope"), so it is
  // not asked; the rows say so.
  for (const v of mapleVaults) yields[vaultIndexKey(v)] = { none: "no-series" };

  const ethCensusBlock = ethCensus.length > 0 ? Math.max(...ethCensus.map((c) => c.censusBlock)) : null;
  return {
    vaults: [...morphoVaults, ...aaveVaults, ...yearnVaults, ...mapleVaults],
    yields,
    rosters: [
      {
        protocol: "morpho",
        chainId: BASE_CHAIN_ID,
        blockNumber: morpho.blockNumber,
        chainStale: morpho.chainStale,
        count: morphoVaults.length,
        catalog: { catalogSize: morpho.catalogSize, censusBlock: morpho.censusBlock },
      },
      {
        protocol: "aave",
        chainId: MAINNET_CHAIN_ID,
        blockNumber: aave.blockNumber,
        chainStale: aave.chainStale,
        count: aaveVaults.length,
        catalog: {
          catalogSize: aave.catalogSize,
          stataCount: aave.stataCount,
          stakeCount: aave.stakeCount,
          censusBlock: ethCensusBlock,
        },
      },
      {
        protocol: "yearn",
        chainId: MAINNET_CHAIN_ID,
        blockNumber: yearn.blockNumber,
        chainStale: yearn.chainStale,
        count: yearnVaults.length,
        catalog: { catalogSize: yearn.catalogSize, censusBlock: yearn.censusBlock },
      },
      {
        protocol: "maple",
        chainId: MAINNET_CHAIN_ID,
        blockNumber: mapleBlock,
        chainStale: mapleStale,
        count: mapleVaults.length,
        catalog: { catalogSize: MAPLE_POOLS.length },
      },
    ],
  };
}
