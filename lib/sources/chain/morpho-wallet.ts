// Every Morpho Blue position one wallet holds — server-only.
// ----------------------------------------------------------------------------
// This has no equivalent on the Ethereum explorer, and the reason is worth
// stating: there, a wallet's positions come out of the index, which knows them
// because it replayed every event. Base has no index, so the question "what
// does this wallet hold" has to be asked of the chain — and Blue will not
// answer it. A position is `position(id, user)`, a slot you can only read if
// you already know the id; the singleton offers no per-user enumeration and no
// per-market user list.
//
// What makes it answerable anyway is that the ROSTER is knowable. Blue's
// markets are censused offline from the CreateMarket log
// (morpho-deployments.ts), so the ids are all in hand — and then finding a
// wallet's positions is just asking for every one of them. On Base that is
// 4,306 slots, which sounds prohibitive and is not: batched into eleven
// multicalls it comes back in about a second (measured 2026-08-23, 0.6–1.0 s
// across live borrowers). Brute force over a known roster beats an index that
// does not exist.
//
// The sweep is exact, not a heuristic: it asks about EVERY market rather than a
// likely subset, so a position in the most obscure market on the chain is found
// exactly as reliably as one in the largest. What it cannot see is a market
// created after the census block — which is why that block travels in the
// response and every surface states it.
//
// SERVER-ONLY.

import { getAddress, parseAbi } from "viem";
import { chainClient } from "./rpc";
import { loadMorphoPositionFromChain } from "./morpho-position";
import type { MorphoDeployment } from "./morpho-deployments";
import { withIndexedRoster } from "./morpho-roster";
import type { MorphoWalletChainResponse } from "@/lib/api/fetch-morpho-wallet";

const BLUE_ABI = parseAbi([
  "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
]);

const ZERO = BigInt(0);

/** Slots per multicall. The same 400 the markets reader uses, for the same
 *  reason: viem would otherwise pick the boundaries by byte budget and the
 *  round-trip count would stop being predictable. */
const CHUNK = 400;

/** How many found positions get the full read below. A wallet with more than
 *  this is not truncated silently — `positionsFound` states the real number
 *  beside the ones shown. In practice the live borrowers measured hold 2–6. */
const MAX_DETAILED = 40;

/** Concurrent full reads. Each one costs about three round trips, so an
 *  unbounded fan-out over a wallet holding dozens would be a burst of a hundred
 *  requests at a free endpoint. */
const DETAIL_CONCURRENCY = 8;

function empty(wallet: string, deployment: MorphoDeployment): MorphoWalletChainResponse {
  return {
    wallet,
    blockNumber: 0,
    censusBlock: deployment.censusBlock,
    marketsScanned: 0,
    positionsFound: 0,
    positions: [],
    chainStale: true,
  };
}

/** Run `work` over `items` at most `limit` at a time, preserving order. */
async function pooled<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await work(items[i]);
      }
    }),
  );
  return out;
}

/**
 * Sweep every market in the deployment's roster for this wallet, then read the
 * ones it holds in full (the same reader the single-position page uses, so the
 * health replica here is the verified one and not a second copy of it).
 *
 * Returns a `chainStale` response on failure — never an empty roster, which
 * would render a real position as nothing held.
 */
export async function loadMorphoWalletFromChain(
  walletRaw: string,
  censused: MorphoDeployment,
): Promise<MorphoWalletChainResponse> {
  // The census plus every market the index has seen created since it, so a
  // position in a market newer than the census is found too.
  const deployment = await withIndexedRoster(censused);
  let wallet: string;
  try {
    wallet = getAddress(walletRaw);
  } catch {
    return empty(walletRaw.toLowerCase(), deployment);
  }

  try {
    const client = chainClient(deployment.chainId);
    const blue = deployment.blue as `0x${string}`;
    const markets = deployment.markets;

    const chunks: (typeof markets)[] = [];
    for (let i = 0; i < markets.length; i += CHUNK) chunks.push(markets.slice(i, i + CHUNK));

    const [blockNumber, swept] = await Promise.all([
      client.getBlockNumber().then(Number),
      Promise.all(
        chunks.map(
          (c) =>
            client.multicall({
              contracts: c.map((m) => ({
                address: blue,
                abi: BLUE_ABI,
                functionName: "position",
                args: [m.id as `0x${string}`, wallet as `0x${string}`],
              })),
              allowFailure: true,
              batchSize: 0, // one eth_call per chunk — the boundaries are ours
            }) as Promise<{ status: string; result?: readonly [bigint, bigint, bigint] }[]>,
        ),
      ).then((r) => r.flat()),
    ]);

    // A failed slot is not an empty one. Reading it as "holds nothing" would
    // hide a position; carrying the failure through would mean claiming a
    // complete answer we do not have. So a chunk that failed makes the whole
    // sweep stale rather than quietly short.
    if (swept.some((r) => r.status !== "success")) return empty(wallet.toLowerCase(), deployment);

    const held = markets.filter((_, i) => {
      const p = swept[i].result;
      return p != null && (p[0] > ZERO || p[1] > ZERO || p[2] > ZERO);
    });

    const detailed = await pooled(held.slice(0, MAX_DETAILED), DETAIL_CONCURRENCY, (m) =>
      loadMorphoPositionFromChain(m.id, wallet, deployment),
    );

    // Largest live debt first, then largest collateral — a lender with supply
    // only still sorts sensibly, after every borrower.
    const positions = detailed
      .filter((p) => !p.chainStale)
      .sort((a, b) => b.currentDebt - a.currentDebt || b.collateralValue - a.collateralValue);

    return {
      wallet: wallet.toLowerCase(),
      blockNumber,
      censusBlock: deployment.censusBlock,
      marketsScanned: markets.length,
      positionsFound: held.length,
      positions,
      chainStale: false,
    };
  } catch (error) {
    console.error("Morpho wallet sweep failed:", error);
    return empty(wallet.toLowerCase(), deployment);
  }
}
