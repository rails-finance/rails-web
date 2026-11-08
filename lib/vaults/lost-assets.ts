// A MetaMorpho V1.1 vault whose total includes lost assets (rails-ops ui-jobs
// 543, Miles's ruling of 8 Nov 2026): the test, the held figure and the words,
// shared by the index, the rosters and the vault page.
// ----------------------------------------------------------------------------
// V1.1's `totalAssets()` is the markets' expected supply plus `lostAssets()`,
// and the share price is not lowered for the loss. A vault carries the
// "lost assets" standing when `lostAssets()` is 1% or more of `totalAssets()`
// at the read block, unless the vault is too small to measure (the dust floor,
// lib/vaults/yield.ts `tooSmallToMeasure`). Held is `totalAssets − lostAssets`.
// A V1.0 vault reverts on `lostAssets()`: absent, never zero.
//
// Pure, with type imports only: scripts/test/vault-lost-assets.test.mjs reads it.

/** The share of `totalAssets()` from which a vault carries the standing: 1%. */
export const LOST_ASSETS_MIN_PERCENT = 1;

const ZERO = BigInt(0);

/**
 * Does the vault carry the "lost assets" standing? `tooSmall` is the dust
 * floor's verdict on `totalAssetsRaw`, which wins.
 */
export function hasLostAssets(
  totalAssetsRaw: string | null | undefined,
  lostAssetsRaw: string | null | undefined,
  tooSmall: (totalAssetsRaw: string) => boolean,
): boolean {
  if (totalAssetsRaw == null || lostAssetsRaw == null) return false;
  const total = BigInt(totalAssetsRaw);
  const lost = BigInt(lostAssetsRaw);
  if (lost === ZERO || total === ZERO || tooSmall(totalAssetsRaw)) return false;
  return lost * BigInt(100) >= total * BigInt(LOST_ASSETS_MIN_PERCENT);
}

/** What the vault holds: `totalAssets − lostAssets`, or `totalAssets` where
 *  `lostAssets` is absent. */
export function heldAssetsRaw(totalAssetsRaw: string, lostAssetsRaw: string | null | undefined): bigint {
  const total = BigInt(totalAssetsRaw);
  return lostAssetsRaw == null ? total : total - BigInt(lostAssetsRaw);
}

/** The caution, with the figures printed by the caller's formatter. */
export function lostAssetsSentence(t: { lost: string; held: string; symbol: string; block: number }): string {
  return `Includes ${t.lost} ${t.symbol} lost at block ${t.block.toLocaleString("en-US")}. The vault holds ${t.held} ${t.symbol}; the share price has not been lowered for the loss, so the holders who withdraw last carry it.`;
}
