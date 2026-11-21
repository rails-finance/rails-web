// The Liquity V1 staking sub-page's routes, spelled once. The listing is the
// roster's sub-page (`/ethereum/liquity-v1/staking`); a stake is `/<staker>`
// beneath it, one stake per address. Pure: no imports, so
// scripts/test/liquity-v1-staking.test.mjs loads it directly.

export const LIQUITY_V1_STAKING_PATH = "/ethereum/liquity-v1/staking";

/** A staker address, lowercased; null where it is not one. */
export function normalizeStaker(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  return /^0x[0-9a-fA-F]{40}$/.test(s) ? s.toLowerCase() : null;
}

export function liquityV1StakeHref(staker: string): string {
  return `${LIQUITY_V1_STAKING_PATH}/${staker.toLowerCase()}`;
}
