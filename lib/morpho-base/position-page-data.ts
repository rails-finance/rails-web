// SERVER-ONLY — imported only from the two Morpho Blue Base pages' server
// components (and their share-image routes). The doctrine and the timeout
// live in lib/shared/swept-position-page-data.ts.
//
// Both legs, since 2026-09-03. Measured against the live deployment:
//
//   slot read (the singleton asked about every censused market)  1.3-1.8s
//   history, INDEXED and whole                                    0.2-0.8s
//   history, swept from the singleton's logs                      2.9-16.8s
//
// The history's leg is conditional on the index vouching for the whole life
// — the same whole-or-nothing verdict /api/chain/morpho-base/timeline draws
// through the same reader (lib/sources/api/morpho-base-timeline), so the two
// can never disagree about which store answered. The Sieve indexer's backfill
// reached the Sieve checkpoint (50,482,355) on 2026-09-03 and
// /api/morpho-base/coverage reports `historyComplete: true`, which is what
// this file used to name as its re-take condition. A wallet the index cannot
// vouch for — the read cut at the API's row ceiling, or the box unreachable —
// gets NO history seed and the client sweeps exactly as before.
//
// The slot read calls the chain loader directly rather than this deployment's
// own /api/chain/morpho-base/wallet: that handler runs exactly this line.

import { sweptPositionLoader } from "@/lib/shared/swept-position-page-data";
import { loadMorphoWalletFromChain } from "@/lib/sources/chain/morpho-wallet";
import { loadMorphoEventsFromIndex } from "@/lib/sources/api/morpho-base-timeline";
import { MORPHO_BASE_DEPLOYMENT } from "@/lib/sources/chain/morpho-deployments";
import { MORPHO_BASE_DEPLOY_BLOCK } from "@/lib/morpho-base/asset-catalog";
import { toGroupedTimelineWire } from "@/lib/shared/timeline-wire";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import type { MorphoWalletChainResponse } from "@/lib/api/fetch-morpho-wallet";

export const loadMorphoBaseTail = sweptPositionLoader<MorphoWalletChainResponse>({
  label: "morpho-base",
  readHead: async (wallet) => {
    const data = await loadMorphoWalletFromChain(wallet, MORPHO_BASE_DEPLOYMENT);
    // `chainStale` is the reader's own "the RPC failed and this is a stub".
    // Seeding the client with that would paint an untouched wallet as a read
    // one, so it counts as no read at all.
    return data && !data.chainStale ? data : null;
  },
  readWholeIndexedHistory: async (wallet, readerIp) => {
    const indexed = await loadMorphoEventsFromIndex(
      { wallet, deployment: MORPHO_BASE_DEPLOYMENT, deployBlock: MORPHO_BASE_DEPLOY_BLOCK },
      readerIp,
    ).catch((e: unknown) => {
      // The index being unreachable is a reason to let the client sweep, not to
      // forfeit the slot seed beside it.
      console.error("morpho-base position page: index read failed", e);
      return null;
    });
    if (!indexed?.whole) {
      if (indexed) console.warn(`morpho-base position page: index not whole for ${wallet} (${indexed.reason})`);
      return null;
    }
    // The GROUPED wire shape — one list per (market, wallet) pair — which is
    // what the route sends and what the client's rehydrator expects.
    return toGroupedTimelineWire(indexed.result, BASE_CHAIN_ID);
  },
});
