// A wallet's history on the four Compound V3 Comets on Arbitrum, from
// rails-server.
// ----------------------------------------------------------------------------
// ONE call: GET /api/compound-v3-arbitrum/timeline?wallet= (the wire shape is
// lib/compound-arbitrum/api-contract.ts). The server holds the body of the
// history (Etherscan's log index, or Tenderly's) with a Tenderly tail merged
// over it; nothing here sweeps the Comets' logs, and there is no sweep to fall
// back to on this chain (rails-ops TO-DO-arbitrum-scoping.md item 12).
//
// The rows go through the Base index reader's decode (decodeCometIndexRows)
// and the one Comet replay (replayCometRows), so the cards, the running
// balances, the peaks and the lifetime flows are the same arithmetic. What
// differs is the verdict: the coverage carries the store's confirmation
// state, which the page's whole-life gate reads (lib/compound-arbitrum/
// whole-life.ts), in place of the Base index's backfill test. The lane sends
// no block state, so each row's base is the running sum of the logged
// amounts, as the Base sweep's is.
//
// SERVER-ONLY.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import {
  attachCometEthUsd,
  replayCometRows,
  type CometChainTimelineResult,
} from "@/lib/sources/chain/compound-v3-events";
import { decodeCometIndexRows } from "@/lib/sources/api/compound-base-timeline";
import { resolveErc20Meta, type Erc20Meta } from "@/lib/sources/chain/erc20-meta";
import { readTimelineAnswer } from "@/lib/aave-v3-arbitrum/api-contract";
import { COMPOUND_ARBITRUM_API_PREFIX, type CompoundArbitrumTimelineRow } from "@/lib/compound-arbitrum/api-contract";
import {
  COMPOUND_ARBITRUM_CHAIN_ID,
  COMPOUND_ARBITRUM_DEPLOY_BLOCK,
  COMPOUND_ARBITRUM_DEPLOYMENT,
} from "@/lib/compound-arbitrum/asset-catalog";

/** The server fetches Etherscan on a wallet it has not seen (40 queries at
 *  400 ms for the four Comets); past this the page states the history as
 *  unread rather than wait. */
const TIMEOUT_MS = 25_000;

const BASE_KINDS = new Set(["supply", "withdraw", "absorb_debt", "transfer_in", "transfer_out"]);

/**
 * The history, replayed. Null when the store could not be asked or did not
 * answer with the contract's shape — "could not look", which the caller never
 * turns into an empty history.
 */
export async function loadCompoundArbitrumTimeline(
  wallet: string,
  readerIp?: string,
): Promise<CometChainTimelineResult | null> {
  const base = process.env.RAILS_API_URL;
  if (!base) return null;
  const w = wallet.toLowerCase();
  const res = await fetch(`${base}${COMPOUND_ARBITRUM_API_PREFIX}/timeline?wallet=${w}`, {
    ...createAuthFetchOptions(undefined, readerIp),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    console.error(`${COMPOUND_ARBITRUM_API_PREFIX}/timeline answered ${res.status} ${res.statusText}`);
    return null;
  }
  const answer = readTimelineAnswer<CompoundArbitrumTimelineRow>(await res.json());
  if (!answer) {
    console.error(`${COMPOUND_ARBITRUM_API_PREFIX}/timeline answered outside the contract`);
    return null;
  }

  const deployment = COMPOUND_ARBITRUM_DEPLOYMENT;
  const { rows, timestamps, senders } = decodeCometIndexRows(answer.rows, w, deployment);
  // The WETH Comet's absorb values are in WETH: WETH/USD at their blocks.
  await attachCometEthUsd(rows, deployment);
  // Collateral names and decimals from the stated rosters; a token outside
  // them (one listed after the roster was written) is asked of the chain.
  const metas = new Map<string, Erc20Meta>();
  for (const m of deployment.markets)
    for (const a of m.collateral ?? [])
      metas.set(a.asset, { address: a.asset, symbol: a.symbol, decimals: a.decimals, named: true });
  const unknown = new Set<string>();
  for (const d of rows) if (!BASE_KINDS.has(d.kind) && !metas.has(d.asset)) unknown.add(d.asset);
  if (unknown.size > 0)
    for (const [a, meta] of await resolveErc20Meta([...unknown], COMPOUND_ARBITRUM_CHAIN_ID)) metas.set(a, meta);
  const cov = answer.coverage;
  const result = replayCometRows({
    wallet: w,
    chainId: COMPOUND_ARBITRUM_CHAIN_ID,
    deployment,
    rows,
    metas,
    timestamps,
    senders,
    maxRendered: TIMELINE_WINDOW_EVENTS,
    // The anchor draws every row the wallet signed from below the cut, and
    // decides that by the sender; while the validator has not filled every
    // `tx_from`, the cut is a plain depth cut instead.
    anchorWalletRows: senders.size === new Set(rows.map((r) => r.txHash)).size,
    coverage: {
      fromBlock: COMPOUND_ARBITRUM_DEPLOY_BLOCK,
      toBlock: Math.max(cov.tailThroughBlock ?? 0, cov.bodyThroughBlock ?? 0, COMPOUND_ARBITRUM_DEPLOY_BLOCK),
      // An answer cut at the row ceiling is not the whole life.
      fromDeployment: cov.fromDeployment && !answer.truncated,
      deployBlock: COMPOUND_ARBITRUM_DEPLOY_BLOCK,
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
