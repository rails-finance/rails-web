// Whether Rails reads each front's vault (rails-ops ui-jobs 774), decided from
// the vault's kind and chain. Only a kind Rails reads is looked up, in that
// kind's roster: MetaMorpho on Ethereum and Base (lib/metamorpho/vault-roster.ts).
// Found, the row links to the vault's page under its protocol. Nothing here is
// hand-set, and a row of a kind Rails does not read costs no read.
//
// SERVER-ONLY: the MetaMorpho roster reads RAILS_API_URL and the bearer token.

import { metaMorphoRosterEntry, type MetaMorphoChainId } from "@/lib/metamorpho/vault-roster";
import { metaMorphoVaultHref } from "@/lib/vaults/routes";
import { VAULT_FRONTS, type FrontVaultKind, type VaultFront } from "@/lib/vaults/fronts";

/** Rails's reading of one row's vault. `family-not-read`: Rails reads no vault
 *  of this kind (on this chain); `not-read`: a kind Rails reads, absent from
 *  its roster; `unnamed`: no address and no kind, so nothing to check. */
export type FrontRead =
  | { kind: "read"; href: string }
  | { kind: "not-read" }
  | { kind: "family-not-read"; family: string }
  | { kind: "unnamed" };

export interface FrontRow extends VaultFront {
  read: FrontRead;
}

/** Each kind's name in a "Rails does not read … vaults yet" line. */
const KIND_LABEL: Record<FrontVaultKind, string> = {
  metamorpho: "MetaMorpho",
  "morpho-vault-v2": "Morpho Vault V2",
  "veda-boringvault": "Veda BoringVault",
};

const isMetaMorphoChain = (id: number | null): id is MetaMorphoChainId => id === 1 || id === 8453;

async function readOne(f: VaultFront): Promise<FrontRead> {
  if (f.vaultKind == null) return { kind: "unnamed" };
  if (f.vaultKind === "metamorpho" && isMetaMorphoChain(f.chainId)) {
    if (f.vault == null) return { kind: "not-read" };
    const hit = await metaMorphoRosterEntry(f.chainId, f.vault);
    return hit ? { kind: "read", href: metaMorphoVaultHref(f.chainId, f.vault) } : { kind: "not-read" };
  }
  return { kind: "family-not-read", family: KIND_LABEL[f.vaultKind] };
}

export async function readFronts(): Promise<FrontRow[]> {
  return Promise.all(VAULT_FRONTS.map(async (f) => ({ ...f, read: await readOne(f) })));
}
