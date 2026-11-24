// The Liquity V1 stability-pool sub-page's routes, spelled once. The listing
// is the roster's sub-page (`/ethereum/liquity-v1/stability-pool`); a deposit
// is `/<depositor>` beneath it, one pool and one deposit per address. Pure: no
// imports, so scripts/test/liquity-v1-sp.test.mjs loads it directly.

export const LIQUITY_V1_BASE_PATH = "/ethereum/liquity-v1";
export const LIQUITY_V1_SP_PATH = `${LIQUITY_V1_BASE_PATH}/stability-pool`;

/** A depositor address, lowercased; null where it is not one. */
export function normalizeDepositor(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  return /^0x[0-9a-fA-F]{40}$/.test(s) ? s.toLowerCase() : null;
}

export function liquityV1DepositHref(depositor: string): string {
  return `${LIQUITY_V1_SP_PATH}/${depositor.toLowerCase()}`;
}
