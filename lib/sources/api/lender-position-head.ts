// Compound V3, Compound V2, Moonwell and Morpho Blue head reads, asked of
// rails-server first.
// ----------------------------------------------------------------------------
// rails-server's lender head routes read every call a head reader here makes
// for an account at one block, on a keyless gateway first and the paid leg
// last, keep the market-wide calls 30 s with one read for concurrent callers,
// and update the wallet's listing rows (rails-ops decisions/0056 step 3). The
// reader runs over that answer through `replayClient`
// (lib/sources/chain/replay-client.ts) and states its block.
//
// `withServerHead` returns null when the route cannot answer — no
// RAILS_API_URL, a non-2xx answer, 8 s without one (the wallet page passes a
// shorter wait, so its chain read still fits its budget), or only the stored rows
// (served when no read leg answered; their figures are not the reader's
// shape) — or when the reader asked a call the answer does not hold. The
// caller then reads the chain as before.
//
// SERVER-ONLY.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { replayClient, type ServedCalls } from "@/lib/sources/chain/replay-client";
import type { PublicClient } from "viem";

/** How long a position page waits for the route. */
const TIMEOUT_MS = 8_000;

/** How long to wait, and a signal that ends the wait sooner. */
export interface AskOpts {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export type LenderHeadRequest =
  | { kind: "compound"; family: "compound-v3" | "compound-v2" | "moonwell"; deployment: string; wallet: string }
  | { kind: "morpho-position"; deployment: string; market: string; wallet: string }
  | { kind: "morpho-wallet"; deployment: "base" | "arbitrum"; wallet: string; ids?: string[] };

/** The route's answer, or null where it cannot answer with calls. */
async function ask(req: LenderHeadRequest, opts: AskOpts = {}): Promise<ServedCalls | null> {
  const api = process.env.RAILS_API_URL;
  if (!api) return null;
  try {
    let res: Response;
    const timeout = AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS);
    const signal = opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout;
    if (req.kind === "morpho-wallet") {
      res = await fetch(
        `${api}/api/at-block/morpho/wallet`,
        createAuthFetchOptions({
          method: "POST",
          cache: "no-store",
          signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deployment: req.deployment, wallet: req.wallet.toLowerCase(), ids: req.ids ?? [] }),
        }),
      );
    } else {
      const qs =
        req.kind === "compound"
          ? new URLSearchParams({ family: req.family, deployment: req.deployment, wallet: req.wallet.toLowerCase() })
          : new URLSearchParams({ deployment: req.deployment, market: req.market, wallet: req.wallet.toLowerCase() });
      const path = req.kind === "compound" ? "compound/position" : "morpho/position";
      res = await fetch(
        `${api}/api/at-block/${path}?${qs.toString()}`,
        createAuthFetchOptions({ cache: "no-store", signal }),
      );
    }
    if (!res.ok) return null;
    const body = (await res.json()) as ServedCalls & { stored?: unknown };
    if (!body || typeof body !== "object" || !body.calls || typeof body.blockNumber !== "number") return null;
    return body;
  } catch {
    return null;
  }
}

/** The stamp a receipt names for a read rails-server made. */
export type ServerHeadStamp = ServedCalls["head"] & { block: number };

/**
 * Run `read` over rails-server's answer for `req`. Null where the route
 * cannot answer, the reader's answer is its stale stub, or the reader asked a
 * call the answer does not hold: the caller reads the chain.
 */
export async function withServerHead<T extends { chainStale: boolean }>(
  req: LenderHeadRequest,
  read: (client: PublicClient, served: ServedCalls) => Promise<T>,
  opts: AskOpts = {},
): Promise<{ answer: T; head: ServerHeadStamp } | null> {
  const served = await ask(req, opts);
  if (!served) return null;
  const replay = replayClient(served);
  try {
    const answer = await read(replay.client, served);
    if (replay.missed() || answer.chainStale) return null;
    return { answer, head: { ...served.head, block: served.blockNumber } };
  } catch {
    return null;
  }
}
