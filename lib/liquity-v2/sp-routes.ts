// The Liquity V2 stability-pool sub-page's routes, spelled once. The listing
// is the roster's sub-page (`/ethereum/liquity-v2/stability-pool`); a deposit
// is `/<branch>/<depositor>` beneath it, because a deposit is one per branch
// pool and address. Pure: no imports, so scripts/test/liquity-v2-sp.test.mjs
// loads it directly.

export const LIQUITY_V2_BASE_PATH = "/ethereum/liquity-v2";
export const LIQUITY_V2_SP_PATH = `${LIQUITY_V2_BASE_PATH}/stability-pool`;

export const SP_BRANCHES = ["WETH", "wstETH", "rETH"] as const;
export type SpBranch = (typeof SP_BRANCHES)[number];

/** A branch as the routes key it, from any case ("weth", "WETH"); null where
 *  it names none. */
export function normalizeSpBranch(raw: string | null | undefined): SpBranch | null {
  const lower = (raw ?? "").toLowerCase();
  return SP_BRANCHES.find((b) => b.toLowerCase() === lower) ?? null;
}

/** A depositor address, lowercased; null where it is not one. */
export function normalizeDepositor(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  return /^0x[0-9a-fA-F]{40}$/.test(s) ? s.toLowerCase() : null;
}

export function liquityV2DepositHref(branch: SpBranch, depositor: string): string {
  return `${LIQUITY_V2_SP_PATH}/${branch}/${depositor.toLowerCase()}`;
}
