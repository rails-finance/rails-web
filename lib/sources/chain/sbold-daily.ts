// The sBOLD vault's daily lines (rails-ops ui-jobs 749). SERVER-ONLY.
// ----------------------------------------------------------------------------
// For each of the last 31 completed UTC days (the strip's 30-day window,
// lib/vaults/yield.ts), the day's last block, and at it one Multicall3 call:
// totalAssets(), totalSupply(), convertToAssets(10 ** 18). Beside the days,
// the same three getters at blocks 26,441,800 and 26,442,100, and the page's
// head read, each placed at its block time.
//
// A day's last block is the block before the first block whose timestamp is
// at or past the next midnight UTC. It is found by search on block headers:
// from a block with timestamp t < T, the block (T − t) / 12 later is at or
// past T, since Ethereum's blocks are at least 12 seconds apart; from one at
// or past T, the block (t − T) / 12 earlier bounds it from below. Waves of
// header reads go out for every day at once, batched.
//
// RULE: a failed day read leaves a gap, never a zero; a failed getter leaves
// a gap in its line alone. Days whose last block is at or before the vault's
// first code have no point. The series is cached for the UTC day; a series
// with a gap is not cached, so the next render asks again.

import { unstable_cache } from "next/cache";
import { parseAbi, type PublicClient } from "viem";
import { chainBatchClient } from "@/lib/sources/chain/rpc";
import { blockTimestamps } from "@/lib/sources/chain/block-timestamps";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { SBOLD_CREATED_BLOCK, SBOLD_VAULT } from "@/lib/liquity-v2/sbold";
import { YIELD_WINDOW_DAYS } from "@/lib/vaults/yield";
import type { SboldVaultResponse } from "./sbold-vault";

const DAY_S = 86_400;
const SLOT_S = 12;
/** Blocks read with the same three getters beside the days. */
const SBOLD_MARKED_BLOCKS = [26_441_800, 26_442_100] as const;

const ABI = parseAbi([
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
]);

/** One read of the three getters at one block; a getter that failed is null. */
export interface SboldPoint {
  block: number;
  /** The block's timestamp, unix seconds. */
  time: number;
  /** The UTC day whose last block this is; absent on a marked block or the head. */
  day?: number;
  totalAssets: string | null;
  totalSupply: string | null;
  sharePrice: string | null;
}

export interface SboldSeries {
  points: SboldPoint[];
  /** The RPC calls the days' read made: header reads and Multicall3 calls. */
  cost: { headers: number; multicalls: number };
}

type Head = { number: number; time: number };
type Call = { status: string; result?: unknown };
const okRaw = (r: Call | undefined): string | null =>
  r?.status === "success" && r.result != null ? String(r.result) : null;

class GapError extends Error {
  constructor(readonly series: SboldSeries) {
    super("sBOLD daily series has a gap");
  }
}

async function readAt(client: PublicClient, block: number): Promise<Omit<SboldPoint, "time" | "day"> | null> {
  const vault = SBOLD_VAULT as `0x${string}`;
  try {
    const r = (await client.multicall({
      contracts: [
        { address: vault, abi: ABI, functionName: "totalAssets" },
        { address: vault, abi: ABI, functionName: "totalSupply" },
        { address: vault, abi: ABI, functionName: "convertToAssets", args: [BigInt(10) ** BigInt(18)] },
      ],
      allowFailure: true,
      blockNumber: BigInt(block),
    })) as Call[];
    return { block, totalAssets: okRaw(r[0]), totalSupply: okRaw(r[1]), sharePrice: okRaw(r[2]) };
  } catch {
    return null;
  }
}

/** The first block at or past each target time, by waves of batched header reads. */
async function firstBlocksAt(
  client: PublicClient,
  head: Head,
  targets: number[],
): Promise<{ found: Map<number, { first: number; lastTime: number }>; headers: number }> {
  const times = new Map<number, number>([[head.number, head.time]]);
  let headers = 0;
  const timeOf = async (blocks: number[]) => {
    const want = [...new Set(blocks)].filter((b) => !times.has(b));
    headers += want.length;
    const got = await Promise.all(
      want.map((b) =>
        client
          .getBlock({ blockNumber: BigInt(b) })
          .then((x) => Number(x.timestamp))
          .catch(() => null),
      ),
    );
    want.forEach((b, i) => {
      if (got[i] != null) times.set(b, got[i]!);
    });
  };
  // lo: a block before T; hi: a block at or past T. The answer is in (lo, hi].
  type Search = { T: number; lo: number | null; hi: number; done: boolean };
  const searches: Search[] = targets.map((T) => ({ T, lo: null, hi: head.number, done: false }));
  // The first guess from the head: at or before T, since blocks are at least 12 s apart.
  await timeOf(searches.map((s) => head.number - Math.ceil((head.time - s.T) / SLOT_S)));
  for (const s of searches) {
    const g = head.number - Math.ceil((head.time - s.T) / SLOT_S);
    const t = times.get(g);
    if (t == null) s.done = true;
    else if (t >= s.T) s.hi = g;
    else s.lo = g;
  }
  for (let wave = 0; wave < 24; wave++) {
    const open = searches.filter((s) => !s.done && (s.lo == null || s.hi - s.lo > 1));
    if (open.length === 0) break;
    const guesses = open.map((s) => {
      if (s.lo == null) {
        // Only hi known: the block (t − T) / 12 earlier is at or before T.
        const g = s.hi - Math.max(1, Math.ceil((times.get(s.hi)! - s.T) / SLOT_S));
        return g;
      }
      const up = Math.min(s.hi, s.lo + Math.ceil((s.T - times.get(s.lo)!) / SLOT_S));
      const down = s.hi - Math.floor((times.get(s.hi)! - s.T) / SLOT_S);
      // The bounds' own guesses where they narrow the range; else halve it.
      if (up < s.hi && up > s.lo) return up;
      if (down > s.lo + 1 && down < s.hi) return down - 1;
      return Math.floor((s.lo + s.hi) / 2);
    });
    await timeOf(guesses);
    open.forEach((s, i) => {
      const t = times.get(guesses[i]);
      if (t == null) s.done = true;
      else if (t >= s.T) s.hi = guesses[i];
      else s.lo = guesses[i];
    });
  }
  const found = new Map<number, { first: number; lastTime: number }>();
  for (const s of searches)
    if (!s.done && s.lo != null && s.hi - s.lo === 1) found.set(s.T, { first: s.hi, lastTime: times.get(s.lo)! });
  return { found, headers };
}

