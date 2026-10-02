"use client";

// Client reads for the MakerDAO vault page's two historic chain reads
// (/api/chain/makerdao/ilk-at and /api/chain/makerdao/auction). A mined block
// never changes, so each answer is kept for the page's life in this module and
// shared by every surface that asks: the page asks once for its rows' blocks
// and its liquidations, and a card opened later reads the same answer.

import { useEffect, useMemo, useState } from "react";
import type {
  MakerAuctionRead,
  MakerIlkAt,
  MakerIlkAtResponse,
  MakerMatChangesResponse,
  MakerTxContext,
} from "@/lib/makerdao/chain-history-types";

const MAX_BLOCKS = 60;

const ilkAtCache = new Map<string, Promise<MakerIlkAt | null>>();
const auctionCache = new Map<string, Promise<MakerAuctionRead | null>>();

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson<T>(url: string, ok: (d: unknown) => d is T): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const d = await r.json();
        if (ok(d)) return d;
      }
    } catch {
      // Network failure: try again.
    }
    if (attempt < 2) await wait(1500 * (attempt + 1));
  }
  return null;
}

const isIlkAt = (d: unknown): d is MakerIlkAtResponse => d != null && typeof d === "object" && "reads" in d;
const isAuction = (d: unknown): d is MakerAuctionRead => d != null && typeof d === "object" && "kind" in d;

/** Start (or join) the reads for `blocks` of one ilk. Blocks already asked for
 *  share their first request. */
function loadIlkAt(ilk: string, blocks: number[]): Map<number, Promise<MakerIlkAt | null>> {
  const out = new Map<number, Promise<MakerIlkAt | null>>();
  const missing = [...new Set(blocks)].filter((b) => !ilkAtCache.has(`${ilk}:${b}`));
  for (let i = 0; i < missing.length; i += MAX_BLOCKS) {
    const chunk = missing.slice(i, i + MAX_BLOCKS);
    const q = new URLSearchParams({ ilk, blocks: chunk.join(",") });
    const req = fetchJson(`/api/chain/makerdao/ilk-at?${q.toString()}`, isIlkAt);
    for (const b of chunk) {
      const key = `${ilk}:${b}`;
      const p = req.then((d) => d?.reads[String(b)] ?? null);
      p.then((v) => {
        if (v == null) ilkAtCache.delete(key);
      });
      ilkAtCache.set(key, p);
    }
  }
  for (const b of blocks) out.set(b, ilkAtCache.get(`${ilk}:${b}`)!);
  return out;
}

/** The ilk's state at each of `blocks`, keyed by block. Blocks still loading or
 *  unread are absent. `limit` caps how many blocks one page asks for; past it
 *  the answer is `null`, and a caller states what it could not value. */
export function useMakerIlkAt(
  ilk: string | null | undefined,
  blocks: readonly number[],
  limit = Infinity,
): { reads: Map<number, MakerIlkAt>; complete: boolean } | null {
  const key = useMemo(() => [...new Set(blocks)].sort((a, b) => a - b).join(","), [blocks]);
  const [state, setState] = useState<{ key: string; reads: Map<number, MakerIlkAt>; complete: boolean } | null>(null);
  const tooMany = key ? key.split(",").length > limit : false;
  useEffect(() => {
    if (!ilk || !key || tooMany) return;
    let live = true;
    const list = key.split(",").map(Number);
    const promises = loadIlkAt(ilk, list);
    Promise.all([...promises.values()]).then((got) => {
      if (!live) return;
      const reads = new Map<number, MakerIlkAt>();
      got.forEach((g) => {
        if (g) reads.set(g.block, g);
      });
      setState({ key: `${ilk}|${key}`, reads, complete: reads.size === list.length });
    });
    return () => {
      live = false;
    };
  }, [ilk, key, tooMany]);
  if (!ilk || !key || tooMany || state?.key !== `${ilk}|${key}`) return null;
  return { reads: state.reads, complete: state.complete };
}

function loadAuction(txHash: string, urn: string): Promise<MakerAuctionRead | null> {
  const k = `${txHash.toLowerCase()}:${urn.toLowerCase()}`;
  let p = auctionCache.get(k);
  if (!p) {
    const q = new URLSearchParams({ tx: txHash, urn });
    p = fetchJson(`/api/chain/makerdao/auction?${q.toString()}`, isAuction);
    p.then((v) => {
      if (v == null || (v.kind === "clipper" && !v.settled)) auctionCache.delete(k);
    });
    auctionCache.set(k, p);
  }
  return p;
}

/** Every liquidation's auction, keyed by the grab row's transaction hash.
 *  Absent while loading or after a failed read. */
export function useMakerAuctions(grabs: readonly { txHash: string; urn: string }[]): Map<string, MakerAuctionRead> {
  const key = useMemo(
    () =>
      [...new Set(grabs.map((g) => `${g.txHash.toLowerCase()}:${g.urn.toLowerCase()}`))]
        .filter((k) => /^0x[0-9a-f]{64}:0x[0-9a-f]{40}$/.test(k))
        .sort()
        .join(","),
    [grabs],
  );
  const [state, setState] = useState<{ key: string; map: Map<string, MakerAuctionRead> } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    const pairs = key.split(",").map((k) => k.split(":") as [string, string]);
    Promise.all(pairs.map(([tx, urn]) => loadAuction(tx, urn))).then((got) => {
      if (!live) return;
      const map = new Map<string, MakerAuctionRead>();
      got.forEach((g, i) => {
        if (g) map.set(pairs[i][0], g);
      });
      setState({ key, map });
    });
    return () => {
      live = false;
    };
  }, [key]);
  return state?.key === key ? state.map : EMPTY;
}

