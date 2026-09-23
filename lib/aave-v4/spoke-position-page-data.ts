// The Aave V4 spoke position's tail, read server-side. SERVER-ONLY — imported
// only from the spoke page's server component. The shape and the failure rules
// live in lib/shared/position-tail-page-data.ts.
//
// THREE reads, and the chain one belongs here. The page's card, risk strip and
// tower read the spoke's own state at head; the indexed roster and timeline
// carry the rest, and the two are merged into one set of face figures. Seeding
// the indexed halves alone would render a document whose numbers then changed
// when the chain read landed.
//
// The chain read is still allowed to fail on its own — the page falls back to
// the indexed figures and says so — so it is caught here rather than forfeiting
// the history beside it.
//
// The timeline route is not windowed, so there is no opening balance to read.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { fetchAaveV4Positions, fetchAaveV4Timeline, type AaveV4Position } from "@/lib/api/fetch-aave-v4";
import {
  fetchAaveV4SpokePosition,
  type AaveV4SpokePositionChainResponse,
} from "@/lib/api/fetch-aave-v4-spoke-position";
import { SPOKE_NAME_TO_KEY } from "@/lib/aave-v4/spoke-meta";

interface AaveV4SpokeReads {
  positions: AaveV4Position[];
  chain: AaveV4SpokePositionChainResponse | null;
}

export const loadAaveV4SpokeTail = cache(async (wallet: string, spokeName: string) => {
  const spokeKey = SPOKE_NAME_TO_KEY[spokeName];
  const tail = await loadPositionTail<AaveV4SpokeReads>({
    label: "aave-v4",
    readPositions: async (baseUrl, headers) => {
      const [posResult, chain] = await Promise.all([
        fetchAaveV4Positions({ wallet, baseUrl, headers }),
        spokeKey
          ? fetchAaveV4SpokePosition({ wallet, spoke: spokeKey, baseUrl, headers }).catch((err) => {
              console.warn("aave-v4-spoke-page-data: chain-state read failed; indexed figures stand", err);
              return null;
            })
          : Promise.resolve(null),
      ]);
      return { positions: posResult.positions, chain };
    },
    readTimeline: (baseUrl, headers) => fetchAaveV4Timeline({ wallet, baseUrl, headers }),
  });
  return { ...tail, spokePositions: tail.positions?.positions ?? null, chain: tail.positions?.chain ?? null };
});
