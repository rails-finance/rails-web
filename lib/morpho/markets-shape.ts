// Morpho Blue market roster — the shape one loan token's markets take.
// ----------------------------------------------------------------------------
// The protocol view groups every market by the token it measures in; this
// module decides what a reader is shown INSIDE one of those groups, and it is
// pure arithmetic over rows the loader already read, so both the overview and
// the per-token page can share it without a second read.
//
// A loan token's markets are not a list of equals. Three things sit in them:
//
//   • MATERIAL markets — the ones carrying the token's book. Shown as rows.
//   • FAMILIES — runs of markets that differ from each other by nothing but
//     their oracle: the same collateral, the same loan-to-value, one IRM,
//     created in one sitting. Blue keys a market on the hash of its
//     parameters, so anyone can mint N "different" markets from one pair by
//     naming N oracles. On Base one actor minted 720 cbBTC/GMORPHO markets in
//     twenty-two minutes, and every one now sits at 100% utilisation with a
//     book that has compounded past the amount of cbBTC that exists. Listing
//     them as 720 rows is repetition that hides the one fact worth stating;
//     they are shown as one entry with the rows behind it.
//   • DUST — funded markets too small to matter to the token's book, and
//     NEVER-FUNDED markets that carry only the parameters they were born
//     with. Both stay on the page, counted, behind a disclosure.
//
// The thresholds are stated here once: a family is FAMILY_MIN or more
// markets on one (collateral, lltv) pair; a market is material when it holds
// at least MATERIAL_SHARE of the group's book with the families taken out —
// taken out because a family's compounded book would otherwise set a bar
// that every real market in the group fails (the cbBTC group's real markets
// hold 34 cbBTC against the family's 2,997,096).

import type {
  MorphoLoanGroup,
  MorphoMarketChainResponse,
  MorphoMarketRow,
  MorphoMarketsChainResponse,
} from "@/lib/sources/chain/morpho-markets";
import type { MorphoOracleFeed } from "@/lib/api/fetch-morpho-position";

/** Markets on one (collateral, lltv) pair before they are one family, not N rows. */
export const FAMILY_MIN = 10;
/** A funded market's share of the group's remaining book below which it is dust. */
export const MATERIAL_SHARE = 0.001;
/** Below this many funded markets outside any family there is no tail worth
 *  cutting — the reader sees every one. */
const TAIL_FROM = 12;

export interface MorphoMarketFamily {
  collateralToken: string;
  collateralSymbol: string | null;
  collateralNamed: boolean;
  lltv: number;
  /** Biggest book first — the loader's own order within a group. */
  markets: MorphoMarketRow[];
  totalSupply: number;
  totalBorrow: number;
  /** Distinct oracles across the family — the one parameter that varies. */
  oracles: number;
  /** Distinct interest-rate models — one, in every family seen so far. */
  irms: number;
  firstBlock: number;
  lastBlock: number;
  /** Every market in the family sits at (or within rounding of) 100% utilisation. */
  allPinned: boolean;
}

/** Never-funded markets on one (collateral, lltv) pair — the parameters they
 *  were born with are all they have, so N of them on the same pair are one
 *  line with a count, not N chips. */
export interface MorphoEmptyRun {
  /** The address every market in the run shares — null for the idle run.
   *  Two token contracts can carry the same symbol, so a list key needs this,
   *  not `collateralSymbol`. */
  collateralToken: string | null;
  collateralSymbol: string | null;
  collateralNamed: boolean;
  lltv: number;
  count: number;
}

export interface MorphoLoanGroupShape {
  material: MorphoMarketRow[];
  families: MorphoMarketFamily[];
  dust: MorphoMarketRow[];
  /** Never-funded, run together by (collateral, lltv); `emptiesCount` is the
   *  number of markets behind the runs. */
  empties: MorphoEmptyRun[];
  emptiesCount: number;
  /** The group's stored book with the families taken out — what the material
   *  threshold is measured against. */
  restSupply: number;
  restBorrow: number;
  familySupply: number;
  familyBorrow: number;
}

