// The sBOLD vault's latest Paused log (rails-ops ui-jobs 765). SERVER-ONLY.
// ----------------------------------------------------------------------------
// Read only where the head read's paused() answers true: the vault's
// Paused(address) and Unpaused(address) logs from its first-code block to
// head, by lib/sources/chain/log-sweep.ts (which halves a range the endpoint
// refuses). The range splits at a checkpoint, a multiple of CHECKPOINT_BLOCKS
// at least two epochs behind head: the completed range below it is cached
// with no expiry, keyed by (from, to); the tail above it is read each render.
//
// RULE: a sweep with gaps states nothing (null), and nothing is cached; the
// latest log of the two must be a Paused one, else nothing is stated.

import { unstable_cache } from "next/cache";
import { chainLogsClient } from "@/lib/sources/chain/rpc";
import { sweepLogs, type RawLog } from "@/lib/sources/chain/log-sweep";
import { blockTimestamps } from "@/lib/sources/chain/block-timestamps";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { SBOLD_CREATED_BLOCK, SBOLD_VAULT } from "@/lib/liquity-v2/sbold";

/** keccak256("Paused(address)") and keccak256("Unpaused(address)"). */
export const PAUSED_TOPIC = "0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258";
export const UNPAUSED_TOPIC = "0x5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa";

const CHECKPOINT_BLOCKS = 100_000;
const FINAL_BLOCKS = 64;

export interface SboldPausedLog {
  block: number;
  /** The block's timestamp, unix seconds; null where it did not answer. */
  time: number | null;
  txHash: string;
  logIndex: number;
  /** The log's `account` field, lowercased. */
  account: string;
  /** The range the sweep read, inclusive. */
  from: number;
  to: number;
}

type Slim = { block: number; logIndex: number; topic: string; txHash: string; data: string };

const slim = (l: RawLog): Slim => ({
  block: parseInt(l.blockNumber, 16),
  logIndex: parseInt(l.logIndex, 16),
  topic: l.topics[0]?.toLowerCase() ?? "",
  txHash: l.transactionHash.toLowerCase(),
  data: l.data,
});

/** One range's logs; throws where the sweep left a gap, so nothing is cached. */
async function readRange(from: number, to: number): Promise<Slim[]> {
  if (to < from) return [];
  const { logs, gaps } = await sweepLogs(
    chainLogsClient(MAINNET_CHAIN_ID),
    { address: SBOLD_VAULT, topics: [[PAUSED_TOPIC, UNPAUSED_TOPIC]] },
    { from, to },
    { chunkBlocks: 20_000_000 },
  );
  if (gaps.length > 0) throw new Error(`sBOLD: Paused/Unpaused logs unread over ${JSON.stringify(gaps)}`);
  return logs.map(slim);
}

const cachedRange = (from: number, to: number) =>
  unstable_cache(() => readRange(from, to), ["sbold-pause-logs-v1", SBOLD_VAULT, String(from), String(to)], {
    revalidate: false,
  })();

/** The latest Paused log up to `head`; null where the read failed or the
 *  latest of the two events is not a Paused one. */
export async function loadSboldPausedLog(head: number): Promise<SboldPausedLog | null> {
  try {
    const checkpoint = Math.floor((head - FINAL_BLOCKS) / CHECKPOINT_BLOCKS) * CHECKPOINT_BLOCKS;
    const [done, tail] = await Promise.all([
      cachedRange(SBOLD_CREATED_BLOCK, checkpoint),
      readRange(checkpoint + 1, head),
    ]);
    const all = [...done, ...tail].sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
    const last = all[all.length - 1];
    if (last == null || last.topic !== PAUSED_TOPIC) return null;
    const times = await blockTimestamps(MAINNET_CHAIN_ID, [last.block]).catch(() => new Map<number, number>());
    return {
      block: last.block,
      time: times.get(last.block) ?? null,
      txHash: last.txHash,
      logIndex: last.logIndex,
      account: `0x${last.data.slice(-40)}`.toLowerCase(),
      from: SBOLD_CREATED_BLOCK,
      to: head,
    };
  } catch (error) {
    console.error("sBOLD Paused log read failed:", error);
    return null;
  }
}