const EMPTY = new Map<string, MakerAuctionRead>();

const txContextCache = new Map<string, Promise<MakerTxContext | null>>();
const matCache = new Map<string, Promise<MakerMatChangesResponse | null>>();
const isTxContext = (d: unknown): d is MakerTxContext => d != null && typeof d === "object" && "parties" in d;
const isMatChanges = (d: unknown): d is MakerMatChangesResponse => d != null && typeof d === "object" && "changes" in d;

function cached<T>(cache: Map<string, Promise<T | null>>, key: string, load: () => Promise<T | null>) {
  let p = cache.get(key);
  if (!p) {
    p = load();
    p.then((v) => {
      if (v == null) cache.delete(key);
    });
    cache.set(key, p);
  }
  return p;
}

/** Each transaction's context (lib/sources/chain/makerdao-tx-context.ts),
 *  keyed by transaction hash. `requests` pairs a hash with the addresses its
 *  rows name. Absent while loading or after a failed read. */
export function useMakerTxContexts(
  requests: readonly { txHash: string; addresses: string[] }[],
): Map<string, MakerTxContext> {
  const key = useMemo(
    () =>
      requests
        .filter((r) => /^0x[0-9a-f]{64}$/i.test(r.txHash))
        .map(
          (r) => `${r.txHash.toLowerCase()}|${[...new Set(r.addresses.map((a) => a.toLowerCase()))].sort().join(",")}`,
        )
        .sort()
        .join(";"),
    [requests],
  );
  const [state, setState] = useState<{ key: string; map: Map<string, MakerTxContext> } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    const items = key.split(";").map((k) => k.split("|") as [string, string]);
    Promise.all(
      items.map(([tx, addrs]) =>
        cached(txContextCache, `${tx}|${addrs}`, () =>
          fetchJson(
            `/api/chain/makerdao/tx-context?${new URLSearchParams({ tx, addresses: addrs }).toString()}`,
            isTxContext,
          ),
        ),
      ),
    ).then((got) => {
      if (!live) return;
      const map = new Map<string, MakerTxContext>();
      got.forEach((g, i) => {
        if (g) map.set(items[i][0], g);
      });
      setState({ key, map });
    });
    return () => {
      live = false;
    };
  }, [key]);
  return state?.key === key ? state.map : EMPTY_TX;
}

const EMPTY_TX = new Map<string, MakerTxContext>();

/** Changes to an ilk's minimum ratio inside each (from, to] block span, keyed
 *  by `${from}-${to}`. */
export function useMakerMatChanges(
  ilk: string | null | undefined,
  spans: readonly { from: number; to: number }[],
): Map<string, MakerMatChangesResponse> {
  const key = useMemo(
    () => (ilk ? [...new Set(spans.map((s) => `${s.from}-${s.to}`))].sort().join(",") : ""),
    [ilk, spans],
  );
  const [state, setState] = useState<{ key: string; map: Map<string, MakerMatChangesResponse> } | null>(null);
  useEffect(() => {
    if (!ilk || !key) return;
    let live = true;
    const items = key.split(",");
    Promise.all(
      items.map((span) => {
        const [from, to] = span.split("-");
        return cached(matCache, `${ilk}:${span}`, () =>
          fetchJson(
            `/api/chain/makerdao/mat-changes?${new URLSearchParams({ ilk, from, to }).toString()}`,
            isMatChanges,
          ),
        );
      }),
    ).then((got) => {
      if (!live) return;
      const map = new Map<string, MakerMatChangesResponse>();
      got.forEach((g, i) => {
        if (g) map.set(items[i], g);
      });
      setState({ key: `${ilk}|${key}`, map });
    });
    return () => {
      live = false;
    };
  }, [ilk, key]);
  return state?.key === `${ilk}|${key}` ? state.map : EMPTY_MAT;
}

const EMPTY_MAT = new Map<string, MakerMatChangesResponse>();

/** One ilk's price cap and auction breaker at head
 *  (`/api/chain/makerdao/ilk-terms`, lib/sources/chain/makerdao-lse-oracle.ts). */
export interface MakerIlkTerms {
  ilk: string;
  atBlock: number;
  priceCap: { capUsd: number; oracleUsd: number | null } | null;
  auction: { stopped: number; chop: number } | null;
}

const ilkTermsCache = new Map<string, Promise<MakerIlkTerms | null>>();
const isIlkTerms = (d: unknown): d is MakerIlkTerms => d != null && typeof d === "object" && "atBlock" in d;

/** The ilk's cap and breaker, shared by every card on the page that asks for
 *  the same ilk — one head read per ilk per page life. Null while loading,
 *  after a failed read, or with no ilk. */
export function useMakerIlkTerms(ilk: string | null | undefined): MakerIlkTerms | null {
  const [state, setState] = useState<MakerIlkTerms | null>(null);
  useEffect(() => {
    if (!ilk) return;
    let live = true;
    cached(ilkTermsCache, ilk, () =>
      fetchJson(`/api/chain/makerdao/ilk-terms?${new URLSearchParams({ ilk }).toString()}`, isIlkTerms),
    ).then((got) => {
      if (live) setState(got);
    });
    return () => {
      live = false;
    };
  }, [ilk]);
  return ilk && state?.ilk === ilk ? state : null;
}
