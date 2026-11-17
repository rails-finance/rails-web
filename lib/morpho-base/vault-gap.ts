// "Unaccrued interest" on a MetaMorpho vault page (ui-jobs 688, owner's ruling:
// subtract). The one place the figure is computed; every surface that shows it
// reads the loader's `gap`, which comes from here.
//
// The figure is total assets less the stored Morpho Blue legs, less the lost
// assets a V1.1 vault has stored. V1.1's `totalAssets()` re-derives its lost
// assets on every call and keeps them in the total (rails-ops
// architecture/morpho-base-vault-exposure.md, the `lostAssets` entry);
// `lostAssets()` returns the value written at the vault's last interaction, which
// can only be lower. So a loss since that interaction stays in the figure until
// the next one. A few raw units either way come from the legs being converted at
// Blue's stored totals without its virtual shares; the figure is signed and is
// printed as it falls, as it was before.

/** What the figure did with lost assets:
 *  - `subtracted`: V1.1, the stored lost assets were above zero and are taken off;
 *  - `zero`: V1.1, it has stored none;
 *  - `unread`: V1.1 by the roster, but `lostAssets()` did not answer at the block,
 *    so nothing was taken off;
 *  - `no-ledger`: V1.0, or a vault the roster does not know: no such ledger to read. */
export type VaultGapLost = "subtracted" | "zero" | "unread" | "no-ledger";

/** All amounts raw, in the asset's units. `lostAssets` null where the call
 *  failed (a V1.0 vault reverts on it); `release` from the roster, null where the
 *  roster does not hold the vault. */
export function vaultGap(
  totalAssets: bigint,
  allocated: bigint,
  lostAssets: bigint | null,
  release: "v1.0" | "v1.1" | null,
): { raw: bigint; lost: VaultGapLost } {
  const gap = totalAssets - allocated;
  if (lostAssets == null) return { raw: gap, lost: release === "v1.1" ? "unread" : "no-ledger" };
  if (lostAssets === BigInt(0)) return { raw: gap, lost: "zero" };
  return { raw: gap - lostAssets, lost: "subtracted" };
}
