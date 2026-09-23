// ============================================================================
// FETCH AAVE V4 SPOKE-POSITION (chain state)
// ============================================================================
//
// Per-(wallet, spoke) state read directly from the spoke contract. Returns
// the same numbers Aave's own UI would render: HF + per-reserve supply/debt
// balances in raw token wei. The detail page uses this as the source of
// truth for "what does this position look like right now", instead of the
// event-derived running balances which drift due to indexer gaps.
//
// Wire shape mirrors rails-server-onboarding/api/src/routes/aaveV4.ts —
// `SpokePositionChainResponse`. Balances are TEXT to preserve numeric(78,0)
// precision; scale by `decimals` at render time.

export interface AaveV4SpokeChainReserve {
  reserveId: number;
  address: string; // underlying token, lowercase
  symbol: string;
  decimals: number;
  /** Token wei (raw integer string). Scale by 10^decimals for display. */
  supplyBalanceRaw: string;
  /** Token wei (raw integer string). */
  debtBalanceRaw: string;
  isCollateral: boolean;
  hasBorrow: boolean;
  /** Liquidation threshold (0..1) from the indexed reserves table — close
   *  but not chain-fetched yet; switch to on-chain `getReserveConfig` if/when
   *  governance LT updates drift past acceptable tolerance. */
  lt: number | null;
}

export interface AaveV4SpokePositionChainResponse {
  wallet: string;
  spoke: string; // key, e.g. "main"
  spokeName: string; // display, e.g. "Main"
  blockNumber: number;
  /** 1.0-scaled HF. Null when no debt. */
  healthFactor: number | null;
  /** 1.0-scaled position-wide collateral factor (matches Aave's CF%). */
  avgCollateralFactor: number;
  /** Raw uint256 per-position risk premium (slot 0 of getUserAccountData) as a
   *  decimal string; null when the server hasn't captured it. V4 prices risk
   *  per position, but the DAO has it ZEROED protocol-wide for now (to be turned
   *  on gradually) — so this is "0" today. Decode with parseRiskPremiumFraction. */
  riskPremiumRaw: string | null;
  supplyAssetCount: number;
  debtAssetCount: number;
  /** True when the chain RPC overlay failed and we returned an empty stub. */
  chainStale: boolean;
  /** Reserves with non-zero supply or debt (or active collateral/borrow
   *  flag). Sorted by reserve id ascending. */
  reserves: AaveV4SpokeChainReserve[];
}

export interface FetchAaveV4SpokePositionParams {
  wallet: string;
  spoke: string; // key (lowercase), e.g. "main"
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export async function fetchAaveV4SpokePosition(
  p: FetchAaveV4SpokePositionParams,
): Promise<AaveV4SpokePositionChainResponse> {
  const qs = new URLSearchParams({ wallet: p.wallet, spoke: p.spoke });
  const url = `${p.baseUrl ?? ""}/api/aave-v4/spoke-position?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store", headers: p.headers });
  if (!res.ok) {
    throw new Error(`fetchAaveV4SpokePosition failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as AaveV4SpokePositionChainResponse;
}

/** Decode the raw risk-premium integer into a fraction (0.3 = 30%), or null
 *  when absent/zero.
 *
 *  riskPremium is expressed in BPS (basis points) — CONTRACT-CONFIRMED against
 *  aave-v4: `ISpoke.UserAccountData.riskPremium` is documented "expressed in
 *  BPS" (src/spoke/interfaces/ISpoke.sol), and the position-level field is an
 *  on-chain `uint24` BPS value. So 10000 bps = 100%, and a 30% premium arrives
 *  as raw "3000". NOTE this is NOT wad, even though its struct-siblings
 *  avgCollateralFactor / healthFactor are wad (1e18) — only this field is BPS.
 *
 *  Premiums are 0 protocol-wide today (the DAO turns them on gradually), so this
 *  returns null and callers render nothing until one activates.
 *
 *  Returns null for null/""/"0" so callers can `if (frac) …` to render only
 *  when a premium is actually in effect. */
export function parseRiskPremiumFraction(raw: string | null): number | null {
  if (!raw || raw === "0") return null;
  let big: bigint;
  try {
    big = BigInt(raw);
  } catch {
    return null;
  }
  if (big === BigInt(0)) return null;
  // BPS → fraction: 1 bp = 0.01%, so divide by 10_000 (not 1e18). The value is
  // a small on-chain uint24, so a direct Number cast is exact.
  return Number(big) / 10000;
}

/** Scale a raw balance string by token decimals into a display Number.
 *  Uses BigInt arithmetic so balances > 2^53 don't lose precision before
 *  the final Number cast. Works under ES2017 (no `10n ** n` literal). */
export function scaleChainBalance(raw: string, decimals: number): number {
  if (!raw || raw === "0") return 0;
  const zero = BigInt(0);
  let big: bigint;
  try {
    big = BigInt(raw);
  } catch {
    return 0;
  }
  if (big === zero) return 0;
  if (decimals <= 0) return Number(big);
  const divisor = BigInt("1" + "0".repeat(decimals));
  const whole = big / divisor;
  const frac = big % divisor;
  return Number(whole) + Number(frac) / Number(divisor);
}
