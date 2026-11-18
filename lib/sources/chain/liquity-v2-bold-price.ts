// BOLD's price from the Curve BOLD/USDC pool (ui-jobs 746). SERVER-ONLY:
// imported by /api/chain/liquity-v2/bold-price.
//
// One block and one multicall at it: last_price(0), price_oracle(0) and
// get_dy(0, 1, 1e18) (lib/liquity-v2/bold-price.ts says what each is). At head
// the read is cached for 30 s, the block kept with it; a read at a named block
// is cached for the life of the process. A failed read returns null and is not
// cached.

import { getAddress, parseAbi } from "viem";
import { chainClient } from "./rpc";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { BOLD_USDC_POOL, type BoldPriceRead } from "@/lib/liquity-v2/bold-price";

const POOL_ABI = parseAbi([
  "function last_price(uint256) view returns (uint256)",
  "function price_oracle(uint256) view returns (uint256)",
  "function get_dy(int128, int128, uint256) view returns (uint256)",
]);

const HEAD_TTL_MS = 30_000;
const AT_BLOCK_MAX = 256;

let head: { at: number; read: Promise<BoldPriceRead | null> } | null = null;
const atBlock = new Map<number, BoldPriceRead>();

async function readAt(blockNumber?: bigint): Promise<BoldPriceRead | null> {
  try {
    const client = chainClient(MAINNET_CHAIN_ID);
    const block = await client.getBlock(blockNumber == null ? {} : { blockNumber });
    const pool = getAddress(BOLD_USDC_POOL);
    const [last, ema, dy] = await client.multicall({
      allowFailure: true,
      blockNumber: block.number,
      contracts: [
        { address: pool, abi: POOL_ABI, functionName: "last_price", args: [BigInt(0)] },
        { address: pool, abi: POOL_ABI, functionName: "price_oracle", args: [BigInt(0)] },
        {
          address: pool,
          abi: POOL_ABI,
          functionName: "get_dy",
          args: [BigInt(0), BigInt(1), BigInt(10) ** BigInt(18)],
        },
      ] as const,
    });
    if (last.status !== "success" || last.result === BigInt(0)) return null;
    return {
      blockNumber: Number(block.number),
      blockTimestamp: Number(block.timestamp),
      lastPriceRaw: last.result.toString(),
      emaRaw: ema.status === "success" ? ema.result.toString() : null,
      dyRaw: dy.status === "success" ? dy.result.toString() : null,
    };
  } catch (err) {
    console.error("Curve BOLD/USDC read failed:", err);
    return null;
  }
}

/** The pool at head (cached 30 s), or at `blockNumber`. Null where it failed. */
export async function loadBoldPrice(blockNumber?: number): Promise<BoldPriceRead | null> {
  if (blockNumber != null) {
    const kept = atBlock.get(blockNumber);
    if (kept) return kept;
    const read = await readAt(BigInt(blockNumber));
    if (read) {
      if (atBlock.size >= AT_BLOCK_MAX) atBlock.delete(atBlock.keys().next().value as number);
      atBlock.set(blockNumber, read);
    }
    return read;
  }
  const now = Date.now();
  if (head && now - head.at < HEAD_TTL_MS) return head.read;
  const read = readAt();
  head = { at: now, read };
  // A failure is not kept: the next request tries again.
  void read.then((r) => {
    if (r == null && head?.read === read) head = null;
  });
  return read;
}
