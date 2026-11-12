// A vault's part of one Morpho Blue liquidation's bad debt (rails-ops ui-jobs
// 554, piece C). Blue writes bad debt off the market's supply, so every
// supplier loses in proportion to its supply shares:
//
//   vault's part = floor(badDebtAssets × vaultSupplyShares ÷ totalSupplyShares)
//
// with both share counts read at the block before the liquidation, and "of the
// vault" is that part over the vault's totalAssets() at the same block, in
// parts per million. BigInt throughout; a share of zero means the vault was not
// exposed, and zero total assets give no figure. Pure: no `@/`
// import, so scripts/test/vault-bad-debt-share.test.mjs loads it directly.

const ZERO = BigInt(0);

/** The vault's part of `badDebtAssets`, in the loan token's raw units, floored.
 *  Null where the vault held no supply shares, or the market had none. */
export function vaultBadDebtPart(badDebtAssets: bigint, vaultShares: bigint, totalShares: bigint): bigint | null {
  if (vaultShares <= ZERO || totalShares <= ZERO) return null;
  // A vault cannot hold more than the market's shares; a read that says so is
  // clamped to the whole, so the part never exceeds the market's bad debt.
  const held = vaultShares > totalShares ? totalShares : vaultShares;
  return (badDebtAssets * held) / totalShares;
}

/** The vault's share of the market's supply as a percentage, to `places`
 *  decimals, floored. Null where either count is zero. */
export function supplySharePercent(vaultShares: bigint, totalShares: bigint, places = 2): number | null {
  if (vaultShares <= ZERO || totalShares <= ZERO) return null;
  const held = vaultShares > totalShares ? totalShares : vaultShares;
  const scale = BigInt(10) ** BigInt(places);
  const scaled = (held * BigInt(100) * scale) / totalShares;
  return Number(scaled) / Number(scale);
}

/** One basis point, 0.01%, in parts per million. */
export const ONE_BP_PPM = 100;

/** The vault's part over its total assets at the same block, in parts per
 *  million, floored. Null where the total assets did not read or read zero. */
export function ofVaultPpm(part: bigint, vaultAssets: bigint | null): number | null {
  if (vaultAssets == null || vaultAssets <= ZERO) return null;
  return Number((part * BigInt(1_000_000)) / vaultAssets);
}
