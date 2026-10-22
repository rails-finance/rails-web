// The wallet view's one read (decision 0050, step 3; SERVER-ONLY): what
// /api/chain/wallet/<address> answers and the page renders. rails-server's
// GET /api/wallet/:address/positions gives every summary row of the address;
// each family's module (lib/wallet/families/) builds the cards with the
// family's listing builder and reads the head state of its open positions,
// one batched read per family. Every family runs at once under one 8 s budget
// (allSettled): a family whose head read does not answer keeps its store
// figures and says `headRead: "failed"`. Answers are kept 60 s per address.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { HeadResult, FamilyModule } from "@/lib/wallet/families/module";
import { aaveV3Base, aaveV3Ethereum, spark } from "@/lib/wallet/families/aave";
import { compoundV3Base, compoundV3Ethereum } from "@/lib/wallet/families/compound";
import { fluid, liquityV2, makerdao, morphoEthereum } from "@/lib/wallet/families/ethereum-single";
import { aaveV3Arbitrum, compoundV3Arbitrum, morphoArbitrum } from "@/lib/wallet/families/arbitrum";
import { withBudget, type WalletSummaryAnswer, type WalletSummaryRow } from "@/lib/wallet/summary-row";
import type { HeadRead, WalletFamilyRead, WalletPosition, WalletRead } from "@/lib/wallet/types";
import type { WalletCounts, WalletCountsFamily, WalletCountsPosition } from "@/lib/wallet/summary-counts";

/** The whole read's budget, the summary route's time included. */
export const WALLET_BUDGET_MS = 8000;
/** How long one address's answer is kept. */
export const WALLET_CACHE_MS = 60_000;
/** The summary route's page size, and how many rows one wallet may bring. */
const PAGE = 500;
const MAX_ROWS = 2000;

/** In the decision's order of priority. */
export const WALLET_FAMILIES: FamilyModule[] = [
  aaveV3Ethereum,
  aaveV3Base,
  aaveV3Arbitrum,
  compoundV3Ethereum,
  compoundV3Base,
  compoundV3Arbitrum,
  morphoEthereum,
  morphoArbitrum,
  liquityV2,
  makerdao,
  spark,
  fluid,
];

async function readSummary(address: string, signal: AbortSignal, readerIp?: string): Promise<WalletSummaryAnswer> {
  const base = process.env.RAILS_API_URL?.replace(/\/$/, "");
  if (!base) throw new Error("RAILS_API_URL is not set");
  let first: WalletSummaryAnswer | null = null;
  const rows: WalletSummaryRow[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const res = await fetch(`${base}/api/wallet/${address}/positions?limit=${PAGE}&offset=${offset}`, {
      ...createAuthFetchOptions({ signal }, readerIp),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`/api/wallet/${address}/positions answered ${res.status}`);
    const page = (await res.json()) as WalletSummaryAnswer;
    first ??= page;
    rows.push(...page.rows);
    if (rows.length >= page.total || page.rows.length < PAGE) break;
  }
  return { ...first!, rows };
}

function headOf(open: WalletPosition[]): HeadRead {
  const read = open.filter((p) => !p.notRead);
  if (read.length === 0) return "none";
  if (read.some((p) => p.headRead === "failed")) return "failed";
  if (read.every((p) => p.headRead === "stored")) return "stored";
  return read.some((p) => p.headRead === "read") ? "read" : "none";
}

async function readFamily(
  f: FamilyModule,
  rows: WalletSummaryRow[],
  address: string,
  deadline: number,
): Promise<{ read: WalletFamilyRead; positions: WalletPosition[] }> {
  const t0 = Date.now();
  const positions = await f.shape(rows);
  const open = positions.filter((p) => p.status === "open");
  const rest = positions.filter((p) => p.status !== "open");
  let head: HeadResult = { positions: open, reads: 0 };
  let error: string | undefined;
  const readable = open.filter((p) => !p.notRead);
  if (f.head && readable.length > 0) {
    try {
      head = await withBudget(Math.max(500, deadline - Date.now()), (signal) => f.head!(open, address, signal));
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      head = { positions: open.map((p) => (p.notRead ? p : { ...p, headRead: "failed" as const })), reads: 0 };
    }
  }
  const all = [...head.positions, ...rest];
  return {
    positions: all,
    read: {
      id: f.id,
      name: f.name,
      chain: f.chain,
      positions: all.length,
      open: head.positions.length,
      headRead: headOf(head.positions),
      ms: Date.now() - t0,
      reads: head.reads,
      error,
    },
  };
}

export async function readWalletUncached(address: string, readerIp?: string): Promise<WalletRead> {
  const t0 = Date.now();
  const deadline = t0 + WALLET_BUDGET_MS;
  let summary: WalletSummaryAnswer;
  try {
    summary = await withBudget(WALLET_BUDGET_MS, (signal) => readSummary(address, signal, readerIp));
  } catch (err) {
    return {
      address,
      positions: [],
      families: [],
      total: 0,
      readAt: Math.floor(Date.now() / 1000),
      serverMs: Date.now() - t0,
      ms: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const serverMs = Date.now() - t0;
  const groups = WALLET_FAMILIES.map((f) => ({
    f,
    rows: summary.rows.filter((r) => r.chain === f.summaryChain && r.family === f.summaryFamily),
  })).filter((g) => g.rows.length > 0);
  const settled = await Promise.allSettled(groups.map((g) => readFamily(g.f, g.rows, address, deadline)));
  const families: WalletFamilyRead[] = [];
  const positions: WalletPosition[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") {
      families.push(s.value.read);
      positions.push(...s.value.positions);
    } else {
      const g = groups[i];
      families.push({
        id: g.f.id,
        name: g.f.name,
        chain: g.f.chain,
        positions: 0,
        open: 0,
        headRead: "failed",
        ms: Date.now() - t0,
        reads: 0,
        error: s.reason instanceof Error ? s.reason.message : String(s.reason),
      });
    }
  });
  return {
    address,
    positions,
    families,
    total: summary.total,
    readAt: Math.floor(Date.now() / 1000),
    serverMs,
    ms: Date.now() - t0,
  };
}

// 60 s per address, and one read at a time per address: a page and its route
// asking together share the read.
const cache = new Map<string, { at: number; read: Promise<WalletRead> }>();

export function readWallet(address: string, readerIp?: string): Promise<WalletRead> {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < WALLET_CACHE_MS) return hit.read;
  const read = readWalletUncached(key, readerIp);
  cache.set(key, { at: Date.now(), read });
  // A failed summary read is not kept.
  void read.then((r) => {
    if (r.error) cache.delete(key);
  });
  if (cache.size > 500) {
    for (const [k, v] of cache) if (Date.now() - v.at >= WALLET_CACHE_MS) cache.delete(k);
  }
  return read;
}

