// The MetaMorpho roster on one chain as the pages serve it: the box's, over the baked one.
// ----------------------------------------------------------------------------
// Each chain's baked catalogue (lib/morpho-base/vault-catalog.ts,
// lib/morpho-ethereum/vault-catalog.ts; scripts/census-morpho-base-vaults.mjs) is a
// snapshot at one census block. The box's census tick for the chain discovers the
// same roster every morning and writes it to vault_roster (rails-server-onboarding
// mig 283) before it sweeps a vault, so every vault the position listing's census
// knows has a row there. This module takes that served roster when it passes the
// checks below, and the baked catalogue when it does not or cannot be read
// (lib/vaults/served-roster.ts).
//
// THE SERVED ROSTER IS TAKEN ONLY WHEN IT CONTAINS THE BAKED ONE. Its block is
// at or after the baked census block, every baked vault is in it, and each one
// agrees on everything that cannot change (factory, creation block, asset).
// A factory's creation log cannot lose an entry, so a served roster that fails
// any of these is a broken read, and the page says what the baked one says.
// name and symbol are snapshots on either side; the served ones are newer.
//
// SERVER-ONLY.

import { cache } from "react";
import { fetchServedRoster } from "@/lib/vaults/served-roster";
import {
  MORPHO_BASE_METAMORPHO_FACTORIES,
  MORPHO_BASE_VAULTS,
  MORPHO_BASE_VAULT_CENSUS_BLOCK,
} from "@/lib/morpho-base/vault-catalog";
import {
  MORPHO_ETHEREUM_METAMORPHO_FACTORIES,
  MORPHO_ETHEREUM_VAULTS,
  MORPHO_ETHEREUM_VAULT_CENSUS_BLOCK,
} from "@/lib/morpho-ethereum/vault-catalog";

/** The chains a MetaMorpho roster is served for. */
export type MetaMorphoChainId = 1 | 8453;

/** Which MetaMorpho implementation a vault is (V1.0 has no `lostAssets()` ledger). */
export type MetaMorphoVaultFactory = "v1.0" | "v1.1";

/** One catalogued vault; each chain's generated catalogue has this shape. */
export interface MetaMorphoVaultCatalogEntry {
  /** Lowercased vault address. */
  address: string;
  factory: MetaMorphoVaultFactory;
  /** The block its CreateMetaMorpho log was emitted at. */
  createdBlock: number;
  /** The share token's name and symbol at the roster's block: snapshots. */
  name: string;
  symbol: string;
  /** The ERC-4626 underlying, lowercased. */
  asset: string;
}

export interface MetaMorphoVaultRoster {
  chainId: MetaMorphoChainId;
  /** Every vault, in creation order. A floor: see the catalogue's header. */
  vaults: readonly MetaMorphoVaultCatalogEntry[];
  /** The block the roster was read at: the box's run, or the baked census. */
  censusBlock: number;
  /** Which roster this is. */
  source: "served" | "baked";
  byAddress: ReadonlyMap<string, MetaMorphoVaultCatalogEntry>;
}

const baked = (
  chainId: MetaMorphoChainId,
  vaults: readonly MetaMorphoVaultCatalogEntry[],
  censusBlock: number,
): MetaMorphoVaultRoster => ({
  chainId,
  vaults,
  censusBlock,
  source: "baked",
  byAddress: new Map(vaults.map((v) => [v.address, v])),
});

const BAKED: Record<MetaMorphoChainId, MetaMorphoVaultRoster> = {
  8453: baked(8453, MORPHO_BASE_VAULTS, MORPHO_BASE_VAULT_CENSUS_BLOCK),
  1: baked(1, MORPHO_ETHEREUM_VAULTS, MORPHO_ETHEREUM_VAULT_CENSUS_BLOCK),
};

const CHAIN_NAME: Record<MetaMorphoChainId, string> = { 8453: "Base", 1: "Ethereum" };

/** The roster the pages serve on `chainId`, read once per request. */
export const loadMetaMorphoVaultRoster = cache(async (chainId: MetaMorphoChainId): Promise<MetaMorphoVaultRoster> => {
  const fallback = BAKED[chainId];
  const served = await fetchServedRoster(chainId, "metamorpho");
  if (!served) return fallback;
  const reject = (why: string) => {
    console.error(
      `served Morpho ${CHAIN_NAME[chainId]} roster at block ${served.rosterBlock} not taken: ${why}; serving the baked one`,
    );
    return fallback;
  };
  if (served.rosterBlock < fallback.censusBlock)
    return reject(`it is older than the baked census block ${fallback.censusBlock}`);
  const vaults: MetaMorphoVaultCatalogEntry[] = [];
  for (const v of served.vaults) {
    if (v.factoryVersion !== "v1.0" && v.factoryVersion !== "v1.1")
      return reject(`${v.address} names factory ${v.factoryVersion}`);
    vaults.push({
      address: v.address,
      factory: v.factoryVersion,
      createdBlock: v.createdBlock,
      name: v.name ?? "",
      symbol: v.symbol ?? "",
      asset: v.asset,
    });
  }
  const byAddress = new Map(vaults.map((v) => [v.address, v]));
  for (const b of fallback.vaults) {
    const s = byAddress.get(b.address);
    if (!s) return reject(`it lacks ${b.address}`);
    if (s.factory !== b.factory || s.createdBlock !== b.createdBlock || s.asset !== b.asset)
      return reject(`${b.address} disagrees on factory, creation block or asset`);
  }
  return { chainId, vaults, censusBlock: served.rosterBlock, source: "served", byAddress };
});

/** The vault at `addr` in the roster the pages serve on `chainId`, or undefined. */
export async function metaMorphoRosterEntry(
  chainId: MetaMorphoChainId,
  addr: string,
): Promise<MetaMorphoVaultCatalogEntry | undefined> {
  return (await loadMetaMorphoVaultRoster(chainId)).byAddress.get(addr.toLowerCase());
}

/** The address of the factory that made a vault of this release on `chainId`. */
export function metaMorphoFactoryAddress(chainId: MetaMorphoChainId, release: MetaMorphoVaultFactory): string | null {
  const table = chainId === 8453 ? MORPHO_BASE_METAMORPHO_FACTORIES : MORPHO_ETHEREUM_METAMORPHO_FACTORIES;
  return table.find((f) => f.version === release)?.address ?? null;
}
