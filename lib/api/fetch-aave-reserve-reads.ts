"use client";

// The reserve page's three indexed reads (anatomy M3.4, M3.6 to M3.8, ui-jobs
// 541), through the web's pass-through app/api/aave-family/[read]/route.ts to
// rails-server's /api/aave-family/{reserve-history,reserve-config-log,
// reserve-holders}. The shapes are the upstream's (rails-server
// api/src/services/aave-reserve-{history,config-log,holders}.ts). Client
// only: the bearer token stays in the route.
//
// The three start together when the page mounts, apart from the market's head
// read, and each settles on its own: a failure or a timeout leaves that one
// section a muted line.

import { useEffect, useState } from "react";
import type { AaveMarketKey } from "@/lib/shared/aave-market-configs";

/** The upstream's market vocabulary. */
const API_MARKET: Record<AaveMarketKey, string> = {
  "aave-v3": "core",
  "aave-v3-prime": "prime",
  "aave-v3-etherfi": "etherfi",
  spark: "spark",
  "aave-v3-base": "base",
  seamless: "seamless",
  "aave-v3-arbitrum": "arbitrum",
};

/** A market whose rows the box has not got: Arbitrum's lane, or Base's
 *  per-wallet positions for the holders. */
interface NotHeld {
  status: "not-indexed" | "not-ranked";
  reason: string;
}

export type HistoryReason =
  | "borrow-rate-zero"
  | "gho"
  | "stable-debt"
  | "rf-before-held"
  | "rf-changed-between-snapshots"
  | "reserve-factor-full";

export interface HistoryPoint {
  /** UTC day number and its date (YYYY-MM-DD). */
  day: number;
  date: string;
  /** The day's last block. */
  closeBlock: number;
  /** The ReserveDataUpdated in force at the close. */
  log: { block: number; txIndex: number; logIndex: number; txHash: string; timestamp: number };
  /** Rays, as the log stored them. */
  liquidityRate: string;
  variableBorrowRate: string;
  supplyApr: number;
  borrowApr: number;
  rf:
    | { bps: number; basis: "snapshots"; before: number; after: number }
    | { bps: number; basis: string; block?: number }
    | { bps: null; why: HistoryReason }
    | null;
  utilisation: number | null;
  why?: HistoryReason;
}

export interface ReserveHistory {
  market: string;
  chainId: number;
  pool: string;
  reserve: string;
  source: string;
  dayClose: string;
  identity: string;
  reserveFactor: { source: string; heldFrom: number; complete: boolean; snapshots: number };
  from: string | null;
  to: string | null;
  points: HistoryPoint[];
  reasons: Partial<Record<HistoryReason, string>>;
}

export interface ConfigRow {
  kind: string;
  block: number;
  txIndex: number;
  logIndex: number;
  timestamp: number;
  txHash: string;
  [field: string]: unknown;
}

export interface ReserveConfigLog {
  market: string;
  chainId: number;
  configurator: string;
  reserve: string;
  toBlock: number;
  held: Record<string, { table: string; heldFrom: number } | null>;
  units: Record<string, string>;
  notes: string[];
  logs: ConfigRow[];
}

export interface Holder {
  rank: number;
  wallet: string;
  /** The token's smallest unit. */
  amount: string;
  lastEventBlock: number;
  positionPath: string;
}

export interface ReserveHolders {
  market: string;
  chainId: number;
  reserve: string;
  source: string;
  refreshedAt: string | null;
  units: string;
  suppliers: Holder[];
  borrowers: Holder[];
  leftOut: { suppliers: { wallet: string; amount: string; rule: string }[]; borrowers: { wallet: string }[] };
}

export type Read<T> =
  | { state: "loading" }
  | { state: "error" }
  | { state: "not-held"; status: NotHeld["status"] }
  | { state: "ok"; data: T };

/** How long a read gets before its section gives up. */
const READ_MS = 40_000;

async function getRead<T>(read: string, q: Record<string, string>, signal: AbortSignal): Promise<Read<T>> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), READ_MS);
  signal.addEventListener("abort", () => ac.abort());
  try {
    const res = await fetch(`/api/aave-family/${read}?${new URLSearchParams(q)}`, { signal: ac.signal });
    if (!res.ok) return { state: "error" };
    return settle<T>((await res.json()) as T & Partial<NotHeld>);
  } finally {
    clearTimeout(timer);
  }
}

function settle<T>(body: T & Partial<NotHeld>): Read<T> {
  if (body.status === "not-indexed" || body.status === "not-ranked") return { state: "not-held", status: body.status };
  return { state: "ok", data: body };
}

/** One read, started on mount and again when its question changes. */
function useRead<T>(read: string, q: Record<string, string> | null): Read<T> {
  const [out, setOut] = useState<Read<T>>({ state: "loading" });
  const key = q ? new URLSearchParams(q).toString() : "";
  useEffect(() => {
    if (!q) return;
    const ac = new AbortController();
    setOut({ state: "loading" });
    getRead<T>(read, q, ac.signal)
      .then((r) => !ac.signal.aborted && setOut(r))
      .catch(() => !ac.signal.aborted && setOut({ state: "error" }));
    return () => ac.abort();
    // `key` is the question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read, key]);
  return out;
}

/** The first day the history asks for: a year back from today (UTC), or the
 *  reserve's first log where `all`. */
export function historyFrom(all: boolean): string | null {
  if (all) return null;
  const d = new Date(Date.now() - 365 * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** The three reads for one reserve, in parallel. `from`: the history's first
 *  day (YYYY-MM-DD), or null for the reserve's whole history. */
export function useReserveReads(key: AaveMarketKey, reserve: string, from: string | null) {
  const base = { market: API_MARKET[key], reserve: reserve.toLowerCase() };
  return {
    history: useRead<ReserveHistory>("reserve-history", from ? { ...base, from } : base),
    changes: useRead<ReserveConfigLog>("reserve-config-log", base),
    holders: useRead<ReserveHolders>("reserve-holders", base),
  };
}
