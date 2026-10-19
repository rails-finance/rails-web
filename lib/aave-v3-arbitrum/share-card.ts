// Aave V3 Arbitrum position → share-card model, through the Base bridge
// (lib/shared/v3-pool-share-card.ts). That mapper reads a seeded timeline as a
// whole life; here the history is one only once the store has confirmed it,
// so an unconfirmed history reaches it as none.

import type { V3PoolPositionTail } from "@/lib/shared/swept-position-page-data";
import { v3PoolShareCardModel } from "@/lib/shared/v3-pool-share-card";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import type { ChainTimelineResponse } from "@/lib/api/fetch-chain-timeline";
import type { PositionCardModel } from "@/lib/share/position-card";
import { aaveV3ArbitrumWholeLife } from "./whole-life";

export function aaveV3ArbitrumShareCardModel(tail: V3PoolPositionTail, wallet: string): PositionCardModel | null {
  const timeline = tail.timeline ? (rehydrateChainTimelineWire(tail.timeline) as ChainTimelineResponse) : null;
  const whole = timeline != null && aaveV3ArbitrumWholeLife(timeline.coverage);
  return v3PoolShareCardModel({ position: tail.position, timeline: whole ? tail.timeline : null }, wallet, {
    session: "aave-v3-arbitrum",
    market: "arbitrum",
  });
}
