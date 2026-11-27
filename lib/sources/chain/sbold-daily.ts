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
// header reads go out for up to DAYS_AT_ONCE missing days at once, batched.
//
// RULE: a failed day read leaves a gap, never a zero; a failed getter leaves
// a gap in its line alone. Days whose last block is at or before the vault's
// first code have no point. Each completed day is cached on its own with no
// expiry (key: vault and UTC day); a failed day is not cached, so the next
// render reads that day alone. Concurrent renders share one fill per UTC day.
// The marked blocks sit on the line only while their time is inside the
// window; they are returned apart for the card.

import { unstable_cache } from "next/cache";
import { parseAbi, type PublicClient } from "viem";
import { chainBatchClient } from "@/lib/sources/chain/rpc";
import { blockTimestamps } from "@/lib/sources/chain/block-timestamps";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { SBOLD_CREATED_BLOCK, SBOLD_VAULT } from "@/lib/liquity-v2/sbold";
import { YIELD_WINDOW_DAYS } from "@/lib/vaults/yield";
import type { SboldVaultResponse } from "./sbold-vault";

const DAY_S = 86_400;
/** Two epochs (64 slots of 12 s): a day ending closer to head than this is not cached. */
const FINAL_S = 64 * 12;
const SLOT_S = 12;
/** Days read at once on a cache miss. Each open day's search sends one
 *  header read per wave, so a cold fill stays near this many requests per
 *  round trip on the state URL. */
const DAYS_AT_ONCE = 6;
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
  /** The line's points: the days, the marked blocks inside the window, the head. */
  points: SboldPoint[];
  /** Blocks 26,441,800 and 26,442,100, wherever their time falls. */
  marked: SboldPoint[];
  /** The calls this render's fill made: block headers and Multicall3 calls. */
  cost: { headers: number; multicalls: number };
}

type Head = { number: number; time: number };
type Call = { status: string; result?: unknown };
const okRaw = (r: Call | undefined): string | null =>
  r?.status === "success" && r.result != null ? String(r.result) : null;

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

type Cost = SboldSeries["cost"];

/** One completed UTC day's point, read on a cache miss. Throws where a read
 *  failed, so nothing is cached; null for a day at or before the first code. */
async function readDay(day: number, head: () => Promise<Head>, cost: Cost): Promise<SboldPoint | null> {
  const client = chainBatchClient(MAINNET_CHAIN_ID);
  const T = (day + 1) * DAY_S;
  const h = await head();
  // A day whose end is within two epochs of head is read again once final.
  if (h.time - T < FINAL_S) throw new Error(`sBOLD: day ${day} is not final at block ${h.number}`);
  const { found, headers } = await firstBlocksAt(client, h, [T]);
  cost.headers += headers;
  const f = found.get(T);
  if (f == null) throw new Error(`sBOLD: no last block found for day ${day}`);
  const block = f.first - 1;
  if (block <= SBOLD_CREATED_BLOCK) return null;
  cost.multicalls += 1;
  const r = await readAt(client, block);
  if (r == null) throw new Error(`sBOLD: the read at block ${block} failed`);
  return { ...r, time: f.lastTime, day };
}

const cachedDay = (day: number, head: () => Promise<Head>, cost: Cost) =>
  unstable_cache(() => readDay(day, head, cost), ["sbold-day-v1", SBOLD_VAULT, String(day)], { revalidate: false })();

/** The window's days, each from its cache or read; a failed day is absent. */
async function fillDays(today: number): Promise<{ points: SboldPoint[]; cost: Cost }> {
  const cost: Cost = { headers: 0, multicalls: 0 };
  let headRead: Promise<Head> | null = null;
  // The head anchors a missing day's search; read once, and only on a miss.
  const head = () =>
    (headRead ??= chainBatchClient(MAINNET_CHAIN_ID)
      .getBlock({ blockTag: "latest" })
      .then((b) => {
        cost.headers += 1;
        return { number: Number(b.number), time: Number(b.timestamp) };
      }));
  const days = Array.from({ length: YIELD_WINDOW_DAYS + 1 }, (_, i) => today - YIELD_WINDOW_DAYS - 1 + i);
  const read: (SboldPoint | null)[] = days.map(() => null);
  let next = 0;
  const worker = async () => {
    while (next < days.length) {
      const i = next++;
      read[i] = await cachedDay(days[i], head, cost).catch((e) => {
        console.error("sBOLD daily read failed:", e);
        return null;
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(DAYS_AT_ONCE, days.length) }, worker));
  return { points: read.filter((p): p is SboldPoint => p != null), cost };
}

/** One fill per UTC day for every concurrent render. */
const filling = new Map<number, Promise<{ points: SboldPoint[]; cost: Cost }>>();

function sharedFill(today: number) {
  for (const k of filling.keys()) if (k < today) filling.delete(k);
  let p = filling.get(today);
  if (!p) {
    p = fillDays(today).finally(() => filling.delete(today));
    filling.set(today, p);
  }
  return p;
}

/** One marked block's point, cached once read; throws where a read failed. */
const cachedMarkedPoint = (block: number) =>
  unstable_cache(
    async (): Promise<SboldPoint> => {
      const [times, r] = await Promise.all([
        blockTimestamps(MAINNET_CHAIN_ID, [block]),
        readAt(chainBatchClient(MAINNET_CHAIN_ID), block),
      ]);
      const time = times.get(block);
      if (r == null || time == null) throw new Error(`sBOLD: the read at marked block ${block} failed`);
      return { ...r, time };
    },
    ["sbold-marked-v2", SBOLD_VAULT, String(block)],
    { revalidate: false },
  )();

/** The marked blocks that answered; a failed one is absent and read again next render. */
const markedPoints = async (): Promise<SboldPoint[]> =>
  (
    await Promise.all(
      SBOLD_MARKED_BLOCKS.map((b) =>
        cachedMarkedPoint(b).catch((e) => {
          console.error("sBOLD marked block read failed:", e);
          return null;
        }),
      ),
    )
  ).filter((p): p is SboldPoint => p != null);

/** The days, the marked blocks inside the window and the page's head read, in
 *  block order, and the marked blocks apart. Null where nothing answered. */
export async function loadSboldSeries(data: SboldVaultResponse): Promise<SboldSeries | null> {
  const head = {
    block: data.blockNumber,
    totalAssets: data.vault.totalAssets?.raw ?? null,
    totalSupply: data.vault.totalSupply?.raw ?? null,
    sharePrice: data.vault.sharePrice?.raw ?? null,
  };
  const today = Math.floor(Date.now() / 1000 / DAY_S);
  const windowStart = (today - YIELD_WINDOW_DAYS - 1) * DAY_S;
  const [days, marked, headTimes] = await Promise.all([
    sharedFill(today),
    markedPoints(),
    blockTimestamps(MAINNET_CHAIN_ID, [head.block]).catch(() => new Map<number, number>()),
  ]);
  const headTime = headTimes.get(head.block);
  const points = [
    ...days.points,
    ...marked.filter((p) => p.time >= windowStart),
    ...(headTime != null ? [{ ...head, time: headTime }] : []),
  ].sort((a, b) => a.block - b.block);
  if (points.length === 0 && marked.length === 0) return null;
  return { points, marked, cost: days.cost };
}
