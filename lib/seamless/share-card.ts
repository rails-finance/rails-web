// Seamless position → share-card model. The bridge between `loadSeamlessTail`'s
// Pool read (the same server tail the position page itself awaits) and the
// shared card renderer — see `lib/shared/v3-pool-share-card.ts` for the logic
// this reuses from the live detail card (`AaveV3PositionCard`, via
// `v3ViewFromChain`). Seamless is frozen, so most accounts here are terminal —
// the closed/liquidated branch is the one that matters most for this family.

import type { V3PoolPositionTail } from "@/lib/shared/swept-position-page-data";
import { v3PoolShareCardModel } from "@/lib/shared/v3-pool-share-card";
import type { PositionCardModel } from "@/lib/share/position-card";

export function seamlessShareCardModel(tail: V3PoolPositionTail, wallet: string): PositionCardModel | null {
  return v3PoolShareCardModel(tail, wallet, { session: "seamless", market: "seamless" });
}
