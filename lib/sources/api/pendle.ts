// Server-side reads of rails-server's Pendle routes (api/src/routes/pendle.ts),
// with the bearer token. Imported by the Pendle pages and the markets proxy only.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { PendleMarketPage, PendleRoster, PendleTokenMeta, PendleWalletPositions } from "@/lib/pendle/types";
import { resolveErc20Meta } from "@/lib/sources/chain/erc20-meta";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

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

/** A market at the finalized block, or at `block` (a page of older router events). */
export const readPendleMarket = (market: string, readerIp?: string, block?: number) =>
  read<PendleMarketPage>(`/market/${market.toLowerCase()}${block ? `?block=${block}` : ""}`, readerIp);

/** The roster; kept ten minutes, as the backend keeps it. */
export const readPendleRoster = (readerIp?: string) => read<PendleRoster>(`/markets`, readerIp, { revalidate: 600 });

/** The symbol and decimals of the outside tokens a market's router events
 *  move, through the shared token-metadata path (token_meta, then the chain);
 *  a token whose decimals did not read is left out. */
export async function outsideTokenMeta(page: PendleMarketPage): Promise<Record<string, PendleTokenMeta>> {
  const known = new Set([page.tokens.yieldToken.address, page.tokens.asset.address]);
  const want = [
    ...new Set(page.recent.flatMap((r) => r.legs.filter((l) => l.leg === "token" && l.token).map((l) => l.token!))),
  ].filter((a) => !known.has(a));
  const out: Record<string, PendleTokenMeta> = {
    [page.tokens.yieldToken.address]: {
      symbol: page.tokens.yieldToken.symbol,
      decimals: page.tokens.yieldToken.decimals,
    },
    [page.tokens.asset.address]: { symbol: page.tokens.asset.symbol, decimals: page.tokens.asset.decimals },
  };
  if (want.length === 0) return out;
  const metas = await resolveErc20Meta(want, MAINNET_CHAIN_ID).catch(() => new Map());
  for (const [a, m] of metas) if (!m.unresolved) out[a] = { symbol: m.named ? m.symbol : null, decimals: m.decimals };
  return out;
}
