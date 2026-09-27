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
// A REVERT IS AN ANSWER. `convertToAssets` that reverts at a block (JSON-RPC
// code 3, or a node's "execution reverted") reverts there on every asking, so
// the block goes into `reverted`, is not retried, and counts as read: its row
// carries `sharePriceReverted` and may be stored. Anything else that fails — a
// 429, a timeout, an internal error — is a miss, retried and never stored.
//
// ONE RETRY OVER THE MISSES, and only the misses. Measured on a 3,942-row
// Ethereum fixture: a first wave over ~3,900 distinct blocks came back with a
// few hundred refusals on the metered lane, and a second pass over just those
// recovered nearly all of them. The client underneath (`chainBatchClient` in
// ./rpc.ts) has already waited out a rate-limit refusal for about seven seconds
// before a call counts as a miss here.

import { BaseError, decodeFunctionResult, encodeFunctionData, parseAbi, type PublicClient } from "viem";

const PRICE_ABI = parseAbi(["function convertToAssets(uint256) view returns (uint256)"]);

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

/** Is this error the node saying the call REVERTED at that block? JSON-RPC
 *  code 3 is the revert code, with or without revert data; a node that reverts
 *  with no data may answer -32000 "execution reverted" instead. The error must
 *  come from `client.call`, which keeps the node's error in its cause chain.
 *  `readContract` does not: it replaces a code-3 answer AND an internal error
 *  (-32603) with the same `ContractFunctionRevertedError`, and the second is
 *  the lane failing. */
export function isRevert(error: unknown): boolean {
  if (!(error instanceof BaseError)) return false;
  return (
    error.walk((e) => {
      const o = e as { code?: unknown; details?: unknown };
      if (typeof o.code !== "number") return false;
      if (o.code === 3) return true;
      return typeof o.details === "string" && /execution reverted/i.test(o.details);
    }) != null
  );
}

const REVERTED = Symbol("reverted");

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
  const priceCall = encodeFunctionData({ abi: PRICE_ABI, functionName: "convertToAssets", args: [one] });
  // `call` rather than `readContract`, so a revert can be told from a lane
  // that failed (`isRevert`). An empty answer decodes to an error and is a miss.
  const readPrice = (blockNumber: bigint) =>
    client
      .call({ to: vault, data: priceCall, blockNumber })
      .then(({ data }): string | typeof REVERTED =>
        decodeFunctionResult({ abi: PRICE_ABI, functionName: "convertToAssets", data: data ?? "0x" }).toString(),
      )
      .catch((e) => (isRevert(e) ? REVERTED : null));

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

  const unasked = <T>(
    have: (key: string) => boolean,
    read: (b: bigint) => Promise<T | null>,
    keep: (key: string, v: T) => void,
  ) => {
    const want = blocks.filter((b) => !have(b.toString()));
    return Promise.all(want.map(read))
      .then((first) => retryMisses(first, want, read))
      .then((answers) =>
        answers.forEach((v, i) => {
          if (v != null) keep(want[i].toString(), v);
        }),
      );
  };
  await Promise.all([
    unasked(
      (k) => known.timestamps.has(k),
      readTimestamp,
      (k, v) => known.timestamps.set(k, v),
    ),
    unasked(
      (k) => known.prices.has(k) || known.reverted.has(k),
      readPrice,
      (k, v) => (v === REVERTED ? known.reverted.add(k) : known.prices.set(k, v)),
    ),
  ]);
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
