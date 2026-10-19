// SERVER-ONLY. The server half of the Morpho Blue Arbitrum wallet and position
// pages: the singleton's slots read at one pinned block, and the history from
// rails-server's store, in parallel under one bounded wait. Either leg that
// does not answer leaves the client half to ask its own route.
//
// The slot read asks every censused market. A market the history names that
// the census does not hold (one created after the census block) is asked in a
// second read once the history has answered, so the present and the visit's
// market list cover every market the wallet ever touched.

import { cache } from "react";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { toGroupedTimelineWire } from "@/lib/shared/timeline-wire";
import { loadMorphoArbitrumWallet } from "@/lib/sources/chain/morpho-arbitrum-wallet";
import { loadMorphoArbitrumTimeline } from "@/lib/sources/api/morpho-arbitrum-timeline";
import { MORPHO_ARBITRUM_MARKETS } from "@/lib/morpho-arbitrum/market-catalog";
import { MORPHO_ARBITRUM_CHAIN_ID } from "@/lib/morpho-arbitrum/asset-catalog";
import type { MorphoWalletChainResponse } from "@/lib/api/fetch-morpho-wallet";

/** Well inside the platform's function timeout; a fast unseeded first paint
 *  beats a 503. The Aave V3 Arbitrum page waits the same. */
const READ_TIMEOUT_MS = 6000;

async function withTimeout<T>(p: Promise<T>, label: string): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          console.error(`${label} exceeded ${READ_TIMEOUT_MS}ms`);
          resolve(null);
        }, READ_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    console.error(`${label} failed`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const CENSUS_IDS = new Set(MORPHO_ARBITRUM_MARKETS.map((m) => m.id.toLowerCase()));

export interface MorphoArbitrumTail {
  /** The slot read; null when it failed or came back a stale stub. */
  head: MorphoWalletChainResponse | null;
  /** The history in the route's grouped wire shape; null when the store did
   *  not answer. */
  timeline: unknown | null;
  /** Every market the history names, lowercase and 0x-prefixed. */
  historyMarketIds: string[];
}

/** `wallet` must already be a well-formed lowercase address. Cached per
 *  request, so the page, its metadata, its share image and an event page
 *  share one read. */
export const loadMorphoArbitrumTail = cache(async (wallet: string): Promise<MorphoArbitrumTail> => {
  try {
    const readerIp = await readerIpFromHeaders();
    const [slots, history] = await Promise.all([
      withTimeout(loadMorphoArbitrumWallet(wallet), "morpho-arbitrum position page: slot read"),
      withTimeout(
        loadMorphoArbitrumTimeline(wallet, readerIp).catch((e: unknown) => {
          console.error("morpho-arbitrum position page: history read failed", e);
          return null;
        }),
        "morpho-arbitrum position page: history read",
      ),
    ]);
    const historyMarketIds = (history?.positions ?? []).map((p) => p.marketId.toLowerCase());
    let head = slots && !slots.chainStale ? slots : null;
    const unrostered = historyMarketIds.filter((id) => !CENSUS_IDS.has(id));
    if (head && unrostered.length > 0) {
      const wider = await withTimeout(
        loadMorphoArbitrumWallet(wallet, unrostered),
        "morpho-arbitrum position page: unrostered slot read",
      );
      head = wider && !wider.chainStale ? wider : null;
    }
    return {
      head,
      timeline: history ? toGroupedTimelineWire(history, MORPHO_ARBITRUM_CHAIN_ID) : null,
      historyMarketIds,
    };
  } catch (err) {
    console.error("morpho-arbitrum position page: read failed; client will fetch", err);
    return { head: null, timeline: null, historyMarketIds: [] };
  }
});
