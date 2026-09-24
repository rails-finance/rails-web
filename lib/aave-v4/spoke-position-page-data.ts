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
//
// All four reads go to the BOX, not to this deployment's own /api proxies: the
// four route handlers behind them (positions, spoke-position, timeline, prices)
// forward the query and hand the backend's JSON back unchanged, so a self-hop
// bought nothing and cost a function invocation each. The listing's server read
// has taken the box directly since it was written; this is the detail catching
// up with it.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { fetchAaveV4Positions, fetchAaveV4Timeline, type AaveV4Position } from "@/lib/api/fetch-aave-v4";
import {
  fetchAaveV4SpokePosition,
  type AaveV4SpokePositionChainResponse,
} from "@/lib/api/fetch-aave-v4-spoke-position";
import { SPOKE_NAME_TO_KEY } from "@/lib/aave-v4/spoke-meta";
import { boxHop } from "@/lib/shared/listing-ssr";
import { fetchPrices } from "@/lib/api/fetch-prices";
import { PRICEABLE_TOKEN_ADDRESSES } from "@/lib/aave/prices";

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
    hop: boxHop,
  });
  return { ...tail, spokePositions: tail.positions?.positions ?? null, chain: tail.positions?.chain ?? null };
});

// Bound the price leg the way the tail beside it is bounded.
const PRICES_FETCH_TIMEOUT_MS = 8000;

/**
 * The card's USD prices, read on the server so the collateral / supplied figure
 * ships in the HTML instead of as a skeleton the client fills after hydration.
 *
 * The WHOLE priceable set, not the position's own reserves: `resolvePrice` can
 * only reach an address in TOKEN_ADDR, and the position's reserves are known
 * only after the tail has answered. Asking for the lot instead lets this run
 * BESIDE the tail rather than chained behind it, and the box answers a price
 * batch in single-digit milliseconds.
 *
 * Best-effort, like the tail: a failure returns an empty seed and the client's
 * PricesProvider fetches on mount exactly as it did before.
 */
export const loadAaveV4CardPrices = cache(async (): Promise<Record<string, number>> => {
  const hop = await boxHop();
  if (!hop) return {};
  try {
    return await fetchPrices({
      tokens: PRICEABLE_TOKEN_ADDRESSES,
      baseUrl: hop.baseUrl,
      headers: hop.headers,
      signal: AbortSignal.timeout(PRICES_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("aave-v4-spoke-page-data: price read failed; client will fetch", err);
    return {};
  }
});
