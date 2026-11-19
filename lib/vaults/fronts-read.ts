// Whether Rails reads each front's vault (rails-ops ui-jobs 774): a row with an
// address and a chain is looked up in the vault index (lib/vaults/index-read.ts),
// the union of every vault roster Rails serves. Found, the row links to the
// vault's page under its protocol; not found, it says Rails does not read the
// vault yet. Nothing here is hand-set.
//
// SERVER-ONLY: the vault index's loaders read the chain and the bearer token.

import { loadVaultIndex } from "@/lib/vaults/index-read";
import { vaultIndexHref } from "@/lib/vaults/index-rosters";
import { VAULT_FRONTS, frontVaultKey, type VaultFront } from "@/lib/vaults/fronts";

/** Rails's reading of one row's vault. `unknown`: the index did not answer
 *  in full and the vault was not among what did. */
export type FrontRead =
  | { kind: "read"; href: string }
  | { kind: "not-read" }
  | { kind: "unknown" }
  | { kind: "no-address" };

export interface FrontRow extends VaultFront {
  read: FrontRead;
}

export async function readFronts(): Promise<FrontRow[]> {
  const { vaults, indexDown } = await loadVaultIndex();
  const served = new Map(vaults.map((v) => [frontVaultKey(v.chainId, v.address), v]));
  return VAULT_FRONTS.map((f) => {
    if (f.vault == null || f.chainId == null) return { ...f, read: { kind: "no-address" } };
    const hit = served.get(frontVaultKey(f.chainId, f.vault));
    const read: FrontRead = hit
      ? { kind: "read", href: vaultIndexHref(hit) }
      : indexDown
        ? { kind: "unknown" }
        : { kind: "not-read" };
    return { ...f, read };
  });
}
