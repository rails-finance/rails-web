// One address, asked once: is it a catalogued MetaMorpho vault?
// ----------------------------------------------------------------------------
// Every Morpho Base surface that prints an address — the wallet page, the
// per-position page, the position listing — asks the same question of the
// same catalog (lib/morpho-base/vault-catalog.ts, 505 rows, a FLOOR not a
// ceiling: an address this misses may still be a vault). This is the one
// place that turns a catalog hit into the two facts a page ever states about
// it: the name AT THE CENSUS BLOCK (a label, not a current-state claim —
// MetaMorpho V1.1 vaults can rename) and the href to the vault's own
// exposure page, which every catalogued vault has.
//
// Called from server components (the wallet and position pages resolve it
// once per request and pass the result down) so the 505-row catalog is read
// on the server and only this small object crosses into the client bundle.
// The Base LISTING is the one client-side exception — its rows are paged
// through a client fetch, so it imports the catalog directly (see
// morpho-base-listing.tsx) rather than through this helper.

import { morphoBaseVaultByAddress } from "@/lib/morpho-base/vault-catalog";
import { baseVaultHref } from "@/lib/vaults/routes";

export interface MorphoBaseVaultOwnerNote {
  name: string;
  href: string;
}

/** `address`'s catalog entry, reduced to the name + href a page needs — or
 *  null when the census does not hold it (an ordinary account, or a vault
 *  deployed without either MetaMorpho factory). Case-insensitive. */
export function morphoBaseVaultOwnerNote(address: string): MorphoBaseVaultOwnerNote | null {
  const catalogued = morphoBaseVaultByAddress(address);
  return catalogued ? { name: catalogued.name, href: baseVaultHref(address) } : null;
}
