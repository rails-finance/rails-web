// SERVER-ONLY — see lib/shared/swept-position-page-data.ts for which legs the
// server answers and why the history's depends on the index vouching.
//
// Compound V3 on Base is a ROSTER read, not a single-market one. There is no
// Ethereum twin of the wallet route: there the index knows which Comets a wallet
// has touched and the explorer links to one (market, wallet) pair at a time;
// here every Comet is asked about the account in three batched calls, so the
// answer is exhaustive rather than a sample.

import { sweptPositionLoader } from "@/lib/shared/swept-position-page-data";
import { loadCompoundWalletFromChain } from "@/lib/sources/chain/compound-position";
import { loadCometEventsFromIndex } from "@/lib/sources/api/compound-base-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import {
  COMPOUND_BASE_CHAIN_ID,
  COMPOUND_BASE_DEPLOYMENT,
  COMPOUND_BASE_DEPLOY_BLOCK,
} from "@/lib/compound-base/asset-catalog";
import type { CompoundWalletChainResponse } from "@/lib/api/fetch-compound-wallet";

export const loadCompoundBaseTail = sweptPositionLoader<CompoundWalletChainResponse>({
  label: "compound-v3-base",
  readHead: async (wallet) => {
    const data = await loadCompoundWalletFromChain(wallet, COMPOUND_BASE_DEPLOYMENT);
    // `chainStale` is the reader's own "the RPC failed and this is a stub".
    // Seeding the client with that would paint an untouched wallet as a read
    // one, so it counts as no read at all.
    return data && !data.chainStale ? data : null;
  },
  readWholeIndexedHistory: async (wallet, readerIp) => {
    const indexed = await loadCometEventsFromIndex(
      {
        wallet,
        deployment: COMPOUND_BASE_DEPLOYMENT,
        apiPrefix: "/api/compound-base",
        deployBlock: COMPOUND_BASE_DEPLOY_BLOCK,
      },
      readerIp,
    ).catch((e: unknown) => {
      // The index being unreachable is a reason to let the client sweep, not to
      // forfeit the head seed beside it.
      console.error("compound-v3-base position page: index read failed", e);
      return null;
    });
    // A HEAVY wallet IS the answer the route serves: whole when its elided
    // history travelled as seeds, a stated horizon when it did not — and a
    // sweep for such an address reaches a shallower one at far greater cost.
    // The verdict travels in the coverage the wire carries, and the page's
    // own `sweptClean` gate reads it.
    if (!indexed?.whole && !indexed?.heavy) {
      if (indexed) console.warn(`compound-v3-base position page: index not whole for ${wallet} (${indexed.reason})`);
      return null;
    }
    if (indexed.heavy && !indexed.whole)
      console.warn(`compound-v3-base position page: heavy wallet ${wallet} (${indexed.reason})`);
    return toTimelineWire(indexed.result, COMPOUND_BASE_CHAIN_ID);
  },
});
