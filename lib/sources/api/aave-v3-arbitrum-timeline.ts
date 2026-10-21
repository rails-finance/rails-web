// A wallet's history on the Aave V3 Arbitrum Pool, from rails-server.
// ----------------------------------------------------------------------------
// ONE call: GET /api/aave-v3-arbitrum/timeline?wallet= (the wire shape is
// lib/aave-v3-arbitrum/api-contract.ts). The server holds the body of the
// history (Etherscan's log index, or Tenderly's) with a Tenderly tail merged
// over it; nothing here sweeps the chain's logs — the Pool is 500M blocks
// deep, and the chunked sweep does not run on this chain (rails-ops
// TO-DO-arbitrum-scoping.md §8 phase 3).
//
// The rows go through the replay the Base index tier uses (decodeAaveV3IndexRows
// → replayAaveV3Rows), so the cards, the running balances and the lifetime sums
// are the same arithmetic. What differs is the verdict: the coverage carries
// the store's confirmation state, which the page's whole-life gate reads.
//
// SERVER-ONLY.

import { createAuthFetchOptions, type AuthCallOptions } from "@/lib/api/fetch-with-auth";
import { throwIfOverBudget } from "@/lib/api/api-over-budget";
import { TIMELINE_WINDOW_ROWS } from "@/lib/shared/timeline-opening-balance";
import { replayAaveV3Rows, type AaveV3ChainTimelineResult } from "@/lib/sources/chain/aave-v3-events";
import { resolveV3Tokens } from "@/lib/sources/chain/aave-v3-tokens";
import { decodeAaveV3IndexRows } from "@/lib/sources/api/aave-v3-base-timeline";
import { AAVE_V3_ARBITRUM_API_PREFIX, readTimelineAnswer } from "@/lib/aave-v3-arbitrum/api-contract";
import { AAVE_V3_ARBITRUM_CHAIN_ID, AAVE_V3_ARBITRUM_DEPLOY_BLOCK } from "@/lib/aave-v3-arbitrum/asset-catalog";

/** The server fetches Etherscan on a wallet it has not seen; past this the
 *  page states the history as unread rather than wait. */
const TIMEOUT_MS = 20_000;

/**
 * The history, replayed. Null when the store could not be asked or did not
 * answer with the contract's shape — "could not look", which the caller never
 * turns into an empty history. Throws ApiOverBudget when the store answers
 * 429 (this reader's whole-history budget is spent). `call.hopHeaders` is
 * a server render's signed hop pair, sent when given.
 */
export async function loadAaveV3ArbitrumTimeline(
  wallet: string,
  readerIp?: string,
  call?: AuthCallOptions,
): Promise<AaveV3ChainTimelineResult | null> {
  const base = process.env.RAILS_API_URL;
  if (!base) return null;
  const w = wallet.toLowerCase();
  const res = await fetch(`${base}${AAVE_V3_ARBITRUM_API_PREFIX}/timeline?wallet=${w}`, {
    ...createAuthFetchOptions(undefined, readerIp, call),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  throwIfOverBudget(res, `${AAVE_V3_ARBITRUM_API_PREFIX}/timeline`);
  if (!res.ok) {
    console.error(`${AAVE_V3_ARBITRUM_API_PREFIX}/timeline answered ${res.status} ${res.statusText}`);
    return null;
  }
  const answer = readTimelineAnswer(await res.json());
  if (!answer) {
    console.error(`${AAVE_V3_ARBITRUM_API_PREFIX}/timeline answered outside the contract`);
    return null;
  }

  const { rows, timestamps, senders } = decodeAaveV3IndexRows(answer.rows);
  const reserves = new Set<string>();
  for (const r of rows) {
    reserves.add(r.reserve);
    if (r.collateralAsset) reserves.add(r.collateralAsset);
  }
  const metas = await resolveV3Tokens([...reserves], AAVE_V3_ARBITRUM_CHAIN_ID);
  const cov = answer.coverage;
  const result = replayAaveV3Rows({
    wallet: w,
    chainId: AAVE_V3_ARBITRUM_CHAIN_ID,
    rows,
    metas,
    timestamps,
    senders,
    maxRendered: TIMELINE_WINDOW_ROWS,
    // The anchor draws every row the wallet signed from below the cut, and
    // decides that by the sender; while the validator has not filled every
    // `tx_from`, the cut is a plain depth cut instead.
    anchorWalletRows: senders.size === new Set(rows.map((r) => r.txHash)).size,
    coverage: {
      fromBlock: AAVE_V3_ARBITRUM_DEPLOY_BLOCK,
      toBlock: Math.max(cov.tailThroughBlock ?? 0, cov.bodyThroughBlock ?? 0, AAVE_V3_ARBITRUM_DEPLOY_BLOCK),
      // An answer without the aToken transfers, or cut at the row ceiling, is
      // not the whole life.
      fromDeployment: cov.fromDeployment && answer.transfersCaptured && !answer.truncated,
      deployBlock: AAVE_V3_ARBITRUM_DEPLOY_BLOCK,
      gaps: cov.gaps.map((g) => ({ from: g.from, to: g.to })),
      source: cov.source,
    },
  });
  return {
    ...result,
    coverage: {
      ...result.coverage,
      ...(cov.throughBlock != null ? { throughBlock: cov.throughBlock } : {}),
      confirmation: {
        status: cov.status,
        confirmedThroughBlock: cov.confirmedThroughBlock,
        droppedCount: cov.droppedCount,
        dropped: cov.dropped,
      },
    },
  };
}
