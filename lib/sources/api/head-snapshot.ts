// A market loader's head reads, stored by rails-server and replayed when the
// live read fails (rails-ops decisions/0054 ruling 2, 0056 step 3; ui-jobs 467).
// ----------------------------------------------------------------------------
// `withHeadSnapshot` runs a loader on a recording `headReadsClient` scoped to
// one surface (`compound-v3:ethereum:markets`). When the loader succeeds and
// rails-server answered every read it made at one block, the web asks the
// server to keep those rounds as the surface's snapshot
// (`POST /api/at-block/head/snapshot`), after the response and at most once a
// minute per surface; a refusal (410 when a round expired, 409) or any error
// is logged and ignored.
//
// When the loader throws or its answer is not usable (the server and the web's
// own chain read both failed), the surface's snapshot is asked for
// (`GET /api/at-block/head/snapshot`) and the loader is run again over it: the
// answer is the loader's arithmetic over rails-server's stored reads at the
// snapshot's block, and carries `stored`. With no snapshot (404, the route
// absent, the api down, or a read the snapshot does not hold) the caller gets
// what the loader gave.
//
// SERVER-ONLY.

import { after } from "next/server";
import type { PublicClient } from "viem";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { ChainId } from "@/lib/shared/chains";
import type { StoredHeadRead } from "@/lib/shared/server-head-read";
import { parseHeadSnapshot, recordingHeadClient, snapshotClient, type HeadRecord } from "./head-reads-client";
import { serverHeadStampAt } from "./server-head-stamps";
import { ROUTE_WAIT_MS, routeGate } from "./route-gate";

/** One POST per surface per this long: the stored row is a fallback, a minute old is fine. */
const POST_EVERY_MS = 60_000;
const POST_TIMEOUT_MS = 5_000;

const gate = routeGate();
const lastPost = new Map<string, number>();

export interface HeadSnapshotScope {
  /** `^[a-z0-9-]+(:[a-z0-9-]+)*$`, at most 80 characters. */
  surface: string;
  chainId: ChainId;
}

export interface HeadSnapshotResult<T> {
  value: T;
  /** Set when `value` was computed over rails-server's stored snapshot. */
  stored?: StoredHeadRead;
}

/** The one block every read was served at by rails-server, with its rounds; null otherwise. */
function servedAtOneBlock(chainId: ChainId, record: HeadRecord): { block: number; rounds: string[] } | null {
  if (record.chain || record.unnamed || record.rounds.size === 0 || record.blocks.size !== 1) return null;
  const [block] = record.blocks;
  if (!serverHeadStampAt(chainId, block)) return null;
  return { block, rounds: [...record.rounds] };
}

async function postSnapshot(scope: HeadSnapshotScope, block: number, rounds: string[]): Promise<void> {
  try {
    const res = await fetch(
      `${process.env.RAILS_API_URL}/api/at-block/head/snapshot`,
      createAuthFetchOptions({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain: scope.chainId, surface: scope.surface, block, rounds }),
        signal: AbortSignal.timeout(POST_TIMEOUT_MS),
      }),
    );
    void res.body?.cancel().catch(() => undefined);
    if (!res.ok) console.warn(`head snapshot ${scope.surface} at ${block}: ${res.status}, not stored`);
  } catch (err) {
    console.warn(`head snapshot ${scope.surface} at ${block}: ${(err as Error).message}`);
  }
}

/** Queue the POST past the response; outside a request scope it runs on by itself. */
function schedule(scope: HeadSnapshotScope, block: number, rounds: string[]): void {
  const key = `${scope.chainId}:${scope.surface}`;
  if (Date.now() - (lastPost.get(key) ?? 0) < POST_EVERY_MS) return;
  lastPost.set(key, Date.now());
  const run = () => postSnapshot(scope, block, rounds);
  try {
    after(run);
  } catch {
    void run();
  }
}

async function getSnapshot(scope: HeadSnapshotScope) {
  const qs = new URLSearchParams({ chain: String(scope.chainId), surface: scope.surface });
  const body = await gate.json<unknown>(
    String(scope.chainId),
    `${process.env.RAILS_API_URL}/api/at-block/head/snapshot?${qs.toString()}`,
    createAuthFetchOptions(),
    { timeoutMs: ROUTE_WAIT_MS },
  );
  const snap = parseHeadSnapshot(body);
  return snap && snap.chainId === scope.chainId && snap.surface === scope.surface ? snap : null;
}

/**
 * Run `run` on a recording head client for `scope`. `ok` says whether its
 * answer is usable (false for a loader's empty stub). See the header.
 */
export async function withHeadSnapshot<T>(
  scope: HeadSnapshotScope,
  run: (client: PublicClient) => Promise<T>,
  ok: (value: T) => boolean,
): Promise<HeadSnapshotResult<T>> {
  const { client, record } = recordingHeadClient(scope.chainId);
  let value: T | undefined;
  let error: unknown;
  let threw = false;
  try {
    value = await run(client);
  } catch (err) {
    threw = true;
    error = err;
  }

  if (!threw && ok(value as T)) {
    const served = servedAtOneBlock(scope.chainId, record);
    if (served) schedule(scope, served.block, served.rounds);
    return { value: value as T };
  }

  const snap = process.env.RAILS_API_URL ? await getSnapshot(scope).catch(() => null) : null;
  if (snap) {
    const replay = snapshotClient(snap);
    try {
      const again = await run(replay.client);
      if (!replay.missed() && ok(again)) {
        return {
          value: again,
          stored: {
            blockNumber: snap.blockNumber,
            blockTimestamp: snap.blockTimestamp,
            readAt: snap.readAt,
            provider: snap.provider,
          },
        };
      }
    } catch {
      // The snapshot does not answer this loader: the caller gets the loader's own answer.
    }
  }
  if (threw) throw error;
  return { value: value as T };
}
