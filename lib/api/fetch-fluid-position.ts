// ============================================================================
// FETCH FLUID POSITION (chain state)
// ============================================================================
//
// Per-NFT live state read directly from the Fluid VaultResolver at the head
// block — the risk-surface companion to the captured event replay. The
// response (typed in lib/sources/chain/fluid-position.ts) carries the settled
// supply/borrow (the vault's own fetchLatestPosition settlement math with
// liquidation sweeps and accrued interest applied), the vault's governance
// risk lines (collateralFactor / liquidationThreshold / liquidationMaxLimit /
// liquidationPenalty), the vault oracle's debt-per-col prices (Fluid has no
// USD feed — the engine's whole risk space is the vault's own token pair),
// and the derived ratio / liquidation price in that same space.

import type { FluidPositionChainResponse } from "@/lib/sources/chain/fluid-position";

export type { FluidPositionChainResponse };

export async function fetchFluidChainPosition(nftId: string, baseUrl?: string): Promise<FluidPositionChainResponse> {
  const url = `${baseUrl ?? ""}/api/chain/fluid/position?nft=${encodeURIComponent(nftId)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchFluidChainPosition failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as FluidPositionChainResponse;
}
