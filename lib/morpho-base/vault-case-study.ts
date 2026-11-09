// Which MetaMorpho vaults the exposure page serves.
// ----------------------------------------------------------------------------
// The served test is CATALOG MEMBERSHIP: `/base/morpho/vaults/<vault>` and
// `/api/chain/morpho-base/vault` render any address `morphoBaseVaultByAddress`
// (lib/morpho-base/vault-catalog.ts) resolves, and 404 / 400 on any other. The
// catalog is a FLOOR — every vault the two MetaMorpho factories on Base had
// deployed at the census block — not a ceiling: a vault deployed without one
// of the two factories emits no creation event, sits in no registry, and is
// absent from it, so an address missing here may still be a vault.
//
// This started as a hand-picked roster of one vault, because the page's
// arithmetic (a withdraw-queue attribution over Blue's stored totals) had been
// checked one shape at a time and putting an unverified vault in front of
// people risked stating a wrong figure with confidence. That gate discharged
// 2026-09-05: the verifier ran green over six vault shapes (V1.0 and V1.1, a
// six-decimal and an 18-decimal asset, a twenty-leg queue, a 1-wei vault, an
// empty vault), and the per-vault `?holder=` redirect
// had, since the day it shipped, already rendered this same per-vault read for
// any of the 505 catalogued vaults — so a hand-picked roster on the per-vault
// route was serving a narrower answer than the sibling page gave to the same
// address. The served set is now the catalog on both routes.

import { morphoBaseVaultByAddress } from "@/lib/morpho-base/vault-catalog";

/** True when this address is in the baked catalogue. Synchronous, for input
 *  classification in the browser; a page or route that serves a vault asks
 *  `isMorphoBaseRosterVault` (lib/morpho-base/vault-roster.ts), which also
 *  knows the vaults the box has found since the bake. Case-insensitive. */
export function isMorphoBaseBakedVault(addr: string): boolean {
  return morphoBaseVaultByAddress(addr) !== undefined;
}