async function readDays(today: number): Promise<SboldSeries> {
  const client = chainBatchClient(MAINNET_CHAIN_ID);
  const latest = await client.getBlock({ blockTag: "latest" });
  const head: Head = { number: Number(latest.number), time: Number(latest.timestamp) };
  const days = Array.from({ length: YIELD_WINDOW_DAYS + 1 }, (_, i) => today - YIELD_WINDOW_DAYS - 1 + i);
  const { found, headers } = await firstBlocksAt(
    client,
    head,
    days.map((d) => (d + 1) * DAY_S),
  );
  // The day's last block is the one before the first block of the next day;
  // the search read its header, so its time is known.
  const lasts = days.flatMap((day) => {
    const f = found.get((day + 1) * DAY_S);
    return f && f.first - 1 > SBOLD_CREATED_BLOCK ? [{ day, block: f.first - 1, time: f.lastTime }] : [];
  });
  const reads = await Promise.all(lasts.map((x) => readAt(client, x.block)));
  const points: SboldPoint[] = [];
  lasts.forEach((x, i) => {
    const r = reads[i];
    if (r) points.push({ ...r, time: x.time, day: x.day });
  });
  const series = { points, cost: { headers: headers + 1, multicalls: lasts.length } };
  // Every day after the vault's first code read: cache it. Else read again next render.
  const expected = days.filter((d) => {
    const f = found.get((d + 1) * DAY_S);
    return f == null || f.first - 1 > SBOLD_CREATED_BLOCK;
  }).length;
  if (points.length < expected) throw new GapError(series);
  return series;
}

const cachedDays = (today: number) =>
  unstable_cache(() => readDays(today), ["sbold-daily-v1", String(today)], { revalidate: DAY_S })();

const cachedMarked = unstable_cache(
  async (): Promise<SboldPoint[]> => {
    const client = chainBatchClient(MAINNET_CHAIN_ID);
    const [times, reads] = await Promise.all([
      blockTimestamps(MAINNET_CHAIN_ID, [...SBOLD_MARKED_BLOCKS]),
      Promise.all(SBOLD_MARKED_BLOCKS.map((b) => readAt(client, b))),
    ]);
    const points: SboldPoint[] = [];
    reads.forEach((r, i) => {
      const time = times.get(SBOLD_MARKED_BLOCKS[i]);
      if (r && time != null) points.push({ ...r, time });
    });
    if (points.length < SBOLD_MARKED_BLOCKS.length) throw new GapError({ points, cost: { headers: 0, multicalls: 0 } });
    return points;
  },
  ["sbold-marked-v1"],
  { revalidate: false },
);

/** The days, the marked blocks and the page's head read, in block order. Null
 *  where nothing answered. */
export async function loadSboldSeries(data: SboldVaultResponse): Promise<SboldSeries | null> {
  const head = {
    block: data.blockNumber,
    totalAssets: data.vault.totalAssets?.raw ?? null,
    totalSupply: data.vault.totalSupply?.raw ?? null,
    sharePrice: data.vault.sharePrice?.raw ?? null,
  };
  const today = Math.floor(Date.now() / 1000 / DAY_S);
  const gapOk = <T>(p: Promise<T>, of: (s: SboldSeries) => T): Promise<T | null> =>
    p.catch((e) => {
      if (e instanceof GapError) return of(e.series);
      console.error("sBOLD daily series read failed:", e);
      return null;
    });
  const [days, marked, headTimes] = await Promise.all([
    gapOk(cachedDays(today), (s) => s),
    gapOk(cachedMarked(), (s) => s.points),
    blockTimestamps(MAINNET_CHAIN_ID, [head.block]).catch(() => new Map<number, number>()),
  ]);
  const headTime = headTimes.get(head.block);
  const points = [
    ...(days?.points ?? []),
    ...(marked ?? []),
    ...(headTime != null ? [{ ...head, time: headTime }] : []),
  ].sort((a, b) => a.block - b.block);
  if (points.length === 0) return null;
  return { points, cost: days?.cost ?? { headers: 0, multicalls: 0 } };
}
