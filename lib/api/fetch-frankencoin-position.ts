// ============================================================================
// FETCH FRANKENCOIN POSITION (chain state)
// ============================================================================
//
// Per-POSITION state read directly from the Position contract at the live
// head — the primary truth on the detail page. A Frankencoin position IS its
// own contract (a minimal-proxy clone), so one fetch reads one contract's own
// getters and nothing is aggregated:
//
//   • minted() — the ZCHF debt (native unit; Frankencoin runs no oracle and
//     the page renders no USD, ever).
//   • the collateral token's balanceOf(position) — the posted collateral.
//   • price() — the OWNER-DECLARED liquidation price, stored at
//     1e(36 − collateralDecimals). NOT an oracle; challenges test it.
//   • annualInterestPPM() (+ riskPremiumPPM() on V2 — its success is also the
//     version probe), reserveContribution() — the fee frame. Interest is
//     charged UP FRONT at minting time; nothing accrues on this page.
//   • start() / expiration() / cooldown() — the lifecycle clocks. cooldown at
//     or past expiration is the deny/close marker, not a clock.
//   • challengedAmount() / challengePeriod() — the live challenge state.
//   • isClosed() / original() / owner() — lifecycle + identity flags.
//
// There is NO health factor lane — risk here is challenge status, the
// owner-declared price, the expiry countdown and the cooldown, and the
// explorer does not synthesize anything beyond them.

export interface FrankencoinChainResponse {
  /** Lowercased Position contract address — the grain. */
  position: string;
  /** Version by probe: riskPremiumPPM() succeeding marks a V2 position. */
  hub: "v1" | "v2";
  blockNumber: number;

  /** owner() at head — ownership is transferable; the timeline replays
   *  event-time owners, this is the current one. */
  owner: string | null;
  original: string | null;
  isClone: boolean;

  collateralToken: string | null;
  collateralSymbol: string | null;
  collateralDecimals: number | null;
  /** balanceOf(position) — raw integer string + scaled. */
  collateralRaw: string | null;
  collateral: number | null;

  /** minted() — raw integer string + scaled ZCHF. */
  mintedRaw: string | null;
  minted: number | null;

  /** price() raw (1e(36 − decimals)) and the scaled ZCHF-per-token figure. */
  priceRaw: string | null;
  liqPrice: number | null;

  annualInterestPPM: number | null;
  /** V2 only — null on V1. */
  riskPremiumPPM: number | null;
  reserveContributionPPM: number | null;
  /** minted × reserveContribution ÷ 1e6 — ZCHF held back, returns on repay. */
  reserveHeld: number | null;
  /** collateral × liqPrice — the ceiling the owner's declared price implies. */
  mintCeiling: number | null;

  /** Unix seconds. */
  start: number | null;
  expiration: number | null;
  /** cooldown() raw — may be a marker (deny sets it to expiration; V1 close
   *  sets uint256-max), so it ships raw plus the derived flags below. */
  cooldownRaw: string | null;
  /** A real clock in the future — minting paused until `cooldownUntil`. */
  cooldownActive: boolean;
  cooldownUntil: number | null;
  /** cooldown ≥ expiration — the on-chain deny/close marker (the DENIED
   *  status itself comes from the indexed PositionDenied event). */
  mintingDisabledForGood: boolean;

  challengedAmountRaw: string | null;
  challengedAmount: number | null;
  /** Seconds per challenge phase. */
  challengePeriod: number | null;

  minimumCollateralRaw: string | null;
  isClosed: boolean;
  /** expiration passed and the position is not closed. */
  expired: boolean;

  /** True when the chain RPC read failed and we returned an empty stub. */
  chainStale: boolean;
}

export interface FetchFrankencoinPositionParams {
  /** Position contract address. */
  position: string;
  baseUrl?: string;
}

export async function fetchFrankencoinChainPosition(
  p: FetchFrankencoinPositionParams,
): Promise<FrankencoinChainResponse> {
  const qs = new URLSearchParams({ position: p.position });
  const url = `${p.baseUrl ?? ""}/api/chain/frankencoin/position?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchFrankencoinChainPosition failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as FrankencoinChainResponse;
}
