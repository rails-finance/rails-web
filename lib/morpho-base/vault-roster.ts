// The MetaMorpho roster on Base as the pages serve it: the box's, over the baked one.
// ----------------------------------------------------------------------------
// lib/morpho-base/vault-catalog.ts is a snapshot at one census block. The box's
// Base census tick discovers the same roster every morning and writes it to
// vault_roster (rails-server-onboarding mig 283) before it sweeps a vault, so
// every vault the position listing's census knows has a row there. This module
// takes that served roster when it passes the checks below, and the baked
// catalogue when it does not or cannot be read (lib/vaults/served-roster.ts).
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
import { MORPHO_BASE_VAULTS, MORPHO_BASE_VAULT_CENSUS_BLOCK, type MorphoBaseVaultCatalogEntry } from "./vault-catalog";

export interface MorphoBaseVaultRoster {
  /** Every vault, in creation order. A floor: see vault-catalog.ts's header. */
  vaults: readonly MorphoBaseVaultCatalogEntry[];
  /** The block the roster was read at: the box's run, or the baked census. */
  censusBlock: number;
  /** Which roster this is. */
  source: "served" | "baked";
  byAddress: ReadonlyMap<string, MorphoBaseVaultCatalogEntry>;
}

const BAKED: MorphoBaseVaultRoster = {
  vaults: MORPHO_BASE_VAULTS,
  censusBlock: MORPHO_BASE_VAULT_CENSUS_BLOCK,
  source: "baked",
  byAddress: new Map(MORPHO_BASE_VAULTS.map((v) => [v.address, v])),
};

/** The roster the pages serve, read once per request. */
export const loadMorphoBaseVaultRoster = cache(async (): Promise<MorphoBaseVaultRoster> => {
  const served = await fetchServedRoster(8453, "metamorpho");
  if (!served) return BAKED;
  const reject = (why: string) => {
    console.error(`served Morpho Base roster at block ${served.rosterBlock} not taken: ${why}; serving the baked one`);
    return BAKED;
  };
  if (served.rosterBlock < MORPHO_BASE_VAULT_CENSUS_BLOCK)
    return reject(`it is older than the baked census block ${MORPHO_BASE_VAULT_CENSUS_BLOCK}`);
  const vaults: MorphoBaseVaultCatalogEntry[] = [];
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
  for (const b of MORPHO_BASE_VAULTS) {
    const s = byAddress.get(b.address);
    if (!s) return reject(`it lacks ${b.address}`);
    if (s.factory !== b.factory || s.createdBlock !== b.createdBlock || s.asset !== b.asset)
      return reject(`${b.address} disagrees on factory, creation block or asset`);
  }
  return { vaults, censusBlock: served.rosterBlock, source: "served", byAddress };
});

/** The vault at `addr` in the roster the pages serve, or undefined. */
export async function morphoBaseRosterEntry(addr: string): Promise<MorphoBaseVaultCatalogEntry | undefined> {
  return (await loadMorphoBaseVaultRoster()).byAddress.get(addr.toLowerCase());
}

/** True when this address is one the vault pages and routes serve: a member of
 *  the roster. Case-insensitive. */
export async function isMorphoBaseRosterVault(addr: string): Promise<boolean> {
  return (await morphoBaseRosterEntry(addr)) !== undefined;
}
