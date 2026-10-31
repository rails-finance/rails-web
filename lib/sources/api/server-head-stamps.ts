// Which blocks rails-server's head routes named, and who read them.
// ----------------------------------------------------------------------------
// `vault-head-client.ts` and `head-reads-client.ts` pin a page's reads to the
// block rails-server named (`head` on its answer: the block's time, when it
// read it and the leg). A reader that finishes at that block asks here for the
// stamp its receipts print (`lib/shared/server-head-read.ts`). A block that any
// read left for the chain has no stamp: the receipt keeps "@ head" there.
//
// SERVER-ONLY.

import type { PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";

const KEEP_MS = 5 * 60_000;

const stamps = new Map<string, { head: PositionHeadStamp; chain: boolean; at: number }>();

const keyOf = (chainId: number, block: bigint | number) => `${chainId}:${block}`;

/** The head answer's stamp for the block it named. */
export function noteServerHead(chainId: number, block: bigint | number, head: PositionHeadStamp | undefined): void {
  if (!head || typeof head.readAt !== "string" || typeof head.provider !== "string") return;
  const k = keyOf(chainId, block);
  const prior = stamps.get(k);
  // The same block named again keeps its first stamp and its fallback mark.
  if (!prior) stamps.set(k, { head, chain: false, at: Date.now() });
  for (const [key, v] of stamps) if (Date.now() - v.at > KEEP_MS) stamps.delete(key);
}

/** A read at a block went to the chain, so the block's receipts cannot say rails-server read it. */
export function noteChainRead(chainId: number, block: bigint | number | null | undefined): void {
  if (block == null) return;
  const s = stamps.get(keyOf(chainId, block));
  if (s) s.chain = true;
}

/** The stamp of a block every read of which rails-server answered; undefined otherwise. */
export function serverHeadStampAt(chainId: number, block: bigint | number): PositionHeadStamp | undefined {
  const s = stamps.get(keyOf(chainId, block));
  return s && !s.chain ? s.head : undefined;
}
