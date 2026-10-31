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
// RAILS_API_URL, a refused connection, a non-2xx answer, 3 s without one (the
// wallet page passes its own wait, so its chain read still fits its budget;
// after a failure the chain is read for 30 s without asking, route-gate.ts), or only the stored rows
// (served when no read leg answered; their figures are not the reader's
// shape) — or when the reader asked a call the answer does not hold. The
// caller then reads the chain as before.
//
// SERVER-ONLY.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { routeGate, type AskOpts } from "./route-gate";
import { replayClient, type ServedCalls } from "@/lib/sources/chain/replay-client";
import type { PublicClient } from "viem";

const gate = routeGate();

export type LenderHeadRequest =
  | { kind: "compound"; family: "compound-v3" | "compound-v2" | "moonwell"; deployment: string; wallet: string }
  | { kind: "morpho-position"; deployment: string; market: string; wallet: string }
  | { kind: "morpho-wallet"; deployment: "base" | "arbitrum"; wallet: string; ids?: string[] };

/** The route's answer, or null where it cannot answer with calls. */
async function ask(req: LenderHeadRequest, opts: AskOpts = {}): Promise<ServedCalls | null> {
  const api = process.env.RAILS_API_URL;
  let body: (ServedCalls & { stored?: unknown }) | null;
  if (req.kind === "morpho-wallet") {
    body = await gate.json(
      "lender",
      `${api}/api/at-block/morpho/wallet`,
      createAuthFetchOptions({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deployment: req.deployment, wallet: req.wallet.toLowerCase(), ids: req.ids ?? [] }),
      }),
      opts,
    );
  } else {
    const qs =
      req.kind === "compound"
        ? new URLSearchParams({ family: req.family, deployment: req.deployment, wallet: req.wallet.toLowerCase() })
        : new URLSearchParams({ deployment: req.deployment, market: req.market, wallet: req.wallet.toLowerCase() });
    const path = req.kind === "compound" ? "compound/position" : "morpho/position";
    body = await gate.json("lender", `${api}/api/at-block/${path}?${qs.toString()}`, createAuthFetchOptions(), opts);
  }
  if (!body || typeof body !== "object" || !body.calls || typeof body.blockNumber !== "number") return null;
  return body;
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
