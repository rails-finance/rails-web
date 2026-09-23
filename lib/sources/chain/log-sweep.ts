// Whole-life `eth_getLogs`, in chunks, with the holes declared — server-only.
// ----------------------------------------------------------------------------
// Reading one wallet's entire history on an L2 is a range query over tens of
// millions of blocks, and no endpoint answers that in one call. This module is
// the chunking, and — the reason it exists as its own module rather than a loop
// inside one reader — the BOOKKEEPING of what the chunking failed to read.
//
// Two facts about the endpoints make that bookkeeping the whole point:
//
//   • An over-large `eth_getLogs` on the Base gateway does not error. It
//     returns 200 with a TRUNCATED result set. A sweep that trusts a successful
//     response therefore silently drops history, and the page that renders it
//     says "here is the position's life" over a partial one. Every query this
//     module issues is bounded, so no query is ever in that territory.
//   • A chunk can genuinely fail, and it fails in two ways that need OPPOSITE
//     responses. A timeout means the range was too much work, so the fix is to
//     halve it. A rate limit means the endpoint is being asked too often, and
//     halving is precisely the wrong move — it doubles the request count
//     against the thing already saying stop. Measured on Base: a busy address
//     timed out on 6 of 10 chunks, while a quiet one came back with instant
//     "rate limit exceeded" on 5 of 10. Treating those the same turned a
//     recoverable pause into a permanent hole.
//
// So a failed chunk backs off and retries when it was rate-limited, halves when
// it timed out, and if it still will not answer is recorded as a GAP rather
// than dropped. A caller with a non-empty `gaps` has an incomplete history and
// must say so on the page. The alternative — returning the logs that did
// arrive — is the failure mode this module was written to make impossible.
//
// One more shape worth knowing before reading the numbers here. The endpoint
// looks logs up through a per-block bloom filter over (address, topics), so
// what makes a query expensive is not how many logs it RETURNS but how many
// blocks it has to open. A normal 20-byte address is high-entropy and almost
// never a false positive, so a wallet with no history answers in ~300ms across
// the whole chain. A low-entropy topic — the padding of an address like
// 0x…0001 — false-positives against an enormous number of blocks and forces a
// real scan: the same sweep took over three minutes and timed out on every
// chunk. Hence the deadline below: such a query cannot be made fast, and a
// caller waiting forever for it is worse than a caller told what is missing.
//
// SERVER-ONLY: reads through lib/sources/chain/rpc.

import type { PublicClient } from "viem";

/** An inclusive block range. */
export interface BlockRange {
  from: number;
  to: number;
}

/** One raw log, as `eth_getLogs` returns it (hex strings throughout). */
export interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  logIndex: string;
  transactionHash: string;
  transactionIndex: string;
}

export interface LogSweepResult {
  logs: RawLog[];
  /** Ranges no retry could get an answer for. Non-empty ⇒ incomplete history. */
  gaps: BlockRange[];
}

/** One `eth_getLogs` filter, minus the range this module supplies. `topics`
 *  follows the JSON-RPC shape: position N matches topic N, an array at a
 *  position is an OR, and `null` matches anything. */
export interface LogFilter {
  /** Emitting contract(s). Omit to match any — which on Base is measurably
   *  CHEAPER than a multi-address filter (a 15-aToken filter took 16.5s where
   *  the same sweep with no address filter took 5.5s), so a caller that can
   *  narrow by topic should, and filter emitters itself afterwards. */
  address?: string | string[];
  topics: (string | string[] | null)[];
}

// 5,000,000 blocks per chunk, verified on Base: the same wallet's sweep returned
// an identical 52 logs at 5M and at 2M chunks, so 5M is inside the endpoint's
// honest-answer envelope rather than near its truncation edge.
const CHUNK_BLOCKS = 5_000_000;

// A range this small that still will not answer is not a size problem, so
// halving further just multiplies requests against an endpoint already saying no.
const MIN_CHUNK_BLOCKS = 200_000;

// GLOBAL, not per-sweep. A page reads several sweeps at once (Aave V3 runs
// four), so a per-sweep cap of 4 is really 16 in flight against one endpoint —
// which is how the free gateway's rate limit gets tripped. Every sweep in the
// process draws from this one budget instead.
const MAX_CONCURRENCY = 4;

/** Rate-limit backoff, in order. Retries the SAME range each time. */
const BACKOFF_MS = [700, 1_500, 3_000, 6_000];

const RETRY_PAUSE_MS = 500;

/** How long one sweep may spend before it stops trying and reports what is
 *  left as gaps. A pathological filter (see the bloom-filter note above) cannot
 *  be made to finish, and an explorer that hangs on it tells the reader
 *  nothing; one that says "these blocks are missing" tells them everything.
 *
 *  It is a HARD bound, not a check between chunks: a request already in flight
 *  is raced against the remaining time and abandoned, because the case this
 *  exists for is exactly the one where every individual request runs long. */
const DEFAULT_DEADLINE_MS = 30_000;

/** Resolve to `null` if `p` has not settled within `ms`. The underlying request
 *  is left to finish into the void — there is nothing to cancel through viem's
 *  transport, and its result is no longer wanted either way. */
async function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), Math.max(0, ms));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── The shared budget ────────────────────────────────────────────────────────
// A plain counting semaphore. Waiters queue in arrival order, so no sweep can
// starve behind another's retries.
let inFlight = 0;
const waiting: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (inFlight < MAX_CONCURRENCY) {
    inFlight++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  inFlight++;
}

function release(): void {
  inFlight--;
  const next = waiting.shift();
  if (next) next();
}

