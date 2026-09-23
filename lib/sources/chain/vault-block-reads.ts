// The per-block reads a vault holder timeline's rows are made of. SERVER-ONLY.
// ----------------------------------------------------------------------------
// Every row of a holder's life carries two figures read at its own block: the
// block's timestamp and the vault's archive `convertToAssets(10 ** decimals)`.
// Both loaders — aave-ethereum-vault-timeline.ts and
// morpho-base-vault-timeline.ts — ask them the same way, so the asking lives
// here once.
//
// ONLY ANSWERS ARE KEPT. A block whose read did not answer is absent from its
// map, never a placeholder, so a caller can tell "unread" from any value. The
// row grammar then leaves `timestamp: 0` or `sharePriceAtBlock: null`, and
// neither may reach the store: a stored row is never read again.
//
// ONE RETRY OVER THE MISSES, and only the misses. Measured on a 3,942-row
// Ethereum fixture: a first wave over ~3,900 distinct blocks came back with a
// few hundred refusals on the metered lane, and a second pass over just those
// recovered nearly all of them. The client underneath (`chainBatchClient` in
// ./rpc.ts) has already waited out a rate-limit refusal for about seven seconds
// before a call counts as a miss here.

import { parseAbi, type PublicClient } from "viem";

const PRICE_ABI = parseAbi(["function convertToAssets(uint256) view returns (uint256)"]);

/** The per-block answers a row is built from — a block's timestamp and the
 *  share price at it — keyed by the block's decimal number. Handed to every
 *  attempt at the same blocks, so a second attempt asks only for the blocks the
 *  first could not read. */
export interface BlockReads {
  timestamps: Map<string, number>;
  prices: Map<string, string>;
}

export const emptyBlockReads = (): BlockReads => ({ timestamps: new Map(), prices: new Map() });

/** Read a timestamp and a share price at each of these blocks that `known` does
 *  not already hold, retry the misses once, and record every answer in `known`.
 *  The price is asked with 10 ** the vault's OWN share decimals. */
export async function readBlockWave(
  client: PublicClient,
  vault: `0x${string}`,
  shareDecimals: number,
  blocks: bigint[],
  known: BlockReads,
): Promise<void> {
  const one = BigInt(10) ** BigInt(shareDecimals);
  const readTimestamp = (blockNumber: bigint) =>
    client
      .getBlock({ blockNumber })
      .then((b) => Number(b.timestamp))
      .catch(() => null);
  const readPrice = (blockNumber: bigint) =>
    client
      .readContract({ address: vault, abi: PRICE_ABI, functionName: "convertToAssets", args: [one], blockNumber })
      .then((v) => (v as bigint).toString())
      .catch(() => null);

  const retryMisses = async <T>(
    first: (T | null)[],
    asked: bigint[],
    read: (b: bigint) => Promise<T | null>,
  ): Promise<(T | null)[]> => {
    const misses = first.flatMap((v, i) => (v == null ? [i] : []));
    if (misses.length === 0) return first;
    await new Promise((r) => setTimeout(r, 300));
    const second = await Promise.all(misses.map((i) => read(asked[i])));
    const out = first.slice();
    misses.forEach((i, k) => (out[i] = second[k]));
    return out;
  };

  const unasked = <T>(have: Map<string, T>, read: (b: bigint) => Promise<T | null>) => {
    const want = blocks.filter((b) => !have.has(b.toString()));
    return Promise.all(want.map(read))
      .then((first) => retryMisses(first, want, read))
      .then((answers) =>
        answers.forEach((v, i) => {
          if (v != null) have.set(want[i].toString(), v);
        }),
      );
  };
  await Promise.all([unasked(known.timestamps, readTimestamp), unasked(known.prices, readPrice)]);
}

/** The index of the first of these ascending blocks that is missing a
 *  timestamp OR a share price in `known`, or -1 when every one answered both.
 *  A chunked build keeps the blocks before it: every row under that cut was
 *  read whole, so the prefix is a whole tail up to its own cut. */
export const firstUnreadBlock = (blocks: number[], known: BlockReads): number =>
  blocks.findIndex((block) => !known.timestamps.has(String(block)) || !known.prices.has(String(block)));
