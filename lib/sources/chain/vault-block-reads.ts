// The per-block reads a vault holder timeline's rows are made of. SERVER-ONLY.
// ----------------------------------------------------------------------------
// Every row of a holder's life carries two figures read at its own block: the
// block's timestamp and the vault's archive `convertToAssets(10 ** decimals)`.
// The three loaders (aave-ethereum-vault-timeline.ts,
// morpho-base-vault-timeline.ts and yearn-ethereum-vault-timeline.ts) ask them
// here, and this asks rails-server's `/api/at-block/vault/blocks`, which keeps
// each block's answer once it is finalized (server mig 412; rails-ops
// decisions/0056). The share price does not depend on the holder, so every
// holder who moved in a block reads the same stored row.
//
// ONLY ANSWERS ARE KEPT. A block whose read did not answer is absent from its
// map, never a placeholder, so a caller can tell "unread" from any value. The
// row grammar then leaves `timestamp: 0` or `sharePriceAtBlock: null`, and
// neither may reach the store: a stored row is never read again.
//
// A REVERT IS AN ANSWER. `convertToAssets` that reverts at a block reverts
// there on every asking, so the server keeps it and says `reverted`; the block
// goes into `reverted` and counts as read: its row carries `sharePriceReverted`
// and may be stored. A block the server could not read (every leg refused, or
// an empty return) answers nulls: a miss, asked again once and never stored.
//
// ONE RETRY OVER THE MISSES, and only the misses, 300 ms after the first wave.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";

/** The chains the server route reads. */
export type VaultBlockChain = 1 | 8453;

/** The most blocks one server request names (the route's own limit). */
const BLOCKS_PER_REQUEST = 500;
/** Requests in flight at once for one wave. */
const REQUESTS_IN_FLIGHT = 4;

/** The per-block answers a row is built from — a block's timestamp and the
 *  share price at it — keyed by the block's decimal number. Handed to every
 *  attempt at the same blocks, so a second attempt asks only for the blocks the
 *  first could not read. */
export interface BlockReads {
  timestamps: Map<string, number>;
  prices: Map<string, string>;
  /** Blocks whose `convertToAssets` reverted — read, with no price. */
  reverted: Set<string>;
}

export const emptyBlockReads = (): BlockReads => ({ timestamps: new Map(), prices: new Map(), reverted: new Set() });

/** The share-price fields of the row at this block: the price, or null with
 *  `sharePriceReverted` when the read reverted, or a bare null when it did not
 *  answer. */
export const priceFields = (
  known: BlockReads,
  key: string,
): { sharePriceAtBlock: string | null; sharePriceReverted?: true } =>
  known.reverted.has(key)
    ? { sharePriceAtBlock: null, sharePriceReverted: true }
    : { sharePriceAtBlock: known.prices.get(key) ?? null };

interface ServerRead {
  block: number;
  timestamp: number | null;
  sharePrice?: string | null;
  reverted?: true;
}

/** One request's blocks, or nothing where the server did not answer. */
async function askServer(
  chainId: VaultBlockChain,
  blocks: readonly (bigint | number)[],
  vault?: { address: string; decimals: number },
): Promise<ServerRead[]> {
  const base = process.env.RAILS_API_URL;
  if (!base) return [];
  const qs = new URLSearchParams({ chain: String(chainId), blocks: blocks.join(",") });
  if (vault) {
    qs.set("vault", vault.address.toLowerCase());
    qs.set("decimals", String(vault.decimals));
  }
  try {
    const response = await fetch(`${base}/api/at-block/vault/blocks?${qs.toString()}`, createAuthFetchOptions());
    if (!response.ok) return [];
    const body = (await response.json()) as { reads?: ServerRead[] };
    return Array.isArray(body.reads) ? body.reads : [];
  } catch {
    return [];
  }
}

/** Read a timestamp and a share price at each of these blocks that `known` does
 *  not already hold, retry the misses once, and record every answer in `known`.
 *  The price is asked with 10 ** the vault's OWN share decimals. */
export async function readBlockWave(
  chainId: VaultBlockChain,
  vault: `0x${string}`,
  shareDecimals: number,
  blocks: bigint[],
  known: BlockReads,
): Promise<void> {
  const unread = (b: bigint) => {
    const k = b.toString();
    return !known.timestamps.has(k) || !(known.prices.has(k) || known.reverted.has(k));
  };
  const wave = async (want: bigint[]) => {
    const parts: bigint[][] = [];
    for (let i = 0; i < want.length; i += BLOCKS_PER_REQUEST) parts.push(want.slice(i, i + BLOCKS_PER_REQUEST));
    let next = 0;
    const worker = async () => {
      while (next < parts.length) {
        const part = parts[next++];
        for (const r of await askServer(chainId, part, { address: vault, decimals: shareDecimals })) {
          const k = String(r.block);
          if (r.timestamp != null) known.timestamps.set(k, r.timestamp);
          if (r.reverted) known.reverted.add(k);
          else if (r.sharePrice != null) known.prices.set(k, r.sharePrice);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(REQUESTS_IN_FLIGHT, parts.length) }, worker));
  };
  const first = blocks.filter(unread);
  if (first.length === 0) return;
  await wave(first);
  const misses = first.filter(unread);
  if (misses.length === 0) return;
  await new Promise((r) => setTimeout(r, 300));
  await wave(misses);
}

/** The index of the first of these ascending blocks that is missing a
 *  timestamp OR a share price in `known`, or -1 when every one answered both.
 *  A revert counts as a share price answered. A chunked build keeps the blocks
 *  before it: every row under that cut was read whole, so the prefix is a whole
 *  tail up to its own cut. */
export const firstUnreadBlock = (blocks: number[], known: BlockReads): number =>
  blocks.findIndex((block) => {
    const key = String(block);
    return !known.timestamps.has(key) || !(known.prices.has(key) || known.reverted.has(key));
  });

/** Each block's timestamp from the same store, one wave and no retry: a block
 *  that did not answer is absent from the map. */
export async function readBlockTimes(
  chainId: VaultBlockChain,
  blocks: readonly number[],
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const parts: number[][] = [];
  for (let i = 0; i < blocks.length; i += BLOCKS_PER_REQUEST) parts.push(blocks.slice(i, i + BLOCKS_PER_REQUEST));
  const answers = await Promise.all(parts.map((part) => askServer(chainId, part)));
  for (const r of answers.flat()) if (r.timestamp != null) out.set(r.block, r.timestamp);
  return out;
}
