// The wallet view's one read (decision 0050, step 3; SERVER-ONLY): what
// /api/chain/wallet/<address> answers and the page renders. rails-server's
// GET /api/wallet/:address/positions gives every summary row of the address;
// each family's module (lib/wallet/families/) builds the cards with the
// family's listing builder and reads the head state of its open positions,
// one batched read per family. Every family runs at once under one 8 s budget
// (allSettled): a family whose head read does not answer keeps its store
// figures and says `headRead: "failed"`. Answers are kept 60 s per address.

import { WALLET_FORMER_FAMILIES } from "@/lib/wallet/moved-row";
import { walletRowStatus } from "@/lib/wallet/moved-row";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { takesRow, walletApiWait, type HeadResult, type FamilyModule } from "@/lib/wallet/families/module";
import {
  liquityV1,
  liquityV1Deposits,
  liquityV1Stakes,
  liquityV2Deposits,
} from "@/lib/wallet/families/liquity-listing";
import {
  liquityV1DepositSummaryRow,
  liquityV1StakeSummaryRow,
  liquityV1TroveSummaryRow,
  liquityV2DepositSummaryRow,
  forkDepositSummaryRow,
} from "@/lib/wallet/listing-summary-rows";
import { readLiquityV1Positions } from "@/lib/liquity-v1/proxy-reads";
import { answerBody, routeBoxHop } from "@/lib/shared/proxy-answer";
import type { LiquityV1PositionSummary } from "@/lib/sources/api/liquity-v1-positions";
import { readLiquityV1Sp, type LiquityV1DepositListResponse } from "@/lib/sources/api/liquity-v1-sp";
import { readLiquityV2Sp, type LiquityV2DepositListResponse } from "@/lib/sources/api/liquity-v2-sp";
import { readLiquityV1Staking, type LiquityV1StakeListResponse } from "@/lib/sources/api/liquity-v1-staking";
import { aaveV3Base, aaveV3Ethereum, seamless, spark } from "@/lib/wallet/families/aave";
import { compoundV3Base, compoundV3Ethereum } from "@/lib/wallet/families/compound";
import { compoundV2 } from "@/lib/wallet/families/compound-v2";
import { moonwellBase } from "@/lib/wallet/families/moonwell";
import { morphoBase } from "@/lib/wallet/families/morpho-base";
import { fluid, liquityV2, makerdao, morphoEthereum } from "@/lib/wallet/families/ethereum-single";
import { aaveV3Arbitrum, compoundV3Arbitrum, morphoArbitrum } from "@/lib/wallet/families/arbitrum";
import {
  asymmetry,
  asymmetryDeposits,
  basedollar,
  basedollarDeposits,
  ebisu,
  ebisuDeposits,
} from "@/lib/wallet/families/liquity-forks";
import { SP_DEPLOYMENTS } from "@/lib/liquity-v2/sp-deployment";
import { countedRow, withBudget, type WalletSummaryAnswer, type WalletSummaryRow } from "@/lib/wallet/summary-row";
import type { HeadRead, WalletFamilyRead, WalletPosition, WalletRead } from "@/lib/wallet/types";
import type { WalletCounts, WalletCountsFamily, WalletCountsPosition } from "@/lib/wallet/summary-counts";
import { publicErrorMessage } from "@/lib/api/public-error";
import { apiHop } from "@/lib/wallet/api-hop";
import { kindOfRow, WALLET_PROTOCOLS } from "@/lib/wallet/wallet-filters";

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
  morphoBase,
  morphoArbitrum,
  liquityV2,
  liquityV2Deposits,
  liquityV1,
  liquityV1Deposits,
  liquityV1Stakes,
  makerdao,
  spark,
  fluid,
  ebisu,
  ebisuDeposits,
  asymmetry,
  asymmetryDeposits,
  basedollar,
  basedollarDeposits,
  compoundV2,
  moonwellBase,
  seamless,
];

/** The families the page reads, by chain, in one sentence for the empty
 *  state: "Aave V3, … and Asymmetry on Ethereum; … on Base; …". The Arbitrum
 *  rows are written when Rails reads the wallet there, which the sentence says. */
