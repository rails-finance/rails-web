// Chain head (block number + timestamp) for the recency stamp — decision 0006's
// freshness signal. A single lightweight read (getBlock latest) over the same
// client the chain-state reads use, module-cached single-flight so reload-spam
// and many open views collapse to one RPC per ~block. This is the "RPC-safe by
// construction" property the decision leans on: request volume is decoupled
// from RPC cost.
//
// Per-CHAIN since basedollar: `?chain=8453` reads Base. The cache is keyed by
// chain and its TTL is that chain's block time — Base produces a block every
// 2s against Ethereum's 12s, so one shared TTL would either stale the L2 stamp
// or spend six times the RPC on L1. An unknown or absent chain reads Ethereum,
// which is what every existing caller wants.
//
// Ethereum and Base read rails-server's GET /api/head (rails-ops ui-jobs 444):
// the newest block the index has captured, from Sieve's checkpoint, with no RPC
// in the path. That block is what every index-served figure is stated at, so
// the stamp says "indexed to" (`source: "index"`), and a stalled capture shows
// as an old stamp. Arbitrum has no Sieve head: the api answers its `latest`
// header, read on its keyless leg and kept 2 s (`source: "rpc"`, a chain head
// rather than an index one). Sepolia reads `latest` over RPC here, and so does
// any chain when the api does not answer.

import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { chainClient } from "@/lib/sources/chain/rpc";
import {
  ARBITRUM_CHAIN_ID,
  BASE_CHAIN_ID,
  CHAINS,
  MAINNET_CHAIN_ID,
  SEPOLIA_CHAIN_ID,
  type ChainId,
} from "@/lib/shared/chains";

export const runtime = "nodejs";

interface ChainHead {
  blockNumber: number;
  blockTimestamp: number;
  /** "index": the newest block the index holds (the api's Sieve head);
   *  "rpc": the chain's `latest`. */
  source: "index" | "rpc";
}

/** The chains whose head the api serves: from Sieve's checkpoint, or (Arbitrum) the chain's latest header. */
const API_HEADS: ReadonlySet<ChainId> = new Set([MAINNET_CHAIN_ID, BASE_CHAIN_ID, ARBITRUM_CHAIN_ID]);
/** The api caches an index head for 5 s and a chain head for 2 s; asking more often re-reads its cache. */
const INDEX_TTL_FLOOR_MS = 5_000;
const API_CHAIN_HEAD_TTL_FLOOR_MS = 2_000;
/** Past this the RPC read answers instead. */
const INDEX_TIMEOUT_MS = 2_500;

/** Roughly one block, per chain — a reload inside the same block re-serves. */
const TTL_MS: Record<ChainId, number> = {
  [MAINNET_CHAIN_ID]: 12_000,
  [BASE_CHAIN_ID]: 2_000,
  // Arbitrum's current rate. It has no fixed cadence, so anything mapping days
  // to blocks on this chain must be timestamp-driven.
  [ARBITRUM_CHAIN_ID]: 250,
  // Sepolia keeps Ethereum's 12-second slot.
  [SEPOLIA_CHAIN_ID]: 12_000,
};

const cache = new Map<ChainId, { at: number; data: ChainHead }>();
const inflight = new Map<ChainId, Promise<ChainHead>>();

async function readRpcHead(chainId: ChainId): Promise<ChainHead> {
  const b = await chainClient(chainId).getBlock({ blockTag: "latest" });
  return { blockNumber: Number(b.number), blockTimestamp: Number(b.timestamp), source: "rpc" };
}

/** The api's head, or null where it was not asked or did not answer. */
async function readApiHead(chainId: ChainId, readerIp: string | undefined): Promise<ChainHead | null> {
  const api = process.env.RAILS_API_URL;
  if (!api || !API_HEADS.has(chainId)) return null;
  try {
    const res = await fetch(
      `${api}/api/head?chain=${chainId}`,
      createAuthFetchOptions({ cache: "no-store", signal: AbortSignal.timeout(INDEX_TIMEOUT_MS) }, readerIp),
    );
    if (!res.ok) {
      void res.body?.cancel().catch(() => undefined);
      return null;
    }
    const d = (await res.json()) as { blockNumber?: unknown; blockTimestamp?: unknown; source?: unknown };
    if (typeof d.blockNumber !== "number" || typeof d.blockTimestamp !== "number") return null;
    return {
      blockNumber: d.blockNumber,
      blockTimestamp: d.blockTimestamp,
      source: d.source === "chain-head" ? "rpc" : "index",
    };
  } catch {
    return null;
  }
}

async function readHead(chainId: ChainId, readerIp: string | undefined): Promise<ChainHead> {
  return (await readApiHead(chainId, readerIp)) ?? readRpcHead(chainId);
}

const ttlOf = (chainId: ChainId, head: ChainHead) =>
  head.source === "index"
    ? Math.max(TTL_MS[chainId], INDEX_TTL_FLOOR_MS)
    : API_HEADS.has(chainId)
      ? Math.max(TTL_MS[chainId], API_CHAIN_HEAD_TTL_FLOOR_MS)
      : TTL_MS[chainId];

function parseChain(raw: string | null): ChainId {
  const n = Number(raw);
  return Number.isFinite(n) && (n as ChainId) in CHAINS ? (n as ChainId) : MAINNET_CHAIN_ID;
}

export async function GET(request: NextRequest) {
  const chainId = parseChain(request.nextUrl.searchParams.get("chain"));
  try {
    const hit = cache.get(chainId);
    if (hit && Date.now() - hit.at < ttlOf(chainId, hit.data)) return NextResponse.json(hit.data);
    // Single-flight per chain: concurrent misses share one upstream read.
    let pending = inflight.get(chainId);
    if (!pending) {
      pending = readHead(chainId, readerIpFromRequest(request)).finally(() => inflight.delete(chainId));
      inflight.set(chainId, pending);
    }
    const data = await pending;
    cache.set(chainId, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch {
    // Fail-soft: the stamp hides itself when the head is unavailable (e.g. no
    // RPC URL in a given env) — freshness is a nicety, never a hard gate.
    return NextResponse.json({ error: "chain head unavailable" }, { status: 503 });
  }
}