function shapeLoanGroup(g: MorphoLoanGroup): MorphoLoanGroupShape {
  const funded = g.markets.filter((m) => m.totalSupply > 0);
  const emptyRows = g.markets.filter((m) => m.totalSupply === 0);
  const runs = new Map<string, MorphoEmptyRun>();
  for (const m of emptyRows) {
    const key = `${m.isIdle ? "idle" : m.collateralToken}:${m.lltv}`;
    const run = runs.get(key);
    if (run) run.count++;
    else
      runs.set(key, {
        collateralToken: m.isIdle ? null : m.collateralToken,
        collateralSymbol: m.collateralSymbol,
        collateralNamed: m.collateralNamed,
        lltv: m.lltv,
        count: 1,
      });
  }
  const empties = [...runs.values()].sort((a, b) => b.count - a.count || b.lltv - a.lltv);

  const byPair = new Map<string, MorphoMarketRow[]>();
  for (const m of funded) {
    const key = `${m.collateralToken}:${m.lltv}`;
    const run = byPair.get(key);
    if (run) run.push(m);
    else byPair.set(key, [m]);
  }

  const families: MorphoMarketFamily[] = [];
  const inFamily = new Set<string>();
  for (const run of byPair.values()) {
    if (run.length < FAMILY_MIN) continue;
    run.sort((a, b) => b.totalSupply - a.totalSupply || a.createdBlock - b.createdBlock);
    for (const m of run) inFamily.add(m.id);
    const head = run[0];
    families.push({
      collateralToken: head.collateralToken,
      collateralSymbol: head.collateralSymbol,
      collateralNamed: head.collateralNamed,
      lltv: head.lltv,
      markets: run,
      totalSupply: run.reduce((s, m) => s + m.totalSupply, 0),
      totalBorrow: run.reduce((s, m) => s + m.totalBorrow, 0),
      oracles: new Set(run.map((m) => m.oracle ?? "")).size,
      irms: new Set(run.map((m) => m.irm ?? "")).size,
      firstBlock: Math.min(...run.map((m) => m.createdBlock)),
      lastBlock: Math.max(...run.map((m) => m.createdBlock)),
      allPinned: run.every((m) => (m.utilization ?? 0) >= 0.999),
    });
  }
  families.sort((a, b) => b.markets.length - a.markets.length || b.totalSupply - a.totalSupply);

  const rest = funded.filter((m) => !inFamily.has(m.id));
  const restSupply = rest.reduce((s, m) => s + m.totalSupply, 0);
  const restBorrow = rest.reduce((s, m) => s + m.totalBorrow, 0);
  const familySupply = families.reduce((s, f) => s + f.totalSupply, 0);
  const familyBorrow = families.reduce((s, f) => s + f.totalBorrow, 0);

  const isMaterial = (m: MorphoMarketRow) =>
    m.totalSupply >= restSupply * MATERIAL_SHARE || (restBorrow > 0 && m.totalBorrow >= restBorrow * MATERIAL_SHARE);
  const material = rest.length < TAIL_FROM ? rest : rest.filter(isMaterial);
  const dust = rest.length < TAIL_FROM ? [] : rest.filter((m) => !isMaterial(m));

  return {
    material,
    families,
    dust,
    empties,
    emptiesCount: emptyRows.length,
    restSupply,
    restBorrow,
    familySupply,
    familyBorrow,
  };
}

export interface MorphoCollateralShare {
  collateralToken: string | null;
  symbol: string;
  markets: number;
  totalSupply: number;
}

/** What a loan token is lent AGAINST: its funded markets' collaterals, biggest
 *  book first, one entry per collateral token. Idle markets (no collateral)
 *  are named as such rather than dropped. */
