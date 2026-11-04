// Server-side reads of rails-server's CoW wallet routes (api/src/routes/cow.ts),
// with the bearer token. Imported by the CoW wallet page, the trades proxy and
// the wallet view's page (/wallet/<address>) only.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { CowTradesPage, CowWalletEntry, CowWalletTokens } from "@/lib/cow/types";

export class CowReadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const CURSOR = /^\d+-\d+-\d+$/;

async function read<T>(path: string, readerIp?: string, signal?: AbortSignal): Promise<T> {
  const base = process.env.RAILS_API_URL;
  if (!base) throw new Error("RAILS_API_URL environment variable is not set");
  const res = await fetch(`${base}/api/cow/ethereum/wallet${path}`, {
    ...createAuthFetchOptions({ signal }, readerIp),
    cache: "no-store",
  });
  if (!res.ok) throw new CowReadError(res.status, `cow ${path.split("?")[0]}: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export interface CowTradesQuery {
  tokens: string[];
  pair: boolean;
  before?: string;
  limit?: number;
}

/** The query a URL carries: `token` addresses, `pair=1`, `before`, `limit`.
 *  Anything malformed is dropped. */
export function parseCowTradesQuery(sp: URLSearchParams): CowTradesQuery {
  const tokens = (sp.get("token") ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => ADDRESS.test(t))
    .slice(0, 20);
  const before = sp.get("before");
  const limit = Number(sp.get("limit"));
  return {
    tokens: [...new Set(tokens)],
    pair: sp.get("pair") === "1" && tokens.length === 2,
    before: before && CURSOR.test(before) ? before : undefined,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : undefined,
  };
}

export function readCowTrades(
  wallet: string,
  q: CowTradesQuery,
  readerIp?: string,
  signal?: AbortSignal,
): Promise<CowTradesPage> {
  const p = new URLSearchParams();
  if (q.tokens.length) p.set("token", q.tokens.join(","));
  if (q.pair) p.set("pair", "1");
  if (q.before) p.set("before", q.before);
  if (q.limit) p.set("limit", String(q.limit));
  const qs = p.toString();
  return read<CowTradesPage>(`/${wallet}/trades${qs ? `?${qs}` : ""}`, readerIp, signal);
}

export function readCowTokens(wallet: string, readerIp?: string, signal?: AbortSignal): Promise<CowWalletTokens> {
  return read<CowWalletTokens>(`/${wallet}/tokens`, readerIp, signal);
}

/** The wallet view's budget for the CoW read (W7). */
const WALLET_VIEW_COW_MS = 3000;

/** The wallet's CoW summary for the wallet view (W7): its trades and its
 *  first and last trade, at the checkpoint block. Null when the wallet has
 *  no trade, or the read fails or runs past its budget; the view then draws
 *  no CoW row. */
export async function readCowWalletEntry(wallet: string, readerIp?: string): Promise<CowWalletEntry | null> {
  try {
    const { summary, asOf } = await readCowTokens(wallet, readerIp, AbortSignal.timeout(WALLET_VIEW_COW_MS));
    return summary.trades > 0 ? { summary, asOf } : null;
  } catch {
    return null;
  }
}
