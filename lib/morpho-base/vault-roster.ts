// The MetaMorpho roster on Base as the pages serve it: the box's, over the baked one.
// The rule is chain-wide and lives in lib/metamorpho/vault-roster.ts; these are
// Base's names for it.
//
// SERVER-ONLY.

import {
  loadMetaMorphoVaultRoster,
  metaMorphoRosterEntry,
  type MetaMorphoVaultRoster,
} from "@/lib/metamorpho/vault-roster";
import type { MorphoBaseVaultCatalogEntry } from "./vault-catalog";

export type MorphoBaseVaultRoster = MetaMorphoVaultRoster;

/** The Base roster the pages serve, read once per request. */
export const loadMorphoBaseVaultRoster = (): Promise<MorphoBaseVaultRoster> => loadMetaMorphoVaultRoster(8453);

/** The vault at `addr` in the roster the pages serve, or undefined. */
export async function morphoBaseRosterEntry(addr: string): Promise<MorphoBaseVaultCatalogEntry | undefined> {
  return metaMorphoRosterEntry(8453, addr);
}

/** True when this address is one the vault pages and routes serve: a member of
 *  the roster. Case-insensitive. */
export async function isMorphoBaseRosterVault(addr: string): Promise<boolean> {
  return (await morphoBaseRosterEntry(addr)) !== undefined;
}
