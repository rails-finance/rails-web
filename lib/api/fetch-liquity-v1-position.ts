// ============================================================================
// FETCH LIQUITY V1 POSITION (chain state)
// ============================================================================
//
// Per-wallet Trove state read directly from the Liquity V1 contracts at the
// live head — the single-collateral CDP analog of lib/api/fetch-spark-position.
// One Trove per address, fixed singleton contracts (no market axis): the
// TroveManager's entire debt/coll (pending redistribution rewards included),
// the protocol's own PriceFeed ETH:USD price, the collateral ratio the
// TroveManager itself computes, system state (TCR / recovery mode / rates),
// and this Trove's place in the redemption queue (debt in front, troves
// ahead) from one MultiTroveGetter sweep of the sorted list.

export type LiquityV1TroveChainStatus =
  | "nonExistent"
  | "active"
  | "closedByOwner"
  | "closedByLiquidation"
  | "closedByRedemption";

export interface LiquityV1PositionChainResponse {
  wallet: string;
  blockNumber: number;
  troveStatus: LiquityV1TroveChainStatus;
  /** Entire ETH collateral / LUSD debt (display units) — TroveManager.
   *  getEntireDebtAndColl @ head, pending redistribution rewards INCLUDED
   *  (the recorded Troves struct + pending). This is the Trove's true state. */
  coll: number;
  debt: number;
  /** The recorded Troves-struct values (equal to the latest TroveUpdated
   *  absolutes) — what the indexed card shows. entire = recorded + pending. */
  recordedColl: number;
  recordedDebt: number;
  /** Redistribution gains not yet applied to the recorded struct (usually 0 —
   *  non-zero only after a liquidation was redistributed past the Stability Pool). */
  pendingEthReward: number;
  pendingLusdReward: number;
  /** ETH:USD from the protocol's own PriceFeed (fetchPrice simulated at head;
   *  falls back to lastGoodPrice). */
  price: number;
  /** Current individual collateral ratio — TroveManager.getCurrentICR ÷ 1e18.
   *  Null when the Trove has no debt (the contract returns 2^256−1). */
  icr: number | null;
  /** Chain-read constants: minimum (1.1) and critical (1.5) collateral ratios. */
  mcr: number;
  ccr: number;
  /** System state @ head. */
  tcr: number;
  recoveryMode: boolean;
  /** Current one-time borrowing fee rate and redemption fee rate (0..1). */
  borrowingRate: number;
  redemptionRate: number;
  /** Open troves system-wide. */
  trovesCount: number;
  /** LUSD debt queued to be redeemed before this Trove (troves with a lower
   *  collateral ratio), and how many troves that is. Null when the Trove is
   *  not in the sorted list (closed / no debt). */
  debtInFront: number | null;
  trovesAhead: number | null;
  /** Total recorded LUSD debt across the whole sorted list — the same sweep
   *  the queue figures come from, so debtInFront ÷ queueDebtTotal is the
   *  redemption runway's fill. Null when the sweep didn't run. */
  queueDebtTotal: number | null;
  /** True when the RPC read failed and this is an empty stub. */
  chainStale: boolean;
}

export interface FetchLiquityV1PositionParams {
  wallet: string;
  baseUrl?: string;
}

export async function fetchLiquityV1Position(p: FetchLiquityV1PositionParams): Promise<LiquityV1PositionChainResponse> {
  const qs = new URLSearchParams({ wallet: p.wallet });
  const url = `${p.baseUrl ?? ""}/api/chain/liquity-v1/position?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchLiquityV1Position failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as LiquityV1PositionChainResponse;
}