// The counts alone, for the line under every explorer's wallet row (decision
// 0050 point 10): the summary route's rows and no head read. A family whose
// figures are stored (no `head`, the Arbitrum lane) is shaped as the wallet
// view shapes it, which makes no read and splits a Compound V3 row into one
// position per Comet; every other row is one position. Kept 60 s per address.
const countsCache = new Map<string, { at: number; read: Promise<WalletCounts> }>();

export function readWalletCounts(address: string, readerIp?: string): Promise<WalletCounts> {
  const key = address.toLowerCase();
  const hit = countsCache.get(key);
  if (hit && Date.now() - hit.at < WALLET_CACHE_MS) return hit.read;
  const read = (async (): Promise<WalletCounts> => {
    const t0 = Date.now();
    const empty = { address: key, positions: [], families: [], total: 0, open: 0, closed: 0, chains: [] };
    let summary: WalletSummaryAnswer;
    try {
      summary = await withBudget(WALLET_BUDGET_MS, (signal) => readSummary(key, signal, readerIp));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { ...empty, readAt: Math.floor(Date.now() / 1000), ms: Date.now() - t0, error };
    }
    const positions: WalletCountsPosition[] = [];
    const taken = new Set<WalletSummaryRow>();
    for (const f of WALLET_FAMILIES) {
      if (f.head) continue;
      const rows = summary.rows.filter((r) => r.chain === f.summaryChain && r.family === f.summaryFamily);
      if (rows.length === 0) continue;
      try {
        for (const p of await f.shape(rows)) {
          positions.push({
            chain: f.summaryChain,
            family: f.summaryFamily,
            positionId: p.positionId,
            status: p.status,
            href: p.href,
          });
        }
        rows.forEach((r) => taken.add(r));
      } catch {
        // The rows count one each below.
      }
    }
    for (const r of summary.rows) {
      if (!taken.has(r))
        positions.push({ chain: r.chain, family: r.family, positionId: r.positionId, status: r.status, href: r.href });
    }
    const families = new Map<string, WalletCountsFamily>();
    for (const p of positions) {
      const k = `${p.chain}:${p.family}`;
      const fam = families.get(k) ?? { chain: p.chain, family: p.family, positions: 0, open: 0, closed: 0 };
      fam.positions += 1;
      if (p.status === "open") fam.open += 1;
      else fam.closed += 1;
      families.set(k, fam);
    }
    const open = positions.filter((p) => p.status === "open").length;
    return {
      address: key,
      positions,
      families: [...families.values()],
      total: positions.length,
      open,
      closed: positions.length - open,
      chains: [...new Set(positions.map((p) => p.chain))],
      readAt: Math.floor(Date.now() / 1000),
      ms: Date.now() - t0,
    };
  })();
  countsCache.set(key, { at: Date.now(), read });
  void read.then((r) => {
    if (r.error) countsCache.delete(key);
  });
  if (countsCache.size > 500) {
    for (const [k, v] of countsCache) if (Date.now() - v.at >= WALLET_CACHE_MS) countsCache.delete(k);
  }
  return read;
}