export function collateralShares(g: MorphoLoanGroup): MorphoCollateralShare[] {
  const by = new Map<string, MorphoCollateralShare>();
  for (const m of g.markets) {
    if (m.totalSupply <= 0) continue;
    const key = m.isIdle ? "idle" : m.collateralToken;
    const cur = by.get(key);
    if (cur) {
      cur.markets++;
      cur.totalSupply += m.totalSupply;
    } else {
      by.set(key, {
        collateralToken: m.isIdle ? null : m.collateralToken,
        symbol: m.isIdle ? "idle" : (m.collateralSymbol ?? `${m.collateralToken.slice(0, 6)}…`),
        markets: 1,
        totalSupply: m.totalSupply,
      });
    }
  }
  return [...by.values()].sort((a, b) => b.totalSupply - a.totalSupply || b.markets - a.markets);
}

// ── what crosses to the client ───────────────────────────────────────────────
// The views are client components for weight (see morpho-markets-view.tsx), and
// a client component's flight payload is its PROPS. The full response is the
// whole roster — 4,306 rows on Base, 3 MB serialised — and the overview draws
// none of them, so it is handed a summary per loan token and nothing else; the
// per-token page is handed its one group. Ambiguity (is this symbol unique on
// the roster?) is settled here, server-side, so the roster never has to travel
// for a question about it.

export interface MorphoLoanGroupSummary {
  loanToken: string;
  loanSymbol: string;
  loanNamed: boolean;
  amountsTrusted: boolean;
  loanDecimalsUnread?: true;
  /** More than one token on the roster answers this symbol. */
  ambiguous: boolean;
  markets: number;
  funded: number;
  borrowing: number;
  totalSupply: number;
  totalBorrow: number;
  loanTokenSupply: number | null;
  /** The top collaterals by book, and how many collaterals there are in all. */
  against: MorphoCollateralShare[];
  collaterals: number;
}

export type MorphoMarketsOverviewData = Omit<MorphoMarketsChainResponse, "groups"> & {
  groups: MorphoLoanGroupSummary[];
};

/** Symbols are not identifiers: several distinct tokens on each roster answer
 *  "USDC", so any group whose symbol is shared has to show its address too. */
function ambiguousSymbols(groups: readonly MorphoLoanGroup[]): Set<string> {
  const count = new Map<string, number>();
  for (const g of groups) count.set(g.loanSymbol, (count.get(g.loanSymbol) ?? 0) + 1);
  return new Set([...count.entries()].filter(([, n]) => n > 1).map(([s]) => s));
}

const AGAINST_SHOWN = 3;

export function overviewData(resp: MorphoMarketsChainResponse): MorphoMarketsOverviewData {
  const ambiguous = ambiguousSymbols(resp.groups);
  return {
    ...resp,
    groups: resp.groups.map((g) => {
      const against = collateralShares(g);
      return {
        loanToken: g.loanToken,
        loanSymbol: g.loanSymbol,
        loanNamed: g.loanNamed,
        amountsTrusted: g.amountsTrusted,
        ...(g.loanDecimalsUnread ? { loanDecimalsUnread: true as const } : {}),
        ambiguous: ambiguous.has(g.loanSymbol),
        markets: g.markets.length,
        funded: g.funded,
        borrowing: g.markets.filter((m) => m.totalBorrow > 0).length,
        totalSupply: g.totalSupply,
        totalBorrow: g.totalBorrow,
        loanTokenSupply: g.loanTokenSupply,
        against: against.slice(0, AGAINST_SHOWN),
        collaterals: against.length,
      };
    }),
  };
}

/** Everything the per-token page's client view draws, and nothing else: the
 *  group's header scalars plus its shape. The never-funded rows — 2,887 of
 *  the USDC group's 3,157 on Base — cross as runs with counts, not as rows. */
