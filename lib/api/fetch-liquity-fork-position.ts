// ============================================================================
// FETCH LIQUITY-FORK TROVE (chain state) — Ebisu + Asymmetry + Basedollar
// ============================================================================
//
// Per-(branch, troveId) state read directly from the fork's own branch
// contracts at the live head — the risk-surface companion to the captured
// event replay. The response (typed in lib/sources/chain/liquity-fork-position.ts)
// carries the canonical V2 trove struct (entire debt/coll with pending
// redistribution and accrued interest), the branch's own oracle price
// (simulated fetchPrice; `priceStale` when only the lagging lastGoodPrice
// answered), the CONTRACT's own getCurrentICR, the chain-verified
// MCR/CCR/SCR, branch TCR, and the branch-scoped redemption queue
// (debt-in-front over SortedTroves' descending-rate order).

import type { LiquityForkTroveChainResponse } from "@/lib/sources/chain/liquity-fork-position";

export type { LiquityForkTroveChainResponse };

export interface FetchLiquityForkPositionParams {
  protocol: "ebisu" | "asymmetry" | "basedollar";
  /** Branch key or display symbol (the route resolves either). */
  branch: string;
  troveId: string;
  baseUrl?: string;
}

export async function fetchLiquityForkPosition(
  p: FetchLiquityForkPositionParams,
): Promise<LiquityForkTroveChainResponse> {
  const qs = new URLSearchParams({ branch: p.branch, troveId: p.troveId });
  const url = `${p.baseUrl ?? ""}/api/chain/${p.protocol}/position?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchLiquityForkPosition failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as LiquityForkTroveChainResponse;
}
