"use client";

// The reserve page's three indexed reads (anatomy M3.4, M3.6 to M3.8, ui-jobs
// 541), through the web's pass-through app/api/aave-family/[read]/route.ts to
// rails-server's /api/aave-family/{reserve-history,reserve-config-log,
// reserve-holders}. The shapes are the upstream's (rails-server
// api/src/services/aave-reserve-{history,config-log,holders}.ts). Client
// only: the bearer token stays in the route.
//
// The deficit's write-offs (M3.9) read rails-server's /api/aave/reserve-deficit
// through app/api/aave/reserve-deficit/route.ts (rails-server
// api/src/services/aave-reserve-deficit.ts), on the markets whose Pool keeps a
// deficit: not SparkLend or Seamless.
//
// The reads start together when the page mounts, apart from the market's head
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

/** The markets whose Pool has no deficit getter (SparkLend's reverts; Seamless runs V3.0). */
const NO_DEFICIT: ReadonlySet<AaveMarketKey> = new Set(["spark", "seamless"]);

/** A market whose rows the box has not got: Arbitrum's lane, or Base's
 *  per-wallet positions for the holders. */
interface NotHeld {
  status: "not-indexed" | "not-ranked" | "no-deficit";
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

export interface DeficitToken {
  address: string;
  symbol: string | null;
  decimals: number | null;
}

/** One DeficitCreated and the LiquidationCall it came from. Amounts are raw. */
export interface WriteOff {
  user: string;
  writtenOff: { raw: string; decimals: number | null };
  block: number;
  /** Unix seconds. */
  timestamp: number;
  txHash: string;
  /** The log's index within its transaction. */
  logIndex: number;
  /** The emitting Pool. */
  pool: string;
  liquidation: {
    collateral: DeficitToken;
    collateralSeized: string;
    /** The debt token the liquidator repaid: this reserve's, or another the borrower owed. */
    debtAsset: DeficitToken;
    debtRepaid: string;
    liquidator: string;
    txFrom: string;
    logIndex: number;
  } | null;
}

export interface ReserveDeficit {
  market: string;
  chainId: number;
  pool: string;
  asset: DeficitToken;
  source: string;
  /** The first block the write-off table holds every log from. */
  wholeFrom: number;
  units: string;
  totals: { count: number; writtenOff: string };
  /** Largest first. */
  rows: WriteOff[];
  /** The Pool's DeficitCovered logs for the asset (absent from an api before stage B). */
  covers?: DeficitCovers;
  /** Σ written off − Σ covered at the Sieve's checkpoint: getReserveDeficit when the record is whole. */
  identity?: { writtenOff: string; covered: string; outstanding: string; atBlock: number } | null;
}

/** The Umbrella event beside a cover, which says how it was paid. */
export type UmbrellaCoverEvent = "DeficitOffsetCovered" | "PendingDeficitCovered" | "ReserveDeficitCovered";

/** One DeficitCovered. Amounts are raw. */
export interface DeficitCover {
  amount: { raw: string; decimals: number | null };
  block: number;
  /** Unix seconds. */
  timestamp: number;
  txHash: string;
  txIndex: number;
  /** The log's index within its transaction. */
  logIndex: number;
  /** The address that called Pool.eliminateReserveDeficit. */
  caller: string;
  txFrom: string;
  umbrella: { event: UmbrellaCoverEvent; logIndex: number } | null;
}

export interface StakeSlash {
  block: number;
  timestamp: number;
  txHash: string;
  logIndex: number;
  stakeToken: string;
  amount: string;
  fee: string;
}

export type DeficitCovers =
  | {
      status: "held";
      source: string;
      /** The first block the cover tables hold every log from. */
      wholeFrom: number;
      /** The Sieve's checkpoint. */
      toBlock: number;
      umbrella: string | null;
      totals: { count: number; covered: string };
      /** Oldest first. */
      rows: DeficitCover[];
      slashes: StakeSlash[];
    }
  | { status: "not-indexed" | "not-configured" | "read-failed"; reason: string };

export type Read<T> =
  | { state: "loading" }
  | { state: "error" }
  | { state: "not-held"; status: NotHeld["status"] }
  | { state: "ok"; data: T };

/** How long a read gets before its section gives up. */
const READ_MS = 40_000;

async function getRead<T>(path: string, q: Record<string, string>, signal: AbortSignal): Promise<Read<T>> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), READ_MS);
  signal.addEventListener("abort", () => ac.abort());
  try {
    const res = await fetch(`/api/${path}?${new URLSearchParams(q)}`, { signal: ac.signal });
    if (!res.ok) return { state: "error" };
    return settle<T>((await res.json()) as T & Partial<NotHeld>);
  } finally {
    clearTimeout(timer);
  }
}

function settle<T>(body: T & Partial<NotHeld>): Read<T> {
  if (body.status === "not-indexed" || body.status === "not-ranked" || body.status === "no-deficit")
    return { state: "not-held", status: body.status };
  return { state: "ok", data: body };
}

/** One read, started on mount and again when its question changes. `path`
 *  under /api/; a null question reads nothing and stays loading. */
function useRead<T>(path: string, q: Record<string, string> | null): Read<T> {
  const [out, setOut] = useState<Read<T>>({ state: "loading" });
  const key = q ? new URLSearchParams(q).toString() : "";
  useEffect(() => {
    if (!q) return;
    const ac = new AbortController();
    setOut({ state: "loading" });
    getRead<T>(path, q, ac.signal)
      .then((r) => !ac.signal.aborted && setOut(r))
      .catch(() => !ac.signal.aborted && setOut({ state: "error" }));
    return () => ac.abort();
    // `key` is the question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);
  return out;
}

/** The first day the history asks for: a year back from today (UTC), or the
 *  reserve's first log where `all`. */
export function historyFrom(all: boolean): string | null {
  if (all) return null;
  const d = new Date(Date.now() - 365 * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** The reads for one reserve, in parallel; `deficit` is null on a Pool with no deficit. `from`: the history's first
 *  day (YYYY-MM-DD), or null for the reserve's whole history. */
export function useReserveReads(key: AaveMarketKey, reserve: string, from: string | null) {
  const base = { market: API_MARKET[key], reserve: reserve.toLowerCase() };
  return {
    history: useRead<ReserveHistory>("aave-family/reserve-history", from ? { ...base, from } : base),
    changes: useRead<ReserveConfigLog>("aave-family/reserve-config-log", base),
    holders: useRead<ReserveHolders>("aave-family/reserve-holders", base),
    deficit: useRead<ReserveDeficit>(
      "aave/reserve-deficit",
      NO_DEFICIT.has(key) ? null : { market: base.market, asset: base.reserve },
    ),
    hasDeficit: !NO_DEFICIT.has(key),
  };
}