export type MorphoLoanTokenViewData = MorphoLoanGroupShape &
  Pick<
    MorphoLoanGroupSummary,
    | "loanToken"
    | "loanSymbol"
    | "loanNamed"
    | "amountsTrusted"
    | "loanDecimalsUnread"
    | "ambiguous"
    | "markets"
    | "funded"
    | "borrowing"
    | "totalSupply"
    | "totalBorrow"
    | "loanTokenSupply"
  >;

export function loanTokenViewData(resp: MorphoMarketsChainResponse, g: MorphoLoanGroup): MorphoLoanTokenViewData {
  return {
    loanToken: g.loanToken,
    loanSymbol: g.loanSymbol,
    loanNamed: g.loanNamed,
    amountsTrusted: g.amountsTrusted,
    ...(g.loanDecimalsUnread ? { loanDecimalsUnread: true as const } : {}),
    ambiguous: ambiguousSymbols(resp.groups).has(g.loanSymbol),
    markets: g.markets.length,
    funded: g.funded,
    borrowing: g.markets.filter((m) => m.totalBorrow > 0).length,
    totalSupply: g.totalSupply,
    totalBorrow: g.totalBorrow,
    loanTokenSupply: g.loanTokenSupply,
    ...shapeLoanGroup(g),
  };
}

// ── one market's page ────────────────────────────────────────────────────────

/** What one market's header draws — the row the roster view would draw for it,
 *  plus the read's block and time and the oracle's price and feeds. Nothing
 *  else of the response crosses to the client (the weight rule). */
export interface MorphoMarketViewData {
  blockNumber: number;
  timestamp: number;
  totalsSource: MorphoMarketChainResponse["totalsSource"];
  market: MorphoMarketRow;
  loanNamed: boolean;
  oraclePrice: number | null;
  oracleFeeds: MorphoOracleFeed[] | null;
  oraclePublishedAt: number | null;
  /** `rateAtTarget(id)` as stored, per second in WAD; null off the AdaptiveCurveIRM. */
  rateAtTarget: string | null;
}

/** The header's props from a successful read; null when the read failed. */
export function marketViewData(resp: MorphoMarketChainResponse): MorphoMarketViewData | null {
  if (resp.chainStale || !resp.market) return null;
  return {
    blockNumber: resp.blockNumber,
    timestamp: resp.timestamp,
    totalsSource: resp.totalsSource,
    market: resp.market,
    loanNamed: resp.loanNamed,
    oraclePrice: resp.oraclePrice,
    oracleFeeds: resp.oracleFeeds,
    oraclePublishedAt: resp.oraclePublishedAt,
    rateAtTarget: resp.rateAtTarget,
  };
}

// ── the roster table (R1) ────────────────────────────────────────────────────

/** A repeated pair's market: the feeds its oracle names, with each feed's
 *  `description()`. `readable` is false where none of the oracle's feed
 *  getters answered (an oracle of another shape). */
export interface MorphoPriceSource {
  oracle: string | null;
  feeds: { slot: string; address: string; description: string | null }[];
  readable: boolean;
}

/** What lib/sources/chain/morpho-roster-reads.ts adds to the rows, by
 *  lowercased market id. */
export interface MorphoRosterMarks {
  /** Markets at the rate ceiling, with the stored rate at target (per second,
   *  WAD) and the seconds it was adapted over. */
  ceiling: Record<string, { stored: string; elapsed: number }>;
  priceSources: Record<string, MorphoPriceSource>;
}

/** A roster row: the market, and what the roster knows beside it. */
export interface MorphoRosterRow extends MorphoMarketRow {
  /** A vault on Rails's roster names the market in its withdraw queue. */
  lent?: true;
  ceiling?: { stored: string; elapsed: number };
  priceSource?: MorphoPriceSource;
}

/** One loan token on the roster table: its summary and its rows, the markets
 *  that carry its book (the per-token page's `material`) and the markets that
 *  carry the book a vault lends into (the same MATERIAL_SHARE over the funded
 *  markets a vault lends into, families included, since a vault's choice is
 *  not a minted repeat), each marked `lent` where a vault lends into it. The
 *  rest are counted, and open on the token's page. */
