// Counting a holder's logs when the lane refused to hand the sweep over. SERVER-ONLY.
// ----------------------------------------------------------------------------
// Shared by the two vault-timeline loaders — morpho-base-vault-timeline.ts and
// aave-ethereum-vault-timeline.ts — because both meet the same refusal and it
// must mean the same thing on both chains. A lane that refuses an
// address-filtered `eth_getLogs` on RESPONSE SIZE has said something about the
// answer: it is large. That is a fact about the life, not a failed read, and
// the page states it as one — "at least N transfers" rather than "could not be
// read".
//
// This file was lifted out of the Base loader unchanged: the three constants
// and the walk are the same code the Base path has run since it was written,
// with the two transfer directions passed in by the caller rather than built
// here. The only thing that moved is where the topics come from, so Base's
// behaviour is the same behaviour.
//
// WHAT THE WALK MAY AND MAY NOT DO. A chunk that itself refuses is HALVED in
// place and retried, never skipped: a skipped chunk would under-count silently,
// and a floor that is too low reads exactly like a floor that is right. Under
// `WALK_MIN_CHUNK` a refusal is not recoverable, so the walk returns null and
// the caller states the history as unread rather than as a number with a hole
// in it. The same for the call budget.
//
// THE COUNT STOPS EARLY. Once the running count passes the horizon the page
// draws, nothing further is learnt: the rows are withheld either way. The walk
// returns then with `exact: false`, and the caller must mark the figure as a
// LOWER BOUND — "at least N" and "N" are different claims.

import { VAULT_TIMELINE_HORIZON } from "@/lib/shared/vault-holder-timeline";
import type { RawLog } from "./vault-holder-logs";

// ── the counting walk, for a sweep the lane refuses on response size ─────────
// Sized from measurement: at 1,000,000 blocks a chunk the busiest address on
// the Base fixture vault answers in 15 calls and 5.1 s, passing the horizon
// well before the end. A chunk that itself refuses is HALVED rather than
// skipped — a skipped chunk would silently under-count, which is the failure
// this whole surface is built to refuse. Under the floor a refusal is not
// recoverable and the count is reported as unread rather than as a number with
// a hole in it.
//
// THE BUDGET COVERS A WHOLE LIFE ON BOTH CHAINS. Base walks from the vault's
// own creation block, so its ranges are a slice of that chain's 35M blocks.
// Chain 1 walks from block 0 and its head was 25,942,721 on 2026-09-09, which
// is ceil(25.95M ÷ 1,000,000) = 26 calls a direction and 52 for both — inside
// `WALK_MAX_CALLS` with 28 calls left over for halving refused chunks. The
// early stop above the horizon means an address large enough to be refused
// spends far fewer than that: the 63,180-transfer holder on waEthUSDC returned
// a floor of 5,970 in 7.1 s on the day it was measured, because a walk stops as
// soon as the count passes the horizon and never counts the rest of the life.
export const WALK_CHUNK = 1_000_000;
export const WALK_MIN_CHUNK = 10_000;
export const WALK_MAX_CALLS = 80;

/** One sweep direction: the topic filter it is asked with, and what it already
 *  answered — null where the lane refused it, which is the direction the walk
 *  has to count for itself. */
export interface SweepDirection {
  topics: (string | null)[];
  answered: RawLog[] | null;
}

/**
 * How many of this address's own logs there are, when at least one direction's
 * whole-range sweep was refused.
 *
 * Returns `exact: false` where the walk stopped early because the count had
 * already passed the horizon — a LOWER BOUND, which is all the decision needs
 * and more than a refusal gives. Returns null where a chunk kept refusing down
 * to the floor or the call budget ran out: a count with a hole in it is worse
 * than no count, because it reads like a census.
 *
 * A direction that already answered is not re-walked; its logs are counted as
 * they came back.
 */
export async function countRefusedSweeps(
  sweepRange: (topics: (string | null)[], from: number, to: bigint | number) => Promise<RawLog[]>,
  directions: SweepDirection[],
  fromBlock: number,
  toBlock: bigint,
): Promise<{ count: number; exact: boolean } | null> {
  let count = 0;
  for (const d of directions) count += d.answered?.length ?? 0;
  let calls = 0;
  let exact = true;

  for (const { topics, answered } of directions) {
    if (answered !== null) continue;
    let cursor = fromBlock;
    const end = Number(toBlock);
    while (cursor <= end) {
      // A stack, so a refused window can be halved in place rather than skipped.
      const pending: [number, number][] = [[cursor, Math.min(end, cursor + WALK_CHUNK - 1)]];
      while (pending.length) {
        const [lo, hi] = pending.pop()!;
        if (calls >= WALK_MAX_CALLS) return null;
        calls++;
        try {
          count += (await sweepRange(topics, lo, hi)).length;
        } catch {
          if (hi - lo + 1 <= WALK_MIN_CHUNK) return null;
          const mid = Math.floor((lo + hi) / 2);
          pending.push([mid + 1, hi], [lo, mid]);
          continue;
        }
        if (count > VAULT_TIMELINE_HORIZON) {
          exact = false;
          return { count, exact };
        }
      }
      cursor += WALK_CHUNK;
    }
  }
  return { count, exact };
}
