// The cross-protocol vault index's read (rails-ops ui-jobs 39; decision 0028
// point 8): the union of the vault rosters that have a page, as one
// `VaultSummary[]`.
// ----------------------------------------------------------------------------
// A vault is what a protocol roster lists, and nothing else enters: Morpho's
// MetaMorpho rosters on Base and Ethereum, Aave's vault roster on Ethereum (savings GHO, the
// static aTokens, the Umbrella stake tokens), Yearn V3's roster on Ethereum,
// and Maple's two syrup pools, which keep their pools page and join here
// as rows (survey 2026-10-20 §7.6). Each roster is read by its loader at its
// block, the same read its page makes, and the index names each
// block. Holders is each roster's census where it has one; Yield is the daily
// store's (decision 0047), which serves no Maple series.
//
// CACHED FOR FIVE MINUTES, THE ROSTERS' WINDOW (ui-jobs 479). The index is the
// same read for every reader, so the whole of it goes through Next's data cache
// like each roster's loader, and each roster still names the block its figures
// were read at. A read with a part unanswered (`indexDown`) is served and not
// reused: the next request reads again, as the loaders do.
//
// SERVER-ONLY: the loaders read ALCHEMY_URL, RAILS_API_URL and the bearer token.

import { unstable_cache } from "next/cache";
import {
  loadMetaMorphoVaultDirectory,
  type MorphoBaseVaultDirectoryResponse,
} from "@/lib/sources/chain/morpho-base-vault-directory";
import {
  loadAaveEthereumVaultDirectory,
  type AaveEthereumVaultDirectoryResponse,
} from "@/lib/sources/chain/aave-ethereum-vault-directory";
import {
  loadYearnEthereumVaultDirectory,
  type YearnVaultDirectoryResponse,
} from "@/lib/sources/chain/yearn-ethereum-vault-directory";
import { resolveMaplePoolState, type MaplePoolState } from "@/lib/sources/chain/maple-pool-state";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { serverReadAt } from "@/lib/shared/server-head-read";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { MAPLE_POOLS } from "@/lib/maple/asset-catalog";
import { aaveVaultAttestation } from "@/lib/aave-vaults/vault-catalog";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";
import {
  aaveEthereumVaultSummaries,
  maplePoolSummary,
  morphoBaseVaultSummaries,
  yearnVaultSummaries,
  withAssetScale,
  type VaultSummary,
} from "@/lib/vaults/summary";
import { loadAssetScales } from "@/lib/vaults/asset-scale";
import { loadVaultYields } from "@/lib/vaults/yield-read";
import type { VaultYield } from "@/lib/vaults/yield";
import { vaultIndexKey, type VaultIndexRoster } from "@/lib/vaults/index-rosters";

export interface VaultIndexRead {
  vaults: VaultSummary[];
  /** Decision 0047's figure by `vaultIndexKey`. */
  yields: Record<string, VaultYield>;
  /** One entry per roster, in the index's order. */
  rosters: VaultIndexRoster[];
  /** A part of the read did not answer (a census, the daily store, or a
   *  roster's loader threw): the page says so above the rows (ui-jobs 461). */
  indexDown: boolean;
}

/** A roster whose loader threw: no rows, every figure unread. */
function unread<T>(what: string, stale: T): (error: unknown) => T {
  return (error) => {
    console.error(`${what} did not answer for the vault index:`, error);
    return stale;
  };
}

const staleAt = () => ({ blockNumber: 0, chainStale: true as const, readAt: new Date().toISOString(), rows: [] });

/** How long the index is reused before it is read again. */
const VAULT_INDEX_REVALIDATE_SECONDS = 300;
const CENSUS_TIMEOUT_MS = 5000;

/** One chain's census header: the rows' Holders. An unanswered census leaves
 *  the figure out. Read from rails-server direct, as the positions proxy reads
 *  it, because a cached read names no reader to sign for. `families` scopes
 *  the read: chain 1 holds Aave's three families, its default, and MetaMorpho's
 *  `morpho`. */
