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

import { NextRequest, NextResponse } from "next/server";
import { chainClient } from "@/lib/sources/chain/rpc";
import { BASE_CHAIN_ID, CHAINS, MAINNET_CHAIN_ID, SEPOLIA_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

export const runtime = "nodejs";

interface ChainHead {
  blockNumber: number;
  blockTimestamp: number;
}

/** Roughly one block, per chain — a reload inside the same block re-serves. */
const TTL_MS: Record<ChainId, number> = {
  [MAINNET_CHAIN_ID]: 12_000,
  [BASE_CHAIN_ID]: 2_000,
  // Sepolia keeps Ethereum's 12-second slot.
  [SEPOLIA_CHAIN_ID]: 12_000,
};

const cache = new Map<ChainId, { at: number; data: ChainHead }>();
const inflight = new Map<ChainId, Promise<ChainHead>>();

async function readHead(chainId: ChainId): Promise<ChainHead> {
  const b = await chainClient(chainId).getBlock({ blockTag: "latest" });
  return { blockNumber: Number(b.number), blockTimestamp: Number(b.timestamp) };
}

function parseChain(raw: string | null): ChainId {
  const n = Number(raw);
  return Number.isFinite(n) && (n as ChainId) in CHAINS ? (n as ChainId) : MAINNET_CHAIN_ID;
}

export async function GET(request: NextRequest) {
  const chainId = parseChain(request.nextUrl.searchParams.get("chain"));
  try {
    const hit = cache.get(chainId);
    if (hit && Date.now() - hit.at < TTL_MS[chainId]) return NextResponse.json(hit.data);
    // Single-flight per chain: concurrent misses share one upstream read.
    let pending = inflight.get(chainId);
    if (!pending) {
      pending = readHead(chainId).finally(() => inflight.delete(chainId));
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
