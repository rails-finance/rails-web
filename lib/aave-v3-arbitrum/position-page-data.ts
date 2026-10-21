// SERVER-ONLY. The server half of the Aave V3 Arbitrum position page: the Pool
// read live at the head, and the history from rails-server's store, both under
// the bounded wait of lib/shared/swept-position-page-data.ts. Either leg that
// does not answer leaves the client half to ask its own route.

import { cache } from "react";
import { sweptPositionLoader, type V3PoolPositionTail } from "@/lib/shared/swept-position-page-data";
import { loadAaveV3PositionFromChain } from "@/lib/sources/chain/aave-v3-position";
import { loadAaveV3ArbitrumTimeline } from "@/lib/sources/api/aave-v3-arbitrum-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { AAVE_V3_ARBITRUM_CHAIN_ID, AAVE_V3_ARBITRUM_POOL } from "@/lib/aave-v3-arbitrum/asset-catalog";

const load = sweptPositionLoader({
  label: "aave-v3-arbitrum",
  // `chainStale` is the reader's "the RPC failed and this is a stub": no read.
  readHead: async (wallet) => {
    const read = await loadAaveV3PositionFromChain(wallet, AAVE_V3_ARBITRUM_POOL, undefined, AAVE_V3_ARBITRUM_CHAIN_ID);
    return read.chainStale ? null : read;
  },
  readWholeIndexedHistory: async (wallet, readerIp) => {
    const history = await loadAaveV3ArbitrumTimeline(wallet, readerIp, { render: true }).catch((e: unknown) => {
      console.error("aave-v3-arbitrum position page: history read failed", e);
      return null;
    });
    return history ? toTimelineWire(history, AAVE_V3_ARBITRUM_CHAIN_ID) : null;
  },
});

/** One Pool, so the wallet alone keys the read. `wallet` must already be a
 *  well-formed address. Cached per request, so the page, its metadata and an
 *  event page share one read. */
export const loadAaveV3ArbitrumTail = cache(async (wallet: string): Promise<V3PoolPositionTail> => {
  const { head, timeline } = await load(wallet);
  return { position: head, timeline };
});
