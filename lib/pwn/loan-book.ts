// PWN loan book — the protocol view's data (server-only).
// ----------------------------------------------------------------------------
// PWN has no pools, no rate curve and no shared ledger: the protocol IS its
// loans, each a pairwise fixed-term agreement. So the protocol view's subject
// is the LOAN BOOK — every loan the SimpleLoan deployments ever struck,
// reduced to the book's own axes: how many stand open, what secures them,
// what they owe, the terms the parties fixed, and how the settled ones ended.
//
// Source: the LIVE indexed backend (mv_pwn_positions via rails-server's
// /api/pwn/positions — the same lane the listing reads), fetched whole. The
// book is small by nature (P2P loans are struck one at a time) and every
// aggregation here needs every row, so one full fetch is the right read.
// Symbol resolution and amount scaling reuse buildPwnPositionRows — the one
// place collateral identity is decided (Token Bundler catalog override,
// on-chain symbol()/name() for the rest); this file derives nothing of its
// own about what a token is.
//
// No USD anywhere: PWN has no protocol oracle (the two parties set the
// price), so sums exist only WITHIN a token. The view never adds two tokens
// together, and there is deliberately no headline "total book value".
//
// SERVER-ONLY: buildPwnPositionRows resolves token metadata via the chain rpc
// module, so import this only from server pages / route handlers.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { isPwnBundler } from "@/lib/pwn/asset-catalog";
import { loanCost, loanDueAt, pwnLoanState, viewFromSummary } from "@/lib/pwn/economics";
import { buildPwnPositionRows, type PwnPositionSummary, type RawPwnPositionRow } from "@/lib/sources/api/pwn-positions";
import type { PwnTokenCategory } from "@/lib/shared/types/event-shape";

/** The book's credit side, per credit token (same-token sums only). */
export interface PwnBookCreditLine {
  address: string;
  symbol: string;
  named: boolean;
  /** Loans ever denominated in this token. */
  loans: number;
  /** Loans not yet settled: running, or defaulted and not yet claimed. */
  open: number;
  /** Σ principal over every loan in this token (lifetime). */
  principalAdvanced: number;
  /** Σ principal over the unsettled loans. */
  principalOutstanding: number;
  /** Σ owed at the deadline over the unsettled loans: a v1.1 repay total, or a
   *  v1.2/v1.3 principal plus the interest its rate accrues to the deadline.
   *  Null when any of them has no figure — a partial sum would understate it. */
  repayOwed: number | null;
}

/** The book's collateral side, per collateral asset. */
export interface PwnBookCollateralLine {
  address: string;
  symbol: string;
  named: boolean;
  category: PwnTokenCategory | null;
  /** The protocol's own Token Bundler ERC-1155 (multi-asset collateral). */
  isBundle: boolean;
  loans: number;
  /** Running, before the deadline. */
  open: number;
  repaid: number;
  /** Defaulted: claimed by the lender, or past the deadline and not yet claimed. */
  defaulted: number;
  /** Of `defaulted`, the loans not yet claimed. */
  unclaimed: number;
}

export interface PwnBookSpread {
  min: number;
  median: number;
  max: number;
}

/** The terms the parties fixed, as distributions over the whole book. */
export interface PwnBookTerms {
  /** Loans whose terms carry both a principal and a fixed repay total (v1.1). */
  loansWithFixedTotal: number;
  /** (repay − principal) ÷ principal, as a fraction, over those loans. */
  interestShare: PwnBookSpread | null;
  /** Deadline − creation, in days, over loans where both are indexed. */
  termDays: PwnBookSpread | null;
  /** Loans carrying a non-zero accruing APR (v1.2/v1.3 shape). */
  accruingLoans: number;
  /** Their APR, as a fraction a year (0.6 = 60%). */
  accruingApr: PwnBookSpread | null;
}

export interface PwnLoanBook {
  stale: boolean;
  /** One rule (lib/pwn/economics.ts `pwnLoanState`): `open` is running, before
   *  its deadline; `defaulted` counts every loan whose deadline passed unpaid,
   *  claimed or not; `unclaimed` is the part of it no one has claimed yet. */
  totals: { loans: number; open: number; repaid: number; defaulted: number; unclaimed: number };
  credit: PwnBookCreditLine[];
  collateral: PwnBookCollateralLine[];
  terms: PwnBookTerms;
  /** The most recent creation block in the book (the stamp's anchor). */
  latestCreatedBlock: number | null;
  /** When the book was reduced (unix seconds) — the clock pastDue compares to. */
  asOf: number;
  /** Loans per SimpleLoan version ("v11" → 35), oldest version first: which of
   *  PWN's loan contracts the index covers. */
  versions: { version: string; loans: number }[];
}

const spread = (xs: number[]): PwnBookSpread | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  const median = s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return { min: s[0], median, max: s[s.length - 1] };
};

// The lapse-moment helper lives in economics.ts (client-safe) — the card's
// Due column and this server-side reduction key on the one definition.

const emptyBook = (asOf: number): PwnLoanBook => ({
  stale: true,
  totals: { loans: 0, open: 0, repaid: 0, defaulted: 0, unclaimed: 0 },
  credit: [],
  collateral: [],
  terms: { loansWithFixedTotal: 0, interestShare: null, termDays: null, accruingLoans: 0, accruingApr: null },
  latestCreatedBlock: null,
  asOf,
  versions: [],
});