async function loadCensus(chainId: number, families?: string): Promise<VaultCensusRow[] | null> {
  const base = process.env.RAILS_API_URL;
  if (!base) return null;
  try {
    const res = await fetch(
      `${base}/api/vaults/positions?chain=${chainId}&limit=1${families ? `&families=${families}` : ""}`,
      createAuthFetchOptions({ signal: AbortSignal.timeout(CENSUS_TIMEOUT_MS) }),
    );
    if (!res.ok) throw new Error(`rails-server answered ${res.status}`);
    return ((await res.json()) as { census?: VaultCensusRow[] }).census ?? [];
  } catch (error) {
    console.error(
      `The vault census did not answer for the vault index (chain ${chainId}${families ? `, ${families}` : ""}):`,
      error,
    );
    return null;
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

async function readVaultIndex(): Promise<VaultIndexRead> {
  const [morphoRead, morphoEthRead, aaveRead, yearnRead, maple, baseCensusRead, ethCensusRead, ethMorphoCensusRead] =
    await Promise.all([
      loadMetaMorphoVaultDirectory(BASE_CHAIN_ID).catch(
        unread<MorphoBaseVaultDirectoryResponse | null>("Morpho's vault directory (Base)", null),
      ),
      loadMetaMorphoVaultDirectory(MAINNET_CHAIN_ID).catch(
        unread<MorphoBaseVaultDirectoryResponse | null>("Morpho's vault directory (Ethereum)", null),
      ),
      loadAaveEthereumVaultDirectory().catch(
        unread<AaveEthereumVaultDirectoryResponse | null>("Aave's vault directory", null),
      ),
      loadYearnEthereumVaultDirectory().catch(
        unread<YearnVaultDirectoryResponse | null>("Yearn's vault directory", null),
      ),
      loadMaplePools().catch((error) => {
        console.error("Maple's pools did not answer for the vault index:", error);
        return { states: [] as MaplePoolState[], readAt: new Date().toISOString() };
      }),
      loadCensus(BASE_CHAIN_ID),
      loadCensus(MAINNET_CHAIN_ID),
      loadCensus(MAINNET_CHAIN_ID, "morpho"),
    ]);

  const baseCensus = baseCensusRead ?? [];
  const ethCensus = ethCensusRead ?? [];
  const ethMorphoCensus = ethMorphoCensusRead ?? [];
  const morpho: MorphoBaseVaultDirectoryResponse = morphoRead ?? {
    ...staleAt(),
    chainId: BASE_CHAIN_ID,
    censusBlock: 0,
    catalogSize: 0,
  };
  const morphoEth: MorphoBaseVaultDirectoryResponse = morphoEthRead ?? {
    ...staleAt(),
    chainId: MAINNET_CHAIN_ID,
    censusBlock: 0,
    catalogSize: 0,
  };
  const aave: AaveEthereumVaultDirectoryResponse = aaveRead ?? {
    ...staleAt(),
    catalogSize: 0,
    stataCount: 0,
    stakeCount: 0,
  };
  const yearn: YearnVaultDirectoryResponse = yearnRead ?? {
    ...staleAt(),
    censusBlock: 0,
    censusBlockIso: "",
    catalogSize: 0,
  };
  const morphoVaults = morphoBaseVaultSummaries(morpho, baseCensus);
  const morphoEthVaults = morphoBaseVaultSummaries(morphoEth, ethMorphoCensus);
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

  // The "decimals disagree" standing: one read per chain over the assets.
  const [baseScales, ethScales] = await Promise.all([
    loadAssetScales(
      BASE_CHAIN_ID,
      morphoVaults.map((v) => v.asset.address),
    ),
    loadAssetScales(
      MAINNET_CHAIN_ID,
      [...morphoEthVaults, ...aaveVaults, ...yearnVaults, ...mapleVaults].map((v) => v.asset.address),
    ),
  ]);
  const scaled = (vs: VaultSummary[], scales: typeof baseScales) => vs.map((v) => withAssetScale(v, scales));

  const [baseYieldsRead, ethYieldsRead] = await Promise.all([
    loadVaultYields(
      BASE_CHAIN_ID,
      morphoVaults.map((v) => v.address),
    ).catch(unread<Record<string, VaultYield> | null>("The daily store (Base)", null)),
    loadVaultYields(
      MAINNET_CHAIN_ID,
      [...morphoEthVaults, ...aaveVaults, ...yearnVaults].map((v) => v.address),
    ).catch(unread<Record<string, VaultYield> | null>("The daily store (Ethereum)", null)),
  ]);
  const baseYields = baseYieldsRead ?? {};
  const ethYields = ethYieldsRead ?? {};
  const yields: Record<string, VaultYield> = {};
  for (const v of morphoVaults) if (baseYields[v.address]) yields[vaultIndexKey(v)] = baseYields[v.address];
  for (const v of [...morphoEthVaults, ...aaveVaults, ...yearnVaults])
    if (ethYields[v.address]) yields[vaultIndexKey(v)] = ethYields[v.address];
  // The store keeps no Maple series (decision 0047, "Out of scope"), so it is
  // not asked; the rows say so.
  for (const v of mapleVaults) yields[vaultIndexKey(v)] = { none: "no-series" };

  const ethCensusBlock = ethCensus.length > 0 ? Math.max(...ethCensus.map((c) => c.censusBlock)) : null;
  return {
    vaults: [
      ...scaled(morphoVaults, baseScales),
      ...scaled([...morphoEthVaults, ...aaveVaults, ...yearnVaults, ...mapleVaults], ethScales),
    ],
    yields,
    indexDown: [
      morphoRead,
      morphoEthRead,
      aaveRead,
      yearnRead,
      baseCensusRead,
      ethCensusRead,
      ethMorphoCensusRead,
      baseYieldsRead,
      ethYieldsRead,
    ].some((r) => r == null),
    rosters: [
      {
        protocol: "morpho",
        chainId: BASE_CHAIN_ID,
        blockNumber: morpho.blockNumber,
        readBy: serverReadAt(morpho.head, morpho.blockNumber || null),
        chainStale: morpho.chainStale,
        readAt: morpho.readAt,
        count: morphoVaults.length,
        catalog: { catalogSize: morpho.catalogSize, censusBlock: morpho.censusBlock },
      },
      {
        protocol: "morpho",
        chainId: MAINNET_CHAIN_ID,
        blockNumber: morphoEth.blockNumber,
        readBy: serverReadAt(morphoEth.head, morphoEth.blockNumber || null),
        chainStale: morphoEth.chainStale,
        readAt: morphoEth.readAt,
        count: morphoEthVaults.length,
        catalog: { catalogSize: morphoEth.catalogSize, censusBlock: morphoEth.censusBlock },
      },
      {
        protocol: "aave",
        chainId: MAINNET_CHAIN_ID,
        blockNumber: aave.blockNumber,
        readBy: serverReadAt(aave.head, aave.blockNumber || null),
        chainStale: aave.chainStale,
        readAt: aave.readAt,
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
        readBy: serverReadAt(yearn.head, yearn.blockNumber || null),
        chainStale: yearn.chainStale,
        readAt: yearn.readAt,
        count: yearnVaults.length,
        catalog: { catalogSize: yearn.catalogSize, censusBlock: yearn.censusBlock },
      },
      {
        protocol: "maple",
        chainId: MAINNET_CHAIN_ID,
        blockNumber: mapleBlock,
        readBy: serverReadAt(maple.states[0]?.head, mapleBlock || null),
        chainStale: mapleStale,
        readAt: maple.readAt,
        count: mapleVaults.length,
        catalog: { catalogSize: MAPLE_POOLS.length },
      },
    ],
  };
}

const cachedVaultIndex = unstable_cache(readVaultIndex, ["vault-index"], {
  revalidate: VAULT_INDEX_REVALIDATE_SECONDS,
});

/** The index, cached for five minutes; a read with a part unanswered is read
 *  again on the next request. */
export async function loadVaultIndex(): Promise<VaultIndexRead> {
  const cached = await cachedVaultIndex();
  if (!cached.indexDown) return cached;
  return readVaultIndex();
}
