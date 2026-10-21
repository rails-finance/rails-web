// SERVER-ONLY. The server half of the Compound V3 Arbitrum wallet page: the
// four Comets read at one pinned block (one multicall each), and the history
// from rails-server's store, in parallel under one bounded wait. Either leg
// that does not answer leaves the client half to ask its own route.

import "server-only";
import { cache } from "react";
import { readerHopHeaders } from "@/lib/api/reader-ip";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { loadCompoundWalletFromChain } from "@/lib/sources/chain/compound-position";
import { loadCompoundArbitrumTimeline } from "@/lib/sources/api/compound-arbitrum-timeline";
import { COMPOUND_ARBITRUM_CHAIN_ID, COMPOUND_ARBITRUM_DEPLOYMENT } from "@/lib/compound-arbitrum/asset-catalog";
import type { CompoundWalletChainResponse } from "@/lib/api/fetch-compound-wallet";

/** Well inside the platform's function timeout; a fast unseeded first paint
 *  beats a 503. The Aave V3 and Morpho Blue Arbitrum pages wait the same. */
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

export interface CompoundArbitrumTail {
  /** The Comet read; null when it failed or came back a stale stub. */
  head: CompoundWalletChainResponse | null;
  /** The history in the route's wire shape; null when the store did not
   *  answer. */
  timeline: unknown | null;
  /** The roster key of every Comet the history names. */
  historyMarketKeys: string[];
}

/** `wallet` must already be a well-formed lowercase address. Cached per
 *  request, so the page, its metadata, its share image and an event page
 *  share one read. */
export const loadCompoundArbitrumTail = cache(async (wallet: string): Promise<CompoundArbitrumTail> => {
  try {
    const readerIp = await readerIpFromHeaders();
    const [read, history] = await Promise.all([
      withTimeout(
        loadCompoundWalletFromChain(wallet, COMPOUND_ARBITRUM_DEPLOYMENT),
        "compound-arbitrum position page: Comet read",
      ),
      withTimeout(
        loadCompoundArbitrumTimeline(wallet, readerIp, { hopHeaders: readerHopHeaders(readerIp) }).catch(
          (e: unknown) => {
            console.error("compound-arbitrum position page: history read failed", e);
            return null;
          },
        ),
        "compound-arbitrum position page: history read",
      ),
    ]);
    return {
      head: read && !read.chainStale ? read : null,
      timeline: history ? toTimelineWire(history, COMPOUND_ARBITRUM_CHAIN_ID) : null,
      historyMarketKeys: (history?.markets ?? []).map((m) => m.market),
    };
  } catch (err) {
    console.error("compound-arbitrum position page: read failed; client will fetch", err);
    return { head: null, timeline: null, historyMarketKeys: [] };
  }
});