export function walletFamiliesLine(): string {
  const byChain = new Map<WalletSummaryRow["chain"], string[]>();
  for (const f of WALLET_FAMILIES) {
    const names = byChain.get(f.summaryChain) ?? [];
    if (!names.includes(f.name)) names.push(f.name);
    byChain.set(f.summaryChain, names);
  }
  const list = (n: string[]) => (n.length < 2 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`);
  // No wallet module reads Arc or Sepolia, so neither has a phrase.
  const where: Partial<Record<WalletSummaryRow["chain"], string>> = {
    ethereum: "on Ethereum",
    base: "on Base",
    arbitrum: "on Arbitrum where Rails has read the wallet",
  };
  return [...byChain].map(([chain, names]) => `${list(names)} ${where[chain] ?? `on ${chain}`}`).join("; ");
}

/** A listing read that did not answer, or answered part of the wallet: its
 *  module's part of the answer says so, and no total stands while it does. */
export interface ListingFailure {
  module: FamilyModule;
  /** The read stops the wallet total only where the wallet holds a position
   *  on the module's family (the forks' deposit reads). */
  heldOnly?: boolean;
  /** What could not be read, for the page's line ("Liquity V1 Troves"). */
  what: string;
  error: string;
}

type Summary = WalletSummaryAnswer & { listingFailed: ListingFailure[] };

/** How many of a wallet's rows one listing read takes: a wallet holds one
 *  Liquity V1 deposit and at most one Liquity V2 deposit per branch. A read
 *  whose total is past it counts as failed. */
const LISTING_LIMIT = 100;
/** Each listing read's own wait, inside the page's budget, so a slow route
 *  leaves the head reads their time and a hung one fails alone. */
export const LISTING_BUDGET_MS = 4000;

/**
 * The rows wallet_positions does not hold yet, read from the protocol
 * listings' routes for the wallet: Liquity V1's Troves, its Stability Pool
 * deposit, and the deposits on Liquity V2 (ui-jobs 794) and its forks
 * (ui-jobs 738). Every status, newest first. A read that fails leaves its rows
 * out and names its module.
 */
export async function readListingRows(
  address: string,
  signal: AbortSignal,
  readerIp?: string,
  budgetMs = LISTING_BUDGET_MS,
): Promise<{ rows: WalletSummaryRow[]; failed: ListingFailure[] }> {
  const base = process.env.RAILS_API_URL?.replace(/\/$/, "") ?? "";
  const hop = routeBoxHop(base, readerIp);
  const list = { wallet: address, sortBy: "recent", sortOrder: "desc", limit: String(LISTING_LIMIT), offset: "0" };
  type Page = { rows: WalletSummaryRow[]; total: number };
  const reads: {
    module: FamilyModule;
    what: string;
    heldOnly?: boolean;
    read: (signal: AbortSignal) => Promise<Page>;
  }[] = [
    {
      module: liquityV1,
      what: "Liquity V1 Troves",
      read: async (signal) => {
        const body = answerBody(
          await readLiquityV1Positions(new URLSearchParams(list), hop, signal),
          "Liquity V1 Troves",
        ) as { data: LiquityV1PositionSummary[]; pagination: { total: number } };
        return { rows: body.data.map((t) => liquityV1TroveSummaryRow(t, address)), total: body.pagination.total };
      },
    },
    {
      module: liquityV1Deposits,
      what: "Liquity V1 Stability Pool deposits",
      read: async (signal) => {
        const r = await readLiquityV1Sp<LiquityV1DepositListResponse>("stability-pool", list, { ...hop, signal });
        return { rows: r.rows.map((d) => liquityV1DepositSummaryRow(d, address)), total: r.pagination.total };
      },
    },
    {
      module: liquityV1Stakes,
      what: "Liquity V1 LQTY stakes",
      read: async (signal) => {
        const r = await readLiquityV1Staking<LiquityV1StakeListResponse>("staking", list, { ...hop, signal });
        return { rows: r.rows.map((st) => liquityV1StakeSummaryRow(st, address)), total: r.pagination.total };
      },
    },
    {
      module: liquityV2Deposits,
      what: "Liquity V2 Stability Pool deposits",
      read: async (signal) => {
        const r = await readLiquityV2Sp<LiquityV2DepositListResponse>("stability-pool", list, { ...hop, signal });
        return { rows: r.rows.map((d) => liquityV2DepositSummaryRow(d, address)), total: r.pagination.total };
      },
    },
    ...[ebisuDeposits, asymmetryDeposits, basedollarDeposits].map((module) => {
      const dep = SP_DEPLOYMENTS[module.summaryFamily as "ebisu" | "asymmetry" | "basedollar"];
      const fork = { id: dep.id, chain: module.summaryChain, stable: dep.stable.symbol, spPath: dep.spPath };
      return {
        module,
        what: `${dep.name} Stability Pool deposits`,
        heldOnly: true,
        read: async (signal: AbortSignal) => {
          const r = await readLiquityV2Sp<LiquityV2DepositListResponse<string>>("stability-pool", list, {
            ...hop,
            signal,
            api: dep.api,
          });
          return { rows: r.rows.map((d) => forkDepositSummaryRow(d, address, fork)), total: r.pagination.total };
        },
      };
    }),
  ];
  const settled = await Promise.allSettled(
    reads.map(async (r) => {
      // The listing's budget runs from the slot, not from the queue.
      const page = await apiHop(() => withBudget(budgetMs, (own) => r.read(AbortSignal.any([signal, own]))), signal);
      if (page.total > page.rows.length) throw new Error(`answered ${page.rows.length} of ${page.total} rows`);
      return page.rows;
    }),
  );
  const rows: WalletSummaryRow[] = [];
  const failed: ListingFailure[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") rows.push(...s.value);
    else
      failed.push({
        module: reads[i].module,
        what: reads[i].what,
        heldOnly: reads[i].heldOnly,
        error: publicErrorMessage(s.reason),
      });
  });
  return { rows, failed };
}

/**
 * The opt-in rails-server's wallet positions route needs to answer every
 * family and chain; without it the route answers only the pairs production
 * web draws. Later wallet branches reuse this constant.
 */
export const WALLET_API_SCOPE = "families=all&chains=ethereum,base,arbitrum,arc,sepolia";

/** The summary route's URL for one page of an address's rows. */
export const walletSummaryUrl = (base: string, address: string, limit: number, offset: number): string =>
  `${base}/api/wallet/${address}/positions?limit=${limit}&offset=${offset}&former=${WALLET_FORMER_FAMILIES}&${WALLET_API_SCOPE}`;

/**
 * The wallet's rows: rails-server's summary route, and beside it the listing
 * reads for the kinds the summary table does not hold (readListingRows).
 * Decision 0050 departure; ui-jobs 795 moves it into wallet_positions. Both
 * the page's read and the counts read come through here, so the menu, the
 * pills and the sections take the same rows. Until readListingRows goes,
 * rows 795 adds to the summary route must be deduplicated against these on
 * (family, positionId).
 */
export async function readSummary(address: string, signal: AbortSignal, readerIp?: string): Promise<Summary> {
  const base = process.env.RAILS_API_URL?.replace(/\/$/, "");
  if (!base) throw new Error("RAILS_API_URL is not set");
  // The summary's first page takes the first slot to the api host, ahead of
  // the listing reads (ui-jobs 813); each page is retried once on a reset
  // connection.
  const pageAt = (offset: number) =>
    apiHop(async () => {
      const res = await fetch(walletSummaryUrl(base, address, PAGE, offset), {
        ...createAuthFetchOptions({ signal }, readerIp),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`/api/wallet/${address}/positions answered ${res.status}`);
      return (await res.json()) as WalletSummaryAnswer;
    }, signal);
  const firstPage = pageAt(0);
  const listing = readListingRows(address, signal, readerIp);
  // Settled beside the summary, so a failed summary leaves no rejection unheard.
  listing.catch(() => {});
  let first: WalletSummaryAnswer | null = null;
  const rows: WalletSummaryRow[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const page = offset === 0 ? await firstPage : await pageAt(offset);
    first ??= page;
    rows.push(...page.rows);
    if (rows.length >= page.total || page.rows.length < PAGE) break;
  }
  const extra = await listing;
  const open = extra.rows.filter((r) => r.status === "open").length;
  // Testnet rows stay in `rows` and leave the totals.
  const testnet = rows.filter((r) => !countedRow(r));
  const testnetOpen = testnet.filter((r) => r.status === "open").length;
  return {
    ...first!,
    rows: [...rows, ...extra.rows],
    total: first!.total - testnet.length + extra.rows.length,
    open: first!.open - testnetOpen + open,
    closed: first!.closed - (testnet.length - testnetOpen) + extra.rows.length - open,
    listingFailed: extra.failed,
  };
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
  readerIp?: string,
): Promise<{ read: WalletFamilyRead; positions: WalletPosition[] }> {
  const t0 = Date.now();
  const byId = new Map(rows.map((r) => [r.positionId, r]));
  const positions = (await f.shape(rows)).map((p) => {
    // A position the shaping split from a row (a Comet of an Arbitrum read)
    // takes the family's first row's kind, then its own debt's.
    const row = byId.get(p.positionId) ?? rows[0];
    const kind = (p.debtUsd ?? 0) > 0 && kindOfRow(row) === "deposits" ? "loans" : kindOfRow(row);
    return { ...p, kind };
  });
  const open = positions.filter((p) => p.status === "open");
  const rest = positions.filter((p) => p.status !== "open");
  let head: HeadResult = { positions: open, reads: 0 };
  let error: string | undefined;
  const readable = open.filter((p) => !p.notRead);
  if (f.head && readable.length > 0) {
    try {
      const remaining = deadline - Date.now();
      head = await withBudget(Math.max(500, remaining), (signal) =>
        f.head!(open, address, signal, walletApiWait(remaining), { rows, readerIp }),
      );
    } catch (err) {
      error = publicErrorMessage(err);
      head = { positions: open.map((p) => (p.notRead ? p : { ...p, headRead: "failed" as const })), reads: 0 };
    }
  }
  // A head read that finds debt on a stored deposit makes it a loan.
  const headKinded = head.positions.map((p) =>
    p.headRead === "read" && p.kind === "deposits" && (p.debtUsd ?? 0) > 0 ? { ...p, kind: "loans" as const } : p,
  );
  const all = [...headKinded, ...rest];
  return {
    positions: all,
    read: {
      id: f.id,
      name: f.name,
      chain: f.chain,
      positions: all.length,
      open: headKinded.length,
      headRead: headOf(headKinded),
      ms: Date.now() - t0,
      reads: head.reads,
      error,
    },
  };
}

/** The protocols the rows name, in the read's order, with their row counts. */
function heldOf(rows: WalletSummaryRow[]): WalletRead["held"] {
  return WALLET_PROTOCOLS.map((p) => ({
    slug: p.slug,
    name: p.name,
    positions: rows.filter((r) => r.family === p.slug).length,
  })).filter((p) => p.positions > 0);
}

/** `protocol`: read that protocol's families alone (ui-jobs 738); the summary
 *  route still answers every row, which names the others for the pill. */
export async function readWalletUncached(
  address: string,
  readerIp?: string,
  opts: { protocol?: string } = {},
): Promise<WalletRead> {
  const t0 = Date.now();
  const deadline = t0 + WALLET_BUDGET_MS;
  let summary: Summary;
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
      error: publicErrorMessage(err),
      protocol: opts.protocol,
      held: [],
    };
  }
  const serverMs = Date.now() - t0;
  const held = heldOf(summary.rows);
  const reading = opts.protocol ? WALLET_FAMILIES.filter((f) => f.summaryFamily === opts.protocol) : WALLET_FAMILIES;
  const groups = reading
    .map((f) => ({
      f,
      rows: summary.rows.filter((r) => takesRow(f, r)),
    }))
    .filter((g) => g.rows.length > 0);
  const settled = await Promise.allSettled(groups.map((g) => readFamily(g.f, g.rows, address, deadline, readerIp)));
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
        error: publicErrorMessage(s.reason),
      });
    }
  });
  // A listing read that did not answer: its module's part says so.
  const failed = summary.listingFailed.filter((x) => !opts.protocol || x.module.summaryFamily === opts.protocol);
  for (const { module: f, what, error, heldOnly } of failed) {
    // A fork's deposit read stops the total only for a wallet holding on that fork.
    const total = heldOnly && !held.some((h) => h.slug === f.summaryFamily) ? { total: false as const } : {};
    families.push({
      id: f.id,
      name: f.name,
      chain: f.chain,
      positions: 0,
      open: 0,
      headRead: "failed",
      ms: serverMs,
      reads: 0,
      error,
      unanswered: { family: f.summaryFamily, what, ...total },
    });
  }
  return {
    address,
    positions,
    families,
    total: opts.protocol ? groups.reduce((s, g) => s + g.rows.length, 0) : summary.total,
    readAt: Math.floor(Date.now() / 1000),
    serverMs,
    ms: Date.now() - t0,
    protocol: opts.protocol,
    held,
    ...(failed.length ? { partial: failed.map((x) => x.what) } : {}),
  };
}

// 60 s per address, and one read at a time per address: a page and its route
// asking together share the read.
const cache = new Map<string, { at: number; read: Promise<WalletRead> }>();

export function readWallet(address: string, readerIp?: string, opts: { protocol?: string } = {}): Promise<WalletRead> {
  const key = `${address.toLowerCase()}:${opts.protocol ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < WALLET_CACHE_MS) return hit.read;
  const read = readWalletUncached(address.toLowerCase(), readerIp, opts);
  cache.set(key, { at: Date.now(), read });
  // A failed summary read, or one missing a listing read, is not kept.
  void read.then((r) => {
    if (r.error || r.partial) cache.delete(key);
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
    const empty = { address: key, positions: [], families: [], total: 0, open: 0, closed: 0, moved: 0, chains: [] };
    let summary: Summary;
    try {
      summary = await withBudget(WALLET_BUDGET_MS, (signal) => readSummary(key, signal, readerIp));
    } catch (err) {
      const error = publicErrorMessage(err);
      return { ...empty, readAt: Math.floor(Date.now() / 1000), ms: Date.now() - t0, error };
    }
    const positions: WalletCountsPosition[] = [];
    const taken = new Set<WalletSummaryRow>();
    for (const f of WALLET_FAMILIES) {
      if (f.head) continue;
      const rows = summary.rows.filter((r) => takesRow(f, r));
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
      if (!taken.has(r) && countedRow(r))
        positions.push({
          chain: r.chain,
          family: r.family,
          positionId: r.positionId,
          status: walletRowStatus(r),
          href: r.href,
        });
    }
    const families = new Map<string, WalletCountsFamily>();
    for (const p of positions) {
      const k = `${p.chain}:${p.family}`;
      const fam = families.get(k) ?? { chain: p.chain, family: p.family, positions: 0, open: 0, closed: 0, moved: 0 };
      fam.positions += 1;
      if (p.status === "open") fam.open += 1;
      else if (p.status === "moved") fam.moved += 1;
      else fam.closed += 1;
      families.set(k, fam);
    }
    const open = positions.filter((p) => p.status === "open").length;
    const moved = positions.filter((p) => p.status === "moved").length;
    return {
      address: key,
      positions,
      families: [...families.values()],
      total: positions.length,
      open,
      closed: positions.length - open - moved,
      moved,
      chains: [...new Set(positions.map((p) => p.chain))],
      readAt: Math.floor(Date.now() / 1000),
      ms: Date.now() - t0,
      ...(summary.listingFailed.length ? { partial: summary.listingFailed.map((x) => x.what) } : {}),
    };
  })();
  countsCache.set(key, { at: Date.now(), read });
  void read.then((r) => {
    if (r.error || r.partial) countsCache.delete(key);
  });
  if (countsCache.size > 500) {
    for (const [k, v] of countsCache) if (Date.now() - v.at >= WALLET_CACHE_MS) countsCache.delete(k);
  }
  return read;
}
