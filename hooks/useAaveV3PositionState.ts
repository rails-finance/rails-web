"use client";

// The position state around one Aave V3 Ethereum event's transaction, read when
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

import { useEffect, useState } from "react";
import type { AaveV3PositionState } from "@/lib/aave-v3/position-state";

export type AaveV3PositionStateResult =
  | { status: "loading" }
  | { status: "ready"; data: AaveV3PositionState }
  | { status: "unavailable"; code: string };

type Settled = Exclude<AaveV3PositionStateResult, { status: "loading" }>;

const settled = new Map<string, Settled>();
const inFlight = new Map<string, Promise<Settled>>();
const LASTING_REFUSALS = new Set([400, 404]);
const LOADING: AaveV3PositionStateResult = { status: "loading" };

async function read(key: string, qs: string): Promise<Settled> {
  try {
    const res = await fetch(`/api/aave-v3/timeline/position-state?${qs}`);
    const body = (await res.json().catch(() => null)) as (AaveV3PositionState & { code?: string }) | null;
    if (res.ok && body && Array.isArray(body.reserves)) {
      const ready: Settled = { status: "ready", data: body };
      settled.set(key, ready);
      return ready;
    }
    const refused: Settled = { status: "unavailable", code: body?.code ?? String(res.status) };
    if (LASTING_REFUSALS.has(res.status)) settled.set(key, refused);
    return refused;
  } catch {
    return { status: "unavailable", code: "network" };
  } finally {
    inFlight.delete(key);
  }
}

/** Null when the card carries no market (Base, Seamless): those keep the
 *  replayed principal line and never ask. */
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
      pending = read(key, qs);
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