/** Fetch the whole indexed loan set and reduce it to the book. */
export async function loadPwnLoanBook(): Promise<PwnLoanBook> {
  const asOf = Math.floor(Date.now() / 1000);
  const base = process.env.RAILS_API_URL;
  if (!base) {
    console.error("pwn loan book: RAILS_API_URL is not set");
    return emptyBook(asOf);
  }

  let loans: PwnPositionSummary[];
  try {
    const readerIp = await readerIpFromHeaders();
    // Paged, not asked for whole: the route caps `limit` at 100 and returns a
    // capped answer indistinguishable from a complete one, so a single call would
    // reduce "the book, whole" from its first 100 loans the day the book grows
    // past that — with nothing on the page saying so.
    const rows: RawPwnPositionRow[] = [];
    for (let i = 0; i < 200; i++) {
      const res = await fetch(`${base}/api/pwn/positions?sortOrder=asc&limit=100&offset=${i * 100}`, {
        ...createAuthFetchOptions(undefined, readerIp),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`backend ${res.status} ${res.statusText}`);
      const raw = (await res.json()) as { rows?: RawPwnPositionRow[]; total?: number };
      const page = raw.rows ?? [];
      rows.push(...page);
      if (page.length < 100 || rows.length >= (raw.total ?? rows.length)) break;
    }
    loans = await buildPwnPositionRows(rows);
  } catch (err) {
    console.error("pwn loan book: fetch failed", err);
    return emptyBook(asOf);
  }

  const totals = { loans: loans.length, open: 0, repaid: 0, defaulted: 0, unclaimed: 0 };
  const aprs: number[] = [];
  const creditByToken = new Map<string, PwnBookCreditLine & { openMissingRepay: boolean; repaySum: number }>();
  const collByAsset = new Map<string, PwnBookCollateralLine>();
  const interestShares: number[] = [];
  const termDaysList: number[] = [];
  let loansWithFixedTotal = 0;
  let accruingLoans = 0;
  let latestCreatedBlock: number | null = null;
  const byVersion = new Map<string, number>();

  for (const l of loans) {
    const state = pwnLoanState({ ...l, extendedDueAt: l.latestDefaultAt }, asOf);
    const unsettled = state === "running" || state === "unclaimed";
    if (state === "running") totals.open += 1;
    else if (state === "repaid") totals.repaid += 1;
    else {
      totals.defaulted += 1;
      if (state === "unclaimed") totals.unclaimed += 1;
    }
    if (l.version) byVersion.set(l.version, (byVersion.get(l.version) ?? 0) + 1);
    if (l.createdBlock != null && (latestCreatedBlock == null || l.createdBlock > latestCreatedBlock))
      latestCreatedBlock = l.createdBlock;

    // Credit side — grouped by the token the loan is denominated in.
    if (l.credit) {
      const key = l.credit.address;
      const line = creditByToken.get(key) ?? {
        address: l.credit.address,
        symbol: l.credit.symbol,
        named: l.credit.named,
        loans: 0,
        open: 0,
        principalAdvanced: 0,
        principalOutstanding: 0,
        repayOwed: null,
        openMissingRepay: false,
        repaySum: 0,
      };
      line.loans += 1;
      line.principalAdvanced += l.credit.amount;
      if (unsettled) {
        line.open += 1;
        line.principalOutstanding += l.credit.amount;
        const cost = loanCost(viewFromSummary(l));
        if (cost != null) line.repaySum += cost.total;
        else line.openMissingRepay = true;
      }
      creditByToken.set(key, line);
    }

    // Collateral side — grouped by the asset that secures the loan.
    if (l.collateral) {
      const key = l.collateral.address;
      const line = collByAsset.get(key) ?? {
        address: l.collateral.address,
        symbol: l.collateral.symbol,
        named: l.collateral.named,
        category: l.collateral.category,
        isBundle: isPwnBundler(l.collateral.address),
        loans: 0,
        open: 0,
        repaid: 0,
        defaulted: 0,
        unclaimed: 0,
      };
      line.loans += 1;
      if (state === "running") line.open += 1;
      else if (state === "repaid") line.repaid += 1;
      else {
        line.defaulted += 1;
        if (state === "unclaimed") line.unclaimed += 1;
      }
      collByAsset.set(key, line);
    }

    // Terms distributions — over the loans whose terms state each figure.
    if (l.repayAmount != null && l.credit != null && l.credit.amount > 0) {
      loansWithFixedTotal += 1;
      interestShares.push(Math.max(0, l.repayAmount - l.credit.amount) / l.credit.amount);
    }
    if (l.accruingInterestApr != null && l.accruingInterestApr > 0) {
      accruingLoans += 1;
      aprs.push(l.accruingInterestApr / 10_000);
    }
    const dueAt = loanDueAt(l);
    if (dueAt != null && l.createdAt != null && dueAt > l.createdAt) termDaysList.push((dueAt - l.createdAt) / 86400);
  }

  const credit: PwnBookCreditLine[] = [...creditByToken.values()]
    .map(({ openMissingRepay, repaySum, ...line }) => ({
      ...line,
      repayOwed: line.open > 0 && !openMissingRepay ? repaySum : null,
    }))
    .sort((a, b) => b.loans - a.loans);

  const collateral = [...collByAsset.values()].sort((a, b) => b.loans - a.loans);

  return {
    stale: false,
    totals,
    credit,
    collateral,
    terms: {
      loansWithFixedTotal,
      interestShare: spread(interestShares),
      termDays: spread(termDaysList),
      accruingLoans,
      accruingApr: spread(aprs),
    },
    latestCreatedBlock,
    asOf,
    versions: [...byVersion.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([version, n]) => ({ version, loans: n })),
  };
}
