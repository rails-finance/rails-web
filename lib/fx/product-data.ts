// The pools read cut to what each product page draws (lib/fx/product.tsx):
// server-side, so the roster's payload carries no ticks and a pool's page
// carries its pool alone.

import type { FxPoolKey } from "@/lib/fx/asset-catalog";
import type { FxSystemChainResponse } from "@/lib/sources/chain/fx-system";

/** The roster's read, without the ticks the heads do not draw. */
export function fxRosterData(data: FxSystemChainResponse): FxSystemChainResponse {
  return { ...data, pools: data.pools.map((p) => ({ ...p, ticks: [] })) };
}

/** One pool's read: the pool alone. */
export function fxPoolData(data: FxSystemChainResponse, key: FxPoolKey): FxSystemChainResponse {
  return { ...data, pools: data.pools.filter((p) => p.key === key) };
}
