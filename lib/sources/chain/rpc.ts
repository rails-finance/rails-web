// Shared JSON-RPC clients for the chain data-source's live-state reads.
// ----------------------------------------------------------------------------
// The chain loader's *history* comes from Etherscan getLogs (wide-range, free
// tier — see liquity-v2.ts). Its *live state* — a trove's current entireDebt /
// entireColl, the redemption buffer ahead of it — comes from on-chain `eth_call`
// at the latest block, which Etherscan's API doesn't serve. That's what the
// public client is for here.
//
// Now one client PER CHAIN, cached separately. Ethereum reads its URL from
// ALCHEMY_URL exactly as before; Base reads BASE_RPC_URL. A chain whose env var
// is unset throws on first use, so a misconfigured deploy fails loudly rather
// than silently pricing from the wrong network — which, unlike a missing price,
// would be invisible and wrong.
//
// SERVER-ONLY. Both env vars are server-side (no NEXT_PUBLIC_ prefix); this
// module is imported only from /api/* route handlers (Node runtime), never from
// a client component — the keys must not reach the browser bundle.

import { createPublicClient, http, type Chain, type PublicClient, type Transport } from "viem";
import { base, mainnet, sepolia } from "viem/chains";
import {
  BASE_CHAIN_ID,
  MAINNET_CHAIN_ID,
  SEPOLIA_CHAIN_ID,
  chainMeta,
  type ChainId,
  type ChainMeta,
} from "@/lib/shared/chains";

const VIEM_CHAINS: Record<ChainId, Chain> = {
  [MAINNET_CHAIN_ID]: mainnet,
  [BASE_CHAIN_ID]: base,
  // viem's definition carries Multicall3 at the canonical address, so
  // `multicall()` works on Sepolia without a contracts override.
  [SEPOLIA_CHAIN_ID]: sepolia,
};

/** The state-read URL for a chain — its own env var, with ONE derived
 *  fallback: Sepolia's endpoint is the same Alchemy key as mainnet's on a
 *  different host, and the Vercel project does not carry `SEPOLIA_RPC_URL`
 *  yet, so an unset var derives the URL from `ALCHEMY_URL` by swapping the
 *  host. Confined to Sepolia on purpose — a Base URL derived from a mainnet
 *  one would read the wrong network's state at the same addresses and look
 *  right. The URL is never logged: it carries the key. */
function stateRpcUrl(meta: ChainMeta): string | undefined {
  const own = process.env[meta.rpcEnv];
  if (own) return own;
  if (meta.id !== SEPOLIA_CHAIN_ID) return undefined;
  const mainnetUrl = process.env.ALCHEMY_URL;
  if (!mainnetUrl || !mainnetUrl.includes("eth-mainnet.g.alchemy.com")) return undefined;
  return mainnetUrl.replace("eth-mainnet.g.alchemy.com", "eth-sepolia.g.alchemy.com");
}

const cache = new Map<ChainId, PublicClient>();

/** Lazily-built public client for `chainId`. Throws if that chain's RPC env
 *  var is unset so a misconfigured deploy fails loudly rather than silently. */
export function chainClient(chainId: ChainId = MAINNET_CHAIN_ID): PublicClient {
  const meta = chainMeta(chainId);
  const url = stateRpcUrl(meta);
  if (!url) throw new Error(`${meta.rpcEnv} not set — ${meta.name} live-state reads need it for eth_call`);
  let client = cache.get(meta.id);
  if (!client) {
    client = createPublicClient({ chain: VIEM_CHAINS[meta.id], transport: http(url) });
    cache.set(meta.id, client);
  }
  return client;
}

/** Ethereum mainnet client over ALCHEMY_URL. Unchanged signature: this is what
 *  the ~50 existing L1 call sites use, and they keep working untouched. */
export function alchemyClient(): PublicClient {
  return chainClient(MAINNET_CHAIN_ID);
}

// ── A refusal on compute units is a wait, not an answer ──────────────────────
//
// Alchemy meters each app on compute units per second and refuses the calls
// over it with code 429 "exceeded its compute units per second capacity". On a
// single request that arrives as HTTP 429, which viem retries on its own —
// three times inside about a second. INSIDE A JSON-RPC BATCH it arrives as a
// per-item error body on an HTTP 200, and viem's retry does not look at code
// 429, so every call in the batch fails at once. Measured on production
// (rails-ops TO-DO-infra §5.8): one heavy vault wave through `ALCHEMY_URL`
// left the key refusing for about seven seconds, and every Ethereum vault read
// in that window — the next page's `balanceOf`, a heavy life's first chunk —
// came back unread.
//
// So the two clients below retry a rate-limit refusal after 1, 2 and 4 s
// (±25 %, so a wave of refused calls does not come back as one wave), about
// seven seconds in all, which is the recovery measured. ONLY A REFUSED CALL IS
// ASKED AGAIN: a call that answered is never repeated, so this spends nothing
// while the lane is under its limit. Any other error passes through untouched.

