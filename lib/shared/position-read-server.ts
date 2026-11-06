// The server render's read of rails-server's index, for a position card's
// stamp (lib/shared/position-read.ts; rails-ops TO-DO-ui-jobs 512).
// ----------------------------------------------------------------------------
// SERVER-ONLY. A position page whose server half reads rails-server's index
// asks here, beside its tail, for the newest block the index holds on the
// page's chain (rails-server `GET /api/head`, Sieve's checkpoint, the same
// source as the recency stamp's "Indexed to block"). Ethereum and Base only:
// on Arbitrum and Sepolia that route answers the chain's latest header, which
// says nothing about the index, so they get no index stamp.
//
// The head is read beside the tail, not inside its answer: rails-server's
// position routes carry no block. The api keeps its head 5 s, so the stamp
// names a block within a few seconds of the one the figures stand at.
//
// Fail-soft: null on any miss, and the card states no block.

import "server-only";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { blockTimestamps } from "@/lib/sources/chain/block-timestamps";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { PositionRead } from "@/lib/shared/position-read";

/** The api answers its head from a 5 s cache: past this it is taken as down. */
const HEAD_TIMEOUT_MS = 1_500;

const INDEXED: ReadonlySet<ChainId> = new Set([MAINNET_CHAIN_ID, BASE_CHAIN_ID]);

/** The newest block rails-server's index holds on `chainId`, as a card's read; null on any miss. */
export async function indexReadAt(chainId: ChainId): Promise<PositionRead | null> {
  const api = process.env.RAILS_API_URL;
  if (!api || !INDEXED.has(chainId)) return null;
  try {
    const readerIp = await readerIpFromHeaders();
    const res = await fetch(
      `${api}/api/head?chain=${chainId}`,
      createAuthFetchOptions({ cache: "no-store", signal: AbortSignal.timeout(HEAD_TIMEOUT_MS) }, readerIp),
    );
    if (!res.ok) {
      void res.body?.cancel().catch(() => undefined);
      return null;
    }
    const d = (await res.json()) as { blockNumber?: unknown; blockTimestamp?: unknown; source?: unknown };
    // "chain-head" is the chain's latest, not the index.
    if (d.source === "chain-head") return null;
    if (typeof d.blockNumber !== "number" || typeof d.blockTimestamp !== "number") return null;
    return { kind: "index", block: d.blockNumber, at: d.blockTimestamp };
  } catch {
    return null;
  }
}

/** A read whose answer named its block but not the block's time, timed by the
 *  block (rails-server's stored block times, else one RPC header read, kept for
 *  the process). Past the timeout it stays untimed and the browser asks. */
export async function timedRead(read: PositionRead | null, chainId: ChainId): Promise<PositionRead | null> {
  if (!read || read.at != null || read.block == null) return read;
  const block = read.block;
  const times = await Promise.race([
    blockTimestamps(chainId, [block]).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), HEAD_TIMEOUT_MS)),
  ]);
  const at = times?.get(block);
  return at != null ? { ...read, at } : read;
}