export interface MorphoRosterGroup extends MorphoLoanGroupSummary {
  rows: MorphoRosterRow[];
  /** The funded markets outside any family: the group order's first key. */
  own: number;
  /** The same count over the rows a vault lends into, for the default view. */
  lentOwn: number;
}

export type MorphoRosterData = Omit<MorphoMarketsChainResponse, "groups"> & {
  /** Loan tokens with a funded market, most funded markets outside a family first. */
  groups: MorphoRosterGroup[];
  /** Loan tokens none of whose markets has ever held supply. */
  unfundedTokens: number;
  /** Whether rows carry `lent`: "read" from the vault directory's queues,
   *  "none" where Rails has no vault roster on the chain, "failed" where the
   *  directory did not answer. Only "read" filters the default view. */
  vaults: "read" | "none" | "failed";
};

/** The roster table's props: each funded loan token with its material
 *  markets, marked where a vault lends into them (`lent`, a set of lowercased
 *  ids; null where it is not known). The never-funded and the dust stay on the
 *  server, counted. */
export function rosterData(
  resp: MorphoMarketsChainResponse,
  lent: Set<string> | null,
  vaults: MorphoRosterData["vaults"],
): MorphoRosterData {
  const overview = overviewData(resp);
  const isLent = (m: MorphoMarketRow) => lent != null && m.totalSupply > 0 && lent.has(m.id.toLowerCase());
  // Ordered by the funded markets outside any family, so a token whose count
  // is one pair minted many times (Base's 720 cbBTC markets) does not lead.
  const groups = resp.groups
    .flatMap((g, i) => {
      if (g.funded === 0) return [];
      const shape = shapeLoanGroup(g);
      const inFamily = new Set(shape.families.flatMap((f) => f.markets.map((m) => m.id)));
      const lentFunded = g.markets.filter(isLent);
      const lentSupply = lentFunded.reduce((n, m) => n + m.totalSupply, 0);
      const lentBorrow = lentFunded.reduce((n, m) => n + m.totalBorrow, 0);
      const carries = (m: MorphoMarketRow) =>
        lentFunded.length < TAIL_FROM ||
        m.totalSupply >= lentSupply * MATERIAL_SHARE ||
        (lentBorrow > 0 && m.totalBorrow >= lentBorrow * MATERIAL_SHARE);
      const shown = new Set([...shape.material, ...lentFunded.filter(carries)].map((m) => m.id));
      const rows: MorphoRosterRow[] = g.markets
        .filter((m) => shown.has(m.id))
        .map((m) => (isLent(m) ? { ...m, lent: true as const } : m));
      const own = g.funded - inFamily.size;
      const lentOwn = rows.filter((m) => m.lent && !inFamily.has(m.id)).length;
      return [{ ...overview.groups[i], rows, own, lentOwn }];
    })
    .sort((a, b) => b.own - a.own || b.funded - a.funded);
  return { ...resp, groups, unfundedTokens: resp.groups.length - groups.length, vaults };
}

/** Every row the roster ships, for the marks read. */
export const rosterRows = (d: MorphoRosterData): MorphoRosterRow[] => d.groups.flatMap((g) => g.rows);

/** The roster with its marks on the rows. */
export function withRosterMarks(d: MorphoRosterData, marks: MorphoRosterMarks): MorphoRosterData {
  return {
    ...d,
    groups: d.groups.map((g) => ({
      ...g,
      rows: g.rows.map((m) => {
        const id = m.id.toLowerCase();
        const ceiling = marks.ceiling[id];
        const priceSource = marks.priceSources[id];
        return ceiling || priceSource
          ? { ...m, ...(ceiling ? { ceiling } : {}), ...(priceSource ? { priceSource } : {}) }
          : m;
      }),
    })),
  };
}
