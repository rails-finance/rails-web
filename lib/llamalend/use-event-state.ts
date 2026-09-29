"use client";

// Client read for one LlamaLend event's before/after state
// (/api/chain/llamalend/event-state): the position at block − 1 and at the
// event's block. A mined block never changes, so each answer is kept for the
// page's life in this module and shared by the card's grid and its
// explanation; the read starts when the card is opened.

import { useEffect, useState } from "react";
import type { LlamalendEventState } from "@/lib/sources/chain/llamalend-event-state";
import type { LlamalendContext } from "@/lib/shared/types/event-shape";

export type { LlamalendEventState };

const cache = new Map<string, Promise<LlamalendEventState | null>>();

const isState = (d: unknown): d is LlamalendEventState =>
  d != null && typeof d === "object" && "before" in d && "after" in d;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchState(url: string): Promise<LlamalendEventState | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const d = await r.json();
        if (isState(d)) return d;
      }
    } catch {
      // Network failure: try again.
    }
    if (attempt < 2) await wait(1500 * (attempt + 1));
  }
  return null;
}

function load(url: string): Promise<LlamalendEventState | null> {
  let p = cache.get(url);
  if (!p) {
    p = fetchState(url);
    p.then((v) => {
      if (v == null) cache.delete(url);
    });
    cache.set(url, p);
  }
  return p;
}

/** The read's URL, or null where it states nothing about this page's
 *  position (a liquidator-side row narrates someone else's). */
export function llamalendEventStateUrl(ctx: LlamalendContext, blockNumber?: number, wallet?: string): string | null {
  if (blockNumber == null || !wallet || ctx.role === "liquidator") return null;
  const q = new URLSearchParams({
    controller: ctx.controller.toLowerCase(),
    user: wallet.toLowerCase(),
    block: String(blockNumber),
  });
  // A third party's liquidation also reads the start of its block: health
  // there is what let it run.
  if (ctx.eventType === "liquidation" && !ctx.selfLiquidation && ctx.role !== "self") q.set("start", "1");
  return `/api/chain/llamalend/event-state?${q.toString()}`;
}

/** The before/after read for one event; null while loading or after a miss,
 *  and the card then draws what the event states. */
export function useLlamalendEventState(
  ctx: LlamalendContext,
  blockNumber?: number,
  wallet?: string,
): LlamalendEventState | null {
  const url = llamalendEventStateUrl(ctx, blockNumber, wallet);
  const [state, setState] = useState<{ url: string; value: LlamalendEventState | null } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    load(url).then((d) => {
      if (live) setState({ url, value: d });
    });
    return () => {
      live = false;
    };
  }, [url]);
  if (!url || state?.url !== url) return null;
  return state.value;
}
