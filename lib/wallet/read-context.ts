// What every wallet-view adapter reads through (SERVER-ONLY): this
// deployment's own /api proxies by the self-hop the listings use
// (lib/shared/listing-ssr.ts `ssrHop`), and the box for the Arbitrum store
// reads the family loaders make. One abort signal per family carries the
// page's timeout (lib/wallet/adapters/index.ts).

import { ssrHop, type SsrHop } from "@/lib/shared/listing-ssr";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";

export interface WalletReadContext {
  hop: SsrHop;
  readerIp?: string;
  signal?: AbortSignal;
}

export async function walletReadContext(signal?: AbortSignal): Promise<WalletReadContext> {
  const hop = await ssrHop();
  if (!hop) throw new Error("no host header: the page cannot reach its own /api");
  return { hop, readerIp: await readerIpFromHeaders(), signal };
}

/** GET one of this deployment's own routes (a family's chain overlay) as JSON;
 *  null where it does not answer 200. */
export async function hopJson<T>(ctx: WalletReadContext, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${ctx.hop.baseUrl}${path}`, {
      cache: "no-store",
      headers: ctx.hop.headers,
      signal: ctx.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** GET a route on the box (an Arbitrum family's store) as JSON. Throws where
 *  the box does not answer, so the family is named as unread. */
export async function boxJson(ctx: WalletReadContext, path: string): Promise<unknown> {
  const base = process.env.RAILS_API_URL?.replace(/\/$/, "");
  if (!base) throw new Error("RAILS_API_URL is not set");
  const res = await fetch(`${base}${path}`, {
    ...createAuthFetchOptions(undefined, ctx.readerIp),
    cache: "no-store",
    signal: ctx.signal,
  });
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  return res.json();
}

/** The buffer from a liquidation-line ratio: capacity over debt, 1 at the
 *  line (a health factor). With the debt held, the collateral price can fall
 *  by 1 − 1/HF before the line. */
export const bufferFromHealth = (hf: number | null | undefined): number | undefined =>
  hf != null && Number.isFinite(hf) && hf > 0 ? 1 - 1 / hf : undefined;

export const isoSeconds = (iso: string | null | undefined): number | undefined => {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
};

/** A raw integer amount scaled to its decimals; 0 on anything unreadable. */
export function scaled(raw: string | null | undefined, decimals: number): number {
  if (!raw) return 0;
  try {
    const big = BigInt(raw.split(".")[0]);
    const d = BigInt(10) ** BigInt(decimals);
    return Number(big / d) + Number(big % d) / Number(d);
  } catch {
    return 0;
  }
}

/** "12.4K" style amount with its symbol, for the History table. */
export function amountText(amount: number, symbol: string | null | undefined): string {
  const n =
    amount >= 1000
      ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(amount)
      : amount.toLocaleString("en-US", { maximumFractionDigits: amount < 1 ? 4 : 2 });
  return symbol ? `${n} ${symbol}` : n;
}