/** Whether a failure means "you are asking too often" (back off, same range)
 *  rather than "that was too much work" (halve it). */
function isRateLimit(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /rate limit|429|too many requests/i.test(m);
}

const hex = (n: number): string => `0x${n.toString(16)}`;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Sweep `filter` across [from, to] in bounded chunks.
 *
 * Returns every log that could be read plus the ranges that could not. The
 * result is UNSORTED — chunks land out of order — and callers that care about
 * sequence must sort by (blockNumber, logIndex).
 */
export async function sweepLogs(
  client: PublicClient,
  filter: LogFilter,
  range: BlockRange,
  opts: { chunkBlocks?: number; deadlineMs?: number } = {},
): Promise<LogSweepResult> {
  const chunkBlocks = opts.chunkBlocks ?? CHUNK_BLOCKS;
  const deadline = Date.now() + (opts.deadlineMs ?? DEFAULT_DEADLINE_MS);
  // NEWEST FIRST. When the deadline bites it is the chunks not yet started
  // that go unread, so this decides WHICH part of the history is missing — and
  // a missing OLDEST stretch is a horizon ("captured from this date onward"),
  // which is an ordinary and legible thing to tell a reader, where a missing
  // middle is a hole. Sweeping oldest-first would turn every slow wallet's
  // recent activity into the casualty, which is both less useful and harder to
  // state.
  const chunks: BlockRange[] = [];
  for (let b = range.from; b <= range.to; b += chunkBlocks) {
    chunks.push({ from: b, to: Math.min(b + chunkBlocks - 1, range.to) });
  }
  chunks.reverse();

  const logs: RawLog[] = [];
  const gaps: BlockRange[] = [];

  // One chunk, with the escalation described at the top of the file: back off
  // and retry the same range when rate-limited, halve when it timed out, record
  // a gap when neither works or the deadline passes. The halves run in
  // SEQUENCE, not parallel — a range failed because it was too much work, and
  // doubling the concurrent load on it is the wrong response.
  const read = async (r: BlockRange): Promise<void> => {
    let backoff = 0;
    for (;;) {
      if (Date.now() > deadline) {
        gaps.push(r);
        return;
      }
      await acquire();
      let err: unknown;
      let timedOut = false;
      try {
        const res = (await withDeadline(
          client.request({
            method: "eth_getLogs",
            params: [{ ...filter, fromBlock: hex(r.from), toBlock: hex(r.to) }],
          } as never) as Promise<RawLog[]>,
          deadline - Date.now(),
        )) as RawLog[] | null;
        if (res != null) {
          logs.push(...res);
          return;
        }
        // Out of time rather than refused — nothing left to try for this range.
        timedOut = true;
      } catch (e) {
        err = e;
      } finally {
        release();
      }
      if (timedOut) {
        gaps.push(r);
        return;
      }

      if (isRateLimit(err) && backoff < BACKOFF_MS.length) {
        await sleep(BACKOFF_MS[backoff++]);
        continue;
      }
      if (backoff === 0) {
        // First non-rate-limit failure: one cheap retry absorbs a flaky
        // response before paying for a split.
        backoff = 1;
        await sleep(RETRY_PAUSE_MS);
        continue;
      }
      break;
    }

    if (r.to - r.from <= MIN_CHUNK_BLOCKS) {
      gaps.push(r);
      return;
    }
    const mid = r.from + Math.floor((r.to - r.from) / 2);
    await read({ from: r.from, to: mid });
    await read({ from: mid + 1, to: r.to });
  };

  let next = 0;
  // Every worker still queues on the process-wide budget, so this only bounds
  // how many chunks of THIS sweep can be outstanding at once.
  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, chunks.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= chunks.length) return;
      await read(chunks[i]);
    }
  });
  await Promise.all(workers);

  gaps.sort((a, b) => a.from - b.from);
  return { logs, gaps };
}

/** Split merged gaps into the HORIZON (an unread stretch running back from the
 *  sweep's floor — "captured from here onward") and the true HOLES (everything
 *  else, which is missing from the middle of a history that continues either
 *  side of it).
 *
 *  Worth keeping apart because they are different facts and a reader can act on
 *  them differently. A horizon means the sweep ran out of time before reaching
 *  the beginning; the events shown are contiguous and the only thing missing is
 *  older. A hole means something inside the history did not answer, so the
 *  replayed running balances after it are short by whatever it hid. */
export function splitCoverage(gaps: BlockRange[], floor: number): { horizonTo: number | null; holes: BlockRange[] } {
  const merged = mergeGaps(gaps);
  if (merged.length > 0 && merged[0].from <= floor) {
    return { horizonTo: merged[0].to, holes: merged.slice(1) };
  }
  return { horizonTo: null, holes: merged };
}

/** Merge adjacent/overlapping gaps so a page states "one stretch is missing"
 *  rather than the recursion's leaf ranges. */
export function mergeGaps(gaps: BlockRange[]): BlockRange[] {
  if (gaps.length === 0) return [];
  const sorted = [...gaps].sort((a, b) => a.from - b.from);
  const out: BlockRange[] = [{ ...sorted[0] }];
  for (const g of sorted.slice(1)) {
    const last = out[out.length - 1];
    if (g.from <= last.to + 1) last.to = Math.max(last.to, g.to);
    else out.push({ ...g });
  }
  return out;
}

/** The 32-byte topic encoding of an address (left-padded, lowercased) — what a
 *  filter position must carry to match an `address indexed` param. */
export function addressTopic(address: string): string {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}
