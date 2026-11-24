// Server-side reads of rails-server's CoW routes (api/src/routes/cow.ts), with
// the bearer token. Imported by the CoW wallet page, the trades proxy, the
// wallet view's page (/wallet/<address>) and the Aave CoW figures' proxies only.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { CowTradesPage, CowWalletEntry, CowWalletTokens } from "@/lib/cow/types";
import type { CowSettlement } from "@/lib/cow/settlement";
import type { CowAaveFamily, CowAaveFigure, CowAaveSort, CowAaveSwapsPage, CowAaveTotals } from "@/lib/cow/aave-totals";

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

async function read<T>(
  path: string,
  readerIp?: string,
  signal?: AbortSignal,
  root = "/api/cow/ethereum/wallet",
): Promise<T> {
  const base = process.env.RAILS_API_URL;
  if (!base) throw new Error("RAILS_API_URL environment variable is not set");
  const res = await fetch(`${base}${root}${path}`, {
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

const TX_HASH = /^0x[0-9a-f]{64}$/;

/** A settlement's trades with the clearing prices its settle() call gave them
 *  (rails-server GET /api/cow/ethereum/settlement/:block/:tx). Outside
 *  production, `COW_SETTLEMENT_FIXTURES=1` answers from the settlements read
 *  on chain for ui-jobs 711 (scripts/fixtures/cow-settlement/<tx>.json), a 404
 *  for any other, so the panel can be read before the route is deployed. */
export async function readCowSettlement(
  block: number,
  txHash: string,
  readerIp?: string,
  signal?: AbortSignal,
): Promise<CowSettlement> {
  const tx = txHash.toLowerCase();
  if (!Number.isSafeInteger(block) || block < 0 || !TX_HASH.test(tx))
    throw new CowReadError(400, "malformed block or hash");
  if (process.env.NODE_ENV !== "production" && process.env.COW_SETTLEMENT_FIXTURES === "1") {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    try {
      const body = JSON.parse(
        await readFile(join(process.cwd(), "scripts/fixtures/cow-settlement", `${tx}.json`), "utf8"),
      ) as CowSettlement;
      if (body.blockNumber !== block) throw new CowReadError(404, "no such settlement in the fixtures");
      return body;
    } catch (err) {
      throw err instanceof CowReadError ? err : new CowReadError(404, "no such settlement in the fixtures");
    }
  }
  return read<CowSettlement>(`/${block}/${tx}`, readerIp, signal, "/api/cow/ethereum/settlement");
}

/** The Aave CoW figures' budget: a cold read on the server takes about 7 s (Aave V3's 92,000 swaps), then it is held
 *  for an hour. Past this the proxy answers 504 and the block keeps its loading line. */
const COW_AAVE_MS = 15_000;

const timeoutOr = (signal?: AbortSignal) =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(COW_AAVE_MS)]) : AbortSignal.timeout(COW_AAVE_MS);

/** The CoW figures across one Aave family's swaps (rails-server GET /api/cow/ethereum/aave/:family/totals). */
export function readCowAaveTotals(
  family: CowAaveFamily,
  readerIp?: string,
  signal?: AbortSignal,
): Promise<CowAaveTotals> {
  return read<CowAaveTotals>(`/${family}/totals`, readerIp, timeoutOr(signal), "/api/cow/ethereum/aave");
}

/** One page of the swaps behind a figure (rails-server GET /api/cow/ethereum/aave/:family/swaps). */
export function readCowAaveSwaps(
  family: CowAaveFamily,
  q: { figure: CowAaveFigure; sort: CowAaveSort; offset: number; limit: number },
  readerIp?: string,
  signal?: AbortSignal,
): Promise<CowAaveSwapsPage> {
  const p = new URLSearchParams({ figure: q.figure, sort: q.sort, offset: String(q.offset), limit: String(q.limit) });
  return read<CowAaveSwapsPage>(`/${family}/swaps?${p}`, readerIp, timeoutOr(signal), "/api/cow/ethereum/aave");
}
