// A wallet's history on Morpho Blue Arbitrum, from rails-server.
// ----------------------------------------------------------------------------
// ONE call: GET /api/morpho-blue-arbitrum/timeline?wallet= (the wire shape is
// lib/morpho-arbitrum/api-contract.ts). The server holds the body of the
// history (Etherscan's log index, or Tenderly's) with a Tenderly tail merged
// over it; nothing here sweeps the singleton's logs, and there is no sweep to
// fall back to on this chain (rails-ops TO-DO-arbitrum-scoping.md item 13).
//
// The rows go through the Base index reader's decode and the one Morpho replay
// (replayMorphoRows), so the cards, the running balances and the lifetime sums
// are the same arithmetic. What differs is the verdict: the coverage carries
// the store's confirmation state, which the page's whole-life gate reads
// (lib/morpho-arbitrum/whole-life.ts), in place of the Base index's backfill
// test.
//
// SERVER-ONLY.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import { replayMorphoRows, type MorphoChainTimelineResult } from "@/lib/sources/chain/morpho-blue-events";
import { decodeMorphoIndexRows } from "@/lib/sources/api/morpho-base-timeline";
import { MORPHO_ARBITRUM_DEPLOYMENT } from "@/lib/sources/chain/morpho-deployments";
import { readTimelineAnswer } from "@/lib/aave-v3-arbitrum/api-contract";
import { MORPHO_ARBITRUM_API_PREFIX, type MorphoArbitrumTimelineRow } from "@/lib/morpho-arbitrum/api-contract";
import { MORPHO_ARBITRUM_DEPLOY_BLOCK } from "@/lib/morpho-arbitrum/asset-catalog";

/** The server fetches Etherscan on a wallet it has not seen; past this the
 *  page states the history as unread rather than wait. */
const TIMEOUT_MS = 20_000;

/**
 * The history, replayed. Null when the store could not be asked or did not
 * answer with the contract's shape — "could not look", which the caller never
 * turns into an empty history.
 */
export async function loadMorphoArbitrumTimeline(
  wallet: string,
  readerIp?: string,
): Promise<MorphoChainTimelineResult | null> {
  const base = process.env.RAILS_API_URL;
  if (!base) return null;
  const w = wallet.toLowerCase();
  const res = await fetch(`${base}${MORPHO_ARBITRUM_API_PREFIX}/timeline?wallet=${w}`, {
    ...createAuthFetchOptions(undefined, readerIp),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    console.error(`${MORPHO_ARBITRUM_API_PREFIX}/timeline answered ${res.status} ${res.statusText}`);
    return null;
  }
  const answer = readTimelineAnswer<MorphoArbitrumTimelineRow>(await res.json());
  if (!answer) {
    console.error(`${MORPHO_ARBITRUM_API_PREFIX}/timeline answered outside the contract`);
    return null;
  }
  const { rows, timestamps, senders } = decodeMorphoIndexRows(answer.rows);
  const cov = answer.coverage;
  const result = await replayMorphoRows({
    wallet: w,
    deployment: MORPHO_ARBITRUM_DEPLOYMENT,
    rows,
    maxRendered: TIMELINE_WINDOW_EVENTS,
    // The anchor draws every row the wallet signed from below the cut, and
    // decides that by the sender; while the validator has not filled every
    // `tx_from`, the cut is a plain depth cut instead.
    anchorWalletRows: senders.size === new Set(rows.map((r) => r.txHash)).size,
    metadata: async () => ({ timestamps, senders }),
    coverage: {
      fromBlock: MORPHO_ARBITRUM_DEPLOY_BLOCK,
      toBlock: Math.max(cov.tailThroughBlock ?? 0, cov.bodyThroughBlock ?? 0, MORPHO_ARBITRUM_DEPLOY_BLOCK),
      // An answer cut at the row ceiling is not the whole life.
      fromDeployment: cov.fromDeployment && !answer.truncated,
      deployBlock: MORPHO_ARBITRUM_DEPLOY_BLOCK,
      gaps: cov.gaps.map((g) => ({ from: g.from, to: g.to })),
      source: cov.source,
    },
  });
  return {
    ...result,
    coverage: {
      ...result.coverage,
      confirmation: {
        status: cov.status,
        confirmedThroughBlock: cov.confirmedThroughBlock,
        droppedCount: cov.droppedCount,
        dropped: cov.dropped,
      },
    },
  };
}
