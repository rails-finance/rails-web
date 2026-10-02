"use client";

// The position state around one Aave V3 event's transaction (Ethereum, Base), read when
// its card opens (rails-ops TO-DO-ui-jobs §19).
//
// The detail mounts on open and remounts on every reopen, and a card restored
// open reads after mount, so the answers live in module scope: one request per
// (wallet, market, block, tx) for the life of the tab, shared by every card that
// asks while it is in flight. A reopened card renders the kept answer on its
// first paint. A refusal that cannot change (400, 404) is kept too; one that can
// (409 before the reducer reaches the block, a 5xx, a network failure) is asked
// again on the next open.
//
// Lazy-fetch idiom after the Dolomite and LlamaLend details: fetch in an effect,
// drop a late answer after unmount.
//
// A read that never lands must not leave a row "reading" forever (SparkLend
// newcomer round 4: 10 of 31 rows opened in a row stayed on the reading line).
// Each attempt gives up after READ_TIMEOUT_MS; a refusal that can change is
// asked once more after a pause; then the result is "unavailable" with
// `lasting: false`, which the cards state as "not read, reload to try again".
// Opening every row of a 31-row page asks 31 reads, so at most MAX_IN_FLIGHT
// run at once and the rest queue, which keeps the chain reads under the RPC's
// rate limit.

import { useEffect, useState } from "react";
import type { AaveV3PositionState } from "@/lib/aave-v3/position-state";

export type AaveV3PositionStateResult =
  | { status: "loading" }
  | { status: "ready"; data: AaveV3PositionState }
  | { status: "unavailable"; code: string; /** A refusal a reload cannot change (400, 404). */ lasting: boolean };

type Settled = Exclude<AaveV3PositionStateResult, { status: "loading" }>;

const settled = new Map<string, Settled>();
const inFlight = new Map<string, Promise<Settled>>();
const LASTING_REFUSALS = new Set([400, 404]);
const LOADING: AaveV3PositionStateResult = { status: "loading" };

/** The Ethereum markets read the index's answer; Base, Seamless and SparkLend
 *  read the chain at the block (app/api/chain/{aave-v3-base,seamless,spark}/
 *  position-state), same wire shape. "chain:<market>" reads an Ethereum
 *  market from the chain (app/api/chain/aave-v3/position-state), for a row
 *  the index holds no event for (an e-mode change). */
const routeFor = (market: string): string =>
  market === "base"
    ? "/api/chain/aave-v3-base/position-state"
    : market === "seamless"
      ? "/api/chain/seamless/position-state"
      : market === "spark"
        ? "/api/chain/spark/position-state"
        : market.startsWith("chain:")
          ? "/api/chain/aave-v3/position-state"
          : "/api/aave-v3/timeline/position-state";

const READ_TIMEOUT_MS = 25_000;
const RETRY_AFTER_MS = 2_000;
const MAX_IN_FLIGHT = 3;

let running = 0;
const waiting: (() => void)[] = [];

/** Run `job` when fewer than MAX_IN_FLIGHT reads are out. */
async function limited<T>(job: () => Promise<T>): Promise<T> {
  if (running >= MAX_IN_FLIGHT) await new Promise<void>((go) => waiting.push(go));
  running++;
  try {
    return await job();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

async function attempt(qs: string, market: string): Promise<Settled> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), READ_TIMEOUT_MS);
  try {
    const res = await fetch(`${routeFor(market)}?${qs}`, { signal: ac.signal });
    const body = (await res.json().catch(() => null)) as (AaveV3PositionState & { code?: string }) | null;
    if (res.ok && body && Array.isArray(body.reserves)) return { status: "ready", data: body };
    return {
      status: "unavailable",
      code: body?.code ?? String(res.status),
      lasting: LASTING_REFUSALS.has(res.status),
    };
  } catch {
    return { status: "unavailable", code: ac.signal.aborted ? "timeout" : "network", lasting: false };
  } finally {
    clearTimeout(timer);
  }
}

async function read(key: string, qs: string, market: string): Promise<Settled> {
  try {
    let r = await limited(() => attempt(qs, market));
    if (r.status === "unavailable" && !r.lasting) {
      await new Promise((go) => setTimeout(go, RETRY_AFTER_MS));
      r = await limited(() => attempt(qs, market));
    }
    if (r.status === "ready" || r.lasting) settled.set(key, r);
    return r;
  } finally {
    inFlight.delete(key);
  }
}

/** Start the read ahead of the open (the pointer on a card's header): the
 *  answer lands in the module cache, so the card's first paint on open is the
 *  settled state. A no-op when it is kept or already in flight. */
export function prefetchAaveV3PositionState(args: {
  wallet?: string;
  market?: string;
  block?: number;
  txHash?: string;
}): void {
  const { wallet, market, block, txHash } = args;
  if (!wallet || !market || block == null || !txHash) return;
  const key = `${wallet.toLowerCase()}:${market}:${block}:${txHash.toLowerCase()}`;
  if (settled.has(key) || inFlight.has(key)) return;
  const qs = new URLSearchParams({ wallet, market, block: String(block), tx: txHash }).toString();
  inFlight.set(key, read(key, qs, market));
}

/** Null when the card carries no market (a Base or Seamless event sharing its
 *  block with another of the owner's transactions): those keep the replayed
 *  principal line and never ask. */
export function useAaveV3PositionState(args: {
  wallet?: string;
  market?: string;
  block?: number;
  txHash?: string;
}): AaveV3PositionStateResult | null {
  const { wallet, market, block, txHash } = args;
  const enabled = !!wallet && !!market && block != null && !!txHash;
  const key = enabled ? `${wallet.toLowerCase()}:${market}:${block}:${txHash.toLowerCase()}` : "";
  const [result, setResult] = useState<AaveV3PositionStateResult>(() => settled.get(key) ?? LOADING);

  useEffect(() => {
    if (!enabled) return;
    const kept = settled.get(key);
    if (kept) {
      setResult(kept);
      return;
    }
    setResult(LOADING);
    let live = true;
    let pending = inFlight.get(key);
    if (!pending) {
      const qs = new URLSearchParams({ wallet, market, block: String(block), tx: txHash }).toString();
      pending = read(key, qs, market);
      inFlight.set(key, pending);
    }
    pending.then((r) => {
      if (live) setResult(r);
    });
    return () => {
      live = false;
    };
  }, [enabled, key, wallet, market, block, txHash]);

  return enabled ? result : null;
}