const RATE_LIMIT_BACKOFF_MS = [1000, 2000, 4000] as const;

/** Is this error the lane refusing on its rate limit, in either of the two
 *  shapes it arrives in: a JSON-RPC error body with code 429 (a batch item), or
 *  an HTTP 429 (a single request, once viem's own short retries are spent). */
export function isRateLimited(error: unknown): boolean {
  let e: unknown = error;
  // viem wraps: a contract read's error carries the RPC error as its `cause`.
  for (let depth = 0; e && typeof e === "object" && depth < 6; depth++) {
    const o = e as { code?: unknown; status?: unknown; message?: unknown; cause?: unknown };
    if (o.code === 429 || o.status === 429) return true;
    if (typeof o.message === "string" && /compute units per second/i.test(o.message)) return true;
    e = o.cause;
  }
  return false;
}

function retryingRateLimits(inner: Transport): Transport {
  return (params) => {
    const transport = inner(params);
    const request = (async (args: Parameters<typeof transport.request>[0], options?: unknown) => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await transport.request(args, options as never);
        } catch (error) {
          if (attempt >= RATE_LIMIT_BACKOFF_MS.length || !isRateLimited(error)) throw error;
          const wait = RATE_LIMIT_BACKOFF_MS[attempt] * (0.75 + Math.random() / 2);
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    }) as typeof transport.request;
    return { ...transport, request };
  };
}

// ── Two more clients, for the two things a plain `eth_call` client is wrong for ──

const batchCache = new Map<ChainId, PublicClient>();

/** Same endpoint as `chainClient`, with JSON-RPC request batching switched on.
 *
 *  For the one shape that needs it: resolving a block TIMESTAMP for each event
 *  a history sweep returned. That is one `eth_getBlockByNumber` per distinct
 *  block, and a busy wallet has hundreds — unbatched they are hundreds of HTTP
 *  round-trips (and, on a metered tier, hundreds of rate-limit slots). Batched
 *  they are a handful: 212 blocks resolve in ~460ms on Base, measured.
 *
 *  Kept as a SEPARATE client rather than switching batching on in
 *  `chainClient`, because ~50 existing L1 call sites read through that one and
 *  none of them asked for their requests to be coalesced. */
export function chainBatchClient(chainId: ChainId = MAINNET_CHAIN_ID): PublicClient {
  const meta = chainMeta(chainId);
  const url = stateRpcUrl(meta);
  if (!url) throw new Error(`${meta.rpcEnv} not set — ${meta.name} live-state reads need it for eth_call`);
  let client = batchCache.get(meta.id);
  if (!client) {
    client = createPublicClient({
      chain: VIEM_CHAINS[meta.id],
      transport: retryingRateLimits(http(url, { batch: { batchSize: 60, wait: 8 } })),
    });
    batchCache.set(meta.id, client);
  }
  return client;
}

const logsCache = new Map<ChainId, PublicClient>();

/** The endpoint that answers WIDE-RANGE `eth_getLogs` for a chain (see
 *  `ChainMeta.logsRpcEnv`).
 *
 *  On Base this is its own Alchemy app (`BASE_BACKFILL_RPC_URL`), so a sweep
 *  spends a separate rate budget from the page's `eth_call` reads. Its limit is
 *  on response size, not range: a wallet-filtered whole-life query answers.
 *
 *  Throws when the var is unset. The callers turn that into a stated reason on
 *  the page rather than an empty timeline, because "no endpoint configured" and
 *  "this wallet has no history" must never render the same. */
export function chainLogsClient(chainId: ChainId = MAINNET_CHAIN_ID): PublicClient {
  return logsClientFor(chainId);
}

// A batching twin of the above was tried, for the block-timestamp and
// transaction reads that hang off a sweep — a history read belongs on the
// history endpoint. It was removed: the free gateway throttles an address hard
// once a sweep has just run through it (150 of 150 blocks refused, over two and
// a half minutes of backoff), where the metered state provider takes pacing.
// Those reads now go to the state client, paced. Written down so the next
// reader does not re-derive it.

function logsClientFor(chainId: ChainId): PublicClient {
  const meta = chainMeta(chainId);
  // Sepolia names the same var for both jobs, so the state fallback covers
  // its logs endpoint too; every other chain reads its logs var verbatim.
  const url = meta.logsRpcEnv === meta.rpcEnv ? stateRpcUrl(meta) : process.env[meta.logsRpcEnv];
  if (!url)
    throw new Error(`${meta.logsRpcEnv} not set — ${meta.name} history sweeps need a wide-range eth_getLogs endpoint`);
  let client = logsCache.get(meta.id);
  if (!client) {
    client = createPublicClient({
      chain: VIEM_CHAINS[meta.id],
      transport: retryingRateLimits(http(url, { timeout: 45_000 })),
    });
    logsCache.set(meta.id, client);
  }
  return client;
}
