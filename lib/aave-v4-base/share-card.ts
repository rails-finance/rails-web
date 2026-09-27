// Aave V4 Base position → share-card model. The Ethereum spoke mapper
// (`lib/aave-v4/share-card.ts`), told which deployment it is — same reasoning
// as `lib/aave-v4-base/list-filter-dimensions.ts` and `aaveV3BaseShareCardModel`
// (`lib/aave-v3-base/share-card.ts`): one shared reduction, a `session` that
// resolves the card's fallback and label to this row's own roster entry.

import { aaveV4SpokeShareCardModel } from "@/lib/aave-v4/share-card";
import type { AaveV4SpokePositionChainResponse } from "@/lib/api/fetch-aave-v4-spoke-position";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { PositionCardModel } from "@/lib/share/position-card";

export function aaveV4BaseSpokeShareCardModel(
  tail: { chain: AaveV4SpokePositionChainResponse | null; events: BaseActivityEvent[] | null },
  wallet: string,
  opts: { spokeName: string; market: string },
): PositionCardModel | null {
  return aaveV4SpokeShareCardModel(tail, wallet, { ...opts, session: "aave-v4-base" });
}
