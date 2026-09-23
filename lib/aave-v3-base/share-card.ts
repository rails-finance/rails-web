// Aave V3 Base position → share-card model. The bridge between
// `loadAaveV3BaseTail`'s Pool read (the same server tail the position page
// itself awaits) and the shared card renderer — see
// `lib/shared/v3-pool-share-card.ts` for the logic this reuses from the live
// detail card (`AaveV3PositionCard`, via `v3ViewFromChain`).

import type { V3PoolPositionTail } from "@/lib/shared/swept-position-page-data";
import { v3PoolShareCardModel } from "@/lib/shared/v3-pool-share-card";
import type { PositionCardModel } from "@/lib/share/position-card";

export function aaveV3BaseShareCardModel(tail: V3PoolPositionTail, wallet: string): PositionCardModel | null {
  return v3PoolShareCardModel(tail, wallet, { session: "aave-v3-base", market: "base" });
}
