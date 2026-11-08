// Server-side reads of rails-server's Pendle routes (api/src/routes/pendle.ts),
// with the bearer token. Imported by the Pendle pages and the markets proxy only.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { PendleMarketPage, PendleRoster, PendleWalletPositions } from "@/lib/pendle/types";

/** A read that did not answer: the backend's status and its `code` where it sent one. */
export interface PendleReadFailure {
  ok: false;
  status: number;
  code: string | null;
}
export type PendleRead<T> = { ok: true; data: T } | PendleReadFailure;

async function read<T>(path: string, readerIp?: string, init?: { revalidate?: number }): Promise<PendleRead<T>> {
  const base = process.env.RAILS_API_URL;
  if (!base) return { ok: false, status: 500, code: "no_api_url" };
  try {
    const res = await fetch(`${base}/api/pendle${path}`, {
      ...createAuthFetchOptions(undefined, readerIp),
      ...(init?.revalidate ? { next: { revalidate: init.revalidate } } : { cache: "no-store" as const }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { code?: string } | null;
      return { ok: false, status: res.status, code: body?.code ?? null };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 502, code: "unreachable" };
  }
}

/** The wallet's positions; `market` adds a market its router events may not name (a PT it was sent). */
export const readPendleWallet = (wallet: string, readerIp?: string, market?: string) =>
  read<PendleWalletPositions>(
    `/wallet/${wallet.toLowerCase()}/positions${market ? `?market=${market.toLowerCase()}` : ""}`,
    readerIp,
  );

export const readPendleMarket = (market: string, readerIp?: string) =>
  read<PendleMarketPage>(`/market/${market.toLowerCase()}`, readerIp);

/** The roster; kept ten minutes, as the backend keeps it. */
export const readPendleRoster = (readerIp?: string) => read<PendleRoster>(`/markets`, readerIp, { revalidate: 600 });
