"use client";

// Client read for f(x) rows' before/after state (/api/chain/fx/event-state):
// the position at block − 1 and at the row's block. A mined block never
// changes, so each answer is kept for the page's life in this module and
// shared by a card's grid and its explanation; a row's read starts when the
// card is opened. The position card asks once for every rebalance block, to
// split its unexplained debt change into what rebalances cleared and the rest.

import { useEffect, useState } from "react";
import type { FxEventState, FxStateAt } from "@/lib/sources/chain/fx-event-state";
import type { FxContext } from "@/lib/shared/types/event-shape";
import type { FxPoolTerms } from "@/lib/sources/chain/fx-terms";

export type { FxEventState, FxStateAt };

const cache = new Map<string, Promise<FxEventState | null>>();

const isState = (d: unknown): d is FxEventState => d != null && typeof d === "object" && "reads" in d;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchState(url: string): Promise<FxEventState | null> {
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

function load(url: string): Promise<FxEventState | null> {
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

function useStateAt(url: string | null): FxEventState | null {
  const [state, setState] = useState<{ url: string; value: FxEventState | null } | null>(null);
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

/** The read's URL for one row, or null where the row states nothing about the
 *  position's amounts (an ownership handover). Operates also ask for the fee
 *  the transaction's caller paid. */
export function fxEventStateUrl(ctx: FxContext, blockNumber?: number, txHash?: string): string | null {
  if (blockNumber == null || ctx.eventType === "transfer") return null;
  const q = new URLSearchParams({ pool: ctx.pool, id: ctx.positionId, blocks: String(blockNumber) });
  if (ctx.eventType === "operate" && txHash && /^0x[0-9a-fA-F]{64}$/.test(txHash)) q.set("tx", txHash.toLowerCase());
  // Rebalance and liquidation rows state which price the pool judged them at.
  if (ctx.eventType === "tickRebalance" || ctx.eventType === "liquidation") q.set("prices", "1");
  return `/api/chain/fx/event-state?${q.toString()}`;
}

/** One row's before/after read; null while loading or after a miss, and the
 *  card then draws what the event states. */
export function useFxEventState(ctx: FxContext, blockNumber?: number, txHash?: string): FxEventState | null {
  return useStateAt(fxEventStateUrl(ctx, blockNumber, txHash));
}

/** The position at every block of its socialized rows (rebalances, pool-wide
 *  liquidations), in requests of 60 blocks, merged: the card's split, the
 *  rows' own change in their headers, and the runs' totals. Null until every
 *  request has answered; a request that fails leaves its blocks out. At most
 *  `maxBlocks` distinct blocks are asked for. */
export function useFxPositionReads(
  pool: string,
  id: string,
  blocks: number[],
  maxBlocks = 240,
): Record<string, FxStateAt> | null {
  const key = [...new Set(blocks)]
    .sort((a, b) => a - b)
    .slice(0, maxBlocks)
    .join(",");
  const [state, setState] = useState<{ key: string; value: Record<string, FxStateAt> } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    const list = key.split(",");
    const chunks: string[][] = [];
    for (let i = 0; i < list.length; i += 60) chunks.push(list.slice(i, i + 60));
    Promise.all(
      chunks.map((c) => load(`/api/chain/fx/event-state?${new URLSearchParams({ pool, id, blocks: c.join(",") })}`)),
    ).then((all) => {
      if (!live) return;
      const merged: Record<string, FxStateAt> = {};
      for (const r of all) if (r) Object.assign(merged, r.reads);
      setState({ key, value: merged });
    });
    return () => {
      live = false;
    };
  }, [pool, id, key]);
  if (!key || state?.key !== key) return null;
  return state.value;
}

/** The position and the oracle's anchor and min legs at one block (the card's
 *  settled block). */
export function useFxPricesAt(pool: string, id: string, block: number | null | undefined): FxStateAt | null {
  const url =
    block != null && block > 0
      ? `/api/chain/fx/event-state?${new URLSearchParams({ pool, id, blocks: String(block), prices: "1" })}`
      : null;
  const s = useStateAt(url);
  return block != null ? (s?.reads[String(block)] ?? null) : null;
}

const WAD = 1e18;
const num = (s: string | null | undefined): number | null => (s == null ? null : Number(s) / WAD);

/** One side of a row, in human units. */
export interface FxSide {
  colls: number | null;
  debts: number | null;
  ratio: number | null;
  /** stETH per wstETH at the block (wstETH pool). */
  rate: number | null;
  /** The pool's rebalance and liquidation lines (debt ratio 0–1). */
  rebalanceLine: number | null;
  liquidateLine: number | null;
  /** The oracle's anchor and min legs, where the read asked for them. */
  anchorPrice: number | null;
  minPrice: number | null;
}

export function fxSide(s: FxStateAt | undefined): FxSide | null {
  if (!s) return null;
  return {
    colls: num(s.colls),
    debts: num(s.debts),
    ratio: num(s.ratio),
    rate: num(s.rate),
    rebalanceLine: num(s.rebalanceLine),
    liquidateLine: num(s.liquidateLine),
    anchorPrice: num(s.anchorPrice),
    minPrice: num(s.minPrice),
  };
}

/** Before (block − 1) and after (block) for one row. */
export function fxBeforeAfter(
  state: FxEventState | null,
  blockNumber?: number,
): { before: FxSide | null; after: FxSide | null } {
  if (!state || blockNumber == null) return { before: null, after: null };
  return { before: fxSide(state.reads[String(blockNumber - 1)]), after: fxSide(state.reads[String(blockNumber)]) };
}

// ── the pool's terms at head (/api/chain/fx/terms) ───────────────────────────

export type { FxPoolTerms };

const termsCache = new Map<string, Promise<FxPoolTerms | null>>();

function loadTerms(pool: string): Promise<FxPoolTerms | null> {
  let p = termsCache.get(pool);
  if (!p) {
    p = fetch(`/api/chain/fx/terms?pool=${encodeURIComponent(pool)}`)
      .then((r) => (r.ok ? (r.json() as Promise<FxPoolTerms>) : null))
      .catch(() => null);
    p.then((v) => {
      if (v == null) termsCache.delete(pool);
    });
    termsCache.set(pool, p);
  }
  return p;
}

/** The pool's rebalance and liquidation lines, funding and default fees; null
 *  while loading or after a miss. */
export function useFxPoolTerms(pool: string | null): FxPoolTerms | null {
  const [state, setState] = useState<{ pool: string; value: FxPoolTerms | null } | null>(null);
  useEffect(() => {
    if (!pool) return;
    let live = true;
    loadTerms(pool).then((d) => {
      if (live) setState({ pool, value: d });
    });
    return () => {
      live = false;
    };
  }, [pool]);
  if (!pool || state?.pool !== pool) return null;
  return state.value;
}
