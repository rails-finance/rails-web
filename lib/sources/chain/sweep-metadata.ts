// Per-event metadata behind a history sweep, at a rate the endpoints serve.
// ----------------------------------------------------------------------------
// A rendered event needs its block's timestamp and its transaction's sender;
// a rendered liquidation may also need an oracle read pinned to its block.
// Each is one cheap call, and each is cheap only until there are hundreds of
// them at once. Measured on Base, in the order the limits were found:
//   • 2,000 blocks in one Promise.all blew the metered tier's compute-units-
//     per-second cap outright, and took the POSITION read down with it for the
//     next minute — a slow timeline became a page with no live figures.
//   • The same burst against the logs gateway drew 429s: 220 of 500 blocks
//     unresolved, then 179 of 300 even with five rounds of backoff.
// So these are paced rather than merely batched: small groups, ONE group at a
// time, a pause between them, and a long backoff ladder on refusal.
//
// Lifted out of lib/sources/chain/aave-v3-events, where the limits were found,
// so that every swept reader on Base (Aave V3, Seamless, Compound V3, Moonwell,
// Morpho Blue) paces its metadata reads from this ONE copy of the constants —
// they are a fact about the endpoints, not about any protocol. The Moonwell
// reader also paces its receipt expansion through inPacedGroups.
//
// SERVER-ONLY.

import type { PublicClient } from "viem";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readBlockTimes } from "./vault-block-reads";

const META_GROUP = 20; // sub-calls per coalesced JSON-RPC request
const META_CONCURRENCY = 1;
const META_PACE_MS = 250; // between groups, to stay under a per-second cap
const META_BACKOFF_MS = [400, 1_000, 2_500, 5_000, 8_000];

/** Run `fn` over every item in coalescable groups, retrying a refused group
 *  rather than the whole set. Returns the items it could not resolve. */
export async function inPacedGroups<T>(items: T[], fn: (item: T) => Promise<void>): Promise<T[]> {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += META_GROUP) groups.push(items.slice(i, i + META_GROUP));
  const unresolved: T[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(META_CONCURRENCY, groups.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= groups.length) return;
        if (i > 0) await new Promise((r) => setTimeout(r, META_PACE_MS));
        const group = groups[i];
        let remaining = group;
        for (let attempt = 0; remaining.length > 0 && attempt <= META_BACKOFF_MS.length; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, META_BACKOFF_MS[attempt - 1]));
          const failed: T[] = [];
          await Promise.all(
            remaining.map(async (item) => {
              try {
                await fn(item);
              } catch {
                failed.push(item);
              }
            }),
          );
          remaining = failed;
        }
        unresolved.push(...remaining);
      }
    }),
  );
  return unresolved;
}

/** Block timestamps for the rendered events' own blocks.
 *
 *  A block that will not resolve is simply ABSENT from the result, and the
 *  caller drops that event from the rendered list rather than dating it.
 *
 *  This went through both wrong answers before landing here. Filling a failed
 *  read with zero renders as 1 January 1970 and a fifty-six-year tenure — it
 *  looks like data rather than like a failure. Throwing instead took the whole
 *  page down over a handful of blocked requests, which on a free endpoint
 *  under load is most of the time. Dropping the event and SAYING SO keeps
 *  every rendered figure true, keeps the replay and the lifetime totals
 *  complete (they never needed a timestamp), and tells the reader exactly what
 *  is not on screen. */
export async function resolveBlockTimestamps(client: PublicClient, blocks: number[]): Promise<Map<number, number>> {
  // rails-server's stored block times first (Ethereum and Base), the chain for
  // the blocks it did not answer.
  const chainId = client.chain?.id;
  const out =
    chainId === 1 || chainId === 8453
      ? await readBlockTimes(chainId, blocks).catch(() => new Map<number, number>())
      : new Map<number, number>();
  await inPacedGroups(
    blocks.filter((b) => !out.has(b)),
    async (b) => {
      out.set(b, Number((await client.getBlock({ blockNumber: BigInt(b) })).timestamp));
    },
  );
  return out;
}

/** The senders rails-server holds or reads on its own endpoint: `tx_entry`'s,
 *  then one batched read for the rest (`/api/reference/tx-senders`). A hash it
 *  does not answer is absent. */
async function storedTxSenders(chainId: number, hashes: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const api = process.env.RAILS_API_URL;
  if (!api || (chainId !== 1 && chainId !== 8453 && chainId !== 42161)) return out;
  const MAX = 1000;
  for (let i = 0; i < hashes.length; i += MAX) {
    try {
      const res = await fetch(
        `${api}/api/reference/tx-senders`,
        createAuthFetchOptions({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chain: chainId, hashes: hashes.slice(i, i + MAX) }),
          signal: AbortSignal.timeout(15_000),
        }),
      );
      if (!res.ok) {
        void res.body?.cancel().catch(() => undefined);
        continue;
      }
      const body = (await res.json()) as { senders?: Record<string, string> };
      for (const [h, f] of Object.entries(body.senders ?? {}))
        if (/^0x[0-9a-f]{40}$/.test(f)) out.set(h.toLowerCase(), f);
    } catch {
      // The chain path below reads these.
    }
  }
  return out;
}

/** Transaction senders, for the card's third-party verdict (owner ≠ signer AND
 *  owner ≠ the protocol's own caller param). This degrades safely: an unread
 *  transaction leaves the pair incomplete and the card simply does not mark
 *  the event, rather than marking it wrongly. Never throws. */
export async function resolveTxSenders(client: PublicClient, hashes: string[]): Promise<Map<string, string>> {
  const stored = client.chain ? await storedTxSenders(client.chain.id, hashes) : new Map<string, string>();
  const out = new Map<string, string>();
  for (const h of hashes) {
    const f = stored.get(h.toLowerCase());
    if (f) out.set(h, f);
  }
  await inPacedGroups(
    hashes.filter((h) => !out.has(h)),
    async (h) => {
      out.set(h, (await client.getTransaction({ hash: h as `0x${string}` })).from.toLowerCase());
    },
  );
  return out;
}
