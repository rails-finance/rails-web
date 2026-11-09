"use client";

// The Aave V4 reserve reads (ui-jobs 548), through the web's pass-through
// app/api/aave-v4/reserve/[read]/route.ts to rails-server:
//   head    the spoke reserve at the head block (services/aave-v4-reserve-head.ts);
//   holders its ten largest suppliers and borrowers (services/aave-v4-reserve-holders.ts);
//   history the hub asset's daily drawn rate (services/aave-v4-hub-asset-history.ts);
//   config-log the reserve's configuration changes (services/aave-v4-reserve-config-log.ts),
//           shaped as lib/aave-v4/config-words.ts `V4ConfigLog`.
// The shapes are the upstream's. Client only: the bearer token stays in the route.

import { useEffect, useState } from "react";
export type { V4ConfigLog } from "@/lib/aave-v4/config-words";

/** The head read of one spoke reserve: decimal strings at one block. */
export interface V4ReserveHead {
  chainId: 1 | 8453;
  blockNumber: number;
  blockTime: number;
  readAt: string;
  provider: string;
  spoke: {
    address: string;
    oracle: string | null;
    liquidationConfig: Record<string, string> | null;
  };
  reserve: {
    reserveId: number;
    underlying: string;
    hub: string;
    hubName: string | null;
    assetId: number;
    decimals: number;
    dynamicConfigKey: number;
    config: Record<string, string> | null;
    dynamicConfig: Record<string, string> | null;
    price: string | null;
    priceDecimals: string | null;
    priceSource: string | null;
  };
  hub: {
    added: string | null;
    owedDrawn: string | null;
    owedPremium: string | null;
    totalOwed: string | null;
    liquidity: string | null;
    drawnRateRay: string | null;
    drawnIndexRay: string | null;
    premiumShares: string | null;
    premiumOffsetRay: string | null;
    deficitRay: string | null;
    config: Record<string, string> | null;
    interestRateData: Record<string, string> | null;
  };
  spokeLine: {
    added: string | null;
    totalOwed: string | null;
    config: Record<string, string> | null;
    deficitRay: string | null;
  };
}

export interface V4Holder {
  rank: number;
  wallet: string;
  /** The token's smallest unit. */
  amount: string;
  readBlock: number;
}

export interface V4Holders {
  chainId: number;
  spoke: string;
  asset: string;
  reserveId: number;
  hub: string | null;
  source: string;
  refreshedAt: string | null;
  units: string;
  suppliers: V4Holder[];
  borrowers: V4Holder[];
  leftOut: { suppliers: { wallet: string; amount: string }[]; borrowers: { wallet: string; amount: string }[] };
}

export interface V4HistoryPoint {
  day: number;
  date: string;
  closeBlock: number;
  update: { block: number; timestamp: number | null };
  /** A ray. */
  drawnRate: string;
  drawnApr: number;
}

export interface V4History {
  chainId: 1;
  hub: string;
  asset: string;
  assetId: number;
  source: string;
  dayClose: string;
  utilisation: string;
  from: string | null;
  to: string | null;
  points: V4HistoryPoint[];
}

export type V4Read<T> =
  | { state: "loading" }
  | { state: "error"; message: string }
  /** The spoke lists the token from more than one hub and none was named. */
  | { state: "hub-required"; hubs: string[] }
  | { state: "not-listed" }
  | { state: "ok"; data: T };

const READ_MS = 35_000;

type V4ReadName = "head" | "holders" | "history" | "config-log";

/** One read of the four, settled into a `V4Read`. */
export async function getV4Read<T>(
  read: V4ReadName,
  q: Record<string, string>,
  signal?: AbortSignal,
): Promise<V4Read<T>> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), READ_MS);
  signal?.addEventListener("abort", () => ac.abort());
  try {
    const res = await fetch(`/api/aave-v4/reserve/${read}?${new URLSearchParams(q)}`, { signal: ac.signal });
    const body = (await res.json().catch(() => null)) as (T & { code?: string; hubs?: string[] }) | null;
    if (res.status === 400 && body?.code === "hub_required") return { state: "hub-required", hubs: body.hubs ?? [] };
    if (res.status === 404) return { state: "not-listed" };
    if (!res.ok || !body) return { state: "error", message: `The read answered ${res.status}.` };
    return { state: "ok", data: body };
  } catch {
    return { state: "error", message: "The read did not answer: reload to retry." };
  } finally {
    clearTimeout(timer);
  }
}

/** One read, started on mount and again when its question changes; null asks nothing. */
export function useV4Read<T>(read: V4ReadName, q: Record<string, string> | null): V4Read<T> {
  const [out, setOut] = useState<V4Read<T>>({ state: "loading" });
  const key = q ? new URLSearchParams(q).toString() : "";
  useEffect(() => {
    if (!q) return;
    const ac = new AbortController();
    setOut({ state: "loading" });
    getV4Read<T>(read, q, ac.signal).then((r) => !ac.signal.aborted && setOut(r));
    return () => ac.abort();
    // `key` is the question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read, key]);
  return out;
}

/** Many head reads at once (a spoke page's reserves), each settled on its own. */
export function useV4Heads(qs: Record<string, string>[] | null): (V4Read<V4ReserveHead> & { key: string })[] | null {
  const [out, setOut] = useState<(V4Read<V4ReserveHead> & { key: string })[] | null>(null);
  const key = qs ? qs.map((q) => new URLSearchParams(q).toString()).join("|") : "";
  useEffect(() => {
    if (!qs) return;
    const ac = new AbortController();
    setOut(null);
    Promise.all(
      qs.map(async (q) => ({
        ...(await getV4Read<V4ReserveHead>("head", q, ac.signal)),
        key: new URLSearchParams(q).toString(),
      })),
    ).then((rs) => !ac.signal.aborted && setOut(rs));
    return () => ac.abort();
    // `key` is the question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return out;
}
