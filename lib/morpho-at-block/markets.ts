// The market pages of Morpho Blue read on visit, Arc's and Optimism's (rails-ops
// ui-jobs 577 and 578): rails-server's markets and market answers in the shapes
// the shared Morpho pages draw (lib/morpho/roster.tsx, lib/morpho/product.tsx),
// so /arc/morpho/markets, /optimism/morpho/markets and a market's page are
// Ethereum's, Base's and Arbitrum's pages on the chain's read.
// Totals are as Blue stored them, the roster's rule
// (lib/sources/chain/morpho-markets.ts). Pure.

import type {
  MorphoLoanGroup,
  MorphoMarketChainResponse,
  MorphoMarketRow,
  MorphoMarketsChainResponse,
} from "@/lib/sources/chain/morpho-markets";
import type { MorphoOracleFeed } from "@/lib/api/fetch-morpho-position";
import type { MorphoRosterMarks } from "@/lib/morpho/markets-shape";
import { atRateCeiling, fullyBorrowedShare } from "@/lib/vaults/illiquid";
import type {
  MorphoAtBlockMarket,
  MorphoAtBlockMarketRead,
  MorphoAtBlockMarketsRead,
  MorphoAtBlockToken,
} from "@/lib/morpho-at-block/types";
import { ZERO_ADDRESS } from "@/lib/morpho-at-block/types";
import { listedMarkets } from "@/lib/morpho-at-block/unlisted";

const YEAR = 31_536_000;
const scale = (raw: string, decimals: number) => Number(raw) / 10 ** decimals;

function row(
  m: MorphoAtBlockMarket,
  createdBlock: number,
  tokens: Record<string, MorphoAtBlockToken>,
): MorphoMarketRow | null {
  const s = m.state;
  if (!s) return null;
  const loan = tokens[m.loanToken];
  const coll = m.collateralToken === ZERO_ADDRESS ? undefined : tokens[m.collateralToken];
  const loanUnread = loan?.decimals == null;
  const loanDecimals = loan?.decimals ?? 18;
  const supply = Number(s.totalSupplyAssets);
  const borrow = Number(s.totalBorrowAssets);
  const utilization = supply > 0 ? borrow / supply : null;
  const borrowApr = m.borrowRate != null ? (Number(m.borrowRate) / 1e18) * YEAR : null;
  const fee = Number(s.fee) / 1e18;
  const lltv = Number(m.lltv) / 1e18;
  const isIdle = m.collateralToken === ZERO_ADDRESS && m.oracle === ZERO_ADDRESS && m.irm === ZERO_ADDRESS;
  return {
    id: m.id,
    loanToken: m.loanToken,
    collateralToken: m.collateralToken,
    oracle: m.oracle === ZERO_ADDRESS ? null : m.oracle,
    irm: m.irm === ZERO_ADDRESS ? null : m.irm,
    loanSymbol: loan?.symbol ?? m.loanToken.slice(0, 6),
    loanDecimals,
    collateralSymbol: coll?.symbol ?? null,
    collateralNamed: coll?.symbol != null,
    amountsTrusted: !loanUnread,
    ...(loanUnread ? { loanDecimalsUnread: true as const } : {}),
    lltv,
    liquidationIncentive: lltv > 0 ? Math.min(1.15, 1 / (1 - 0.3 * (1 - lltv))) : null,
    isIdle,
    totalSupply: scale(s.totalSupplyAssets, loanDecimals),
    totalBorrow: scale(s.totalBorrowAssets, loanDecimals),
    utilization,
    borrowApr,
    supplyApr: borrowApr != null && utilization != null ? borrowApr * utilization * (1 - fee) : null,
    fee,
    lastUpdate: Number(s.lastUpdate),
    createdBlock,
  };
}

/** The markets answer as the roster's response. Every figure is chain-read at `head.block`. */
export function atBlockMarketsResponse(r: MorphoAtBlockMarketsRead): MorphoMarketsChainResponse {
  // The markets rails-server marks unlisted (a test token, no supply ever) stay off the list and
  // its counts; each keeps its page.
  const rows = listedMarkets(r.markets).flatMap((m) => {
    const x = row(m, m.createdBlock, r.tokens);
    return x ? [x] : [];
  });
  const byLoan = new Map<string, MorphoMarketRow[]>();
  for (const x of rows) byLoan.set(x.loanToken, [...(byLoan.get(x.loanToken) ?? []), x]);
  const groups: MorphoLoanGroup[] = [...byLoan.entries()].map(([loanToken, markets]) => {
    markets.sort((a, b) => b.totalSupply - a.totalSupply || a.createdBlock - b.createdBlock);
    const t = r.tokens[loanToken];
    const decimals = t?.decimals ?? 18;
    const supply = r.loanTokenSupply[loanToken];
    return {
      loanToken,
      loanSymbol: t?.symbol ?? loanToken.slice(0, 6),
      loanDecimals: decimals,
      loanNamed: t?.symbol != null,
      amountsTrusted: t?.decimals != null,
      ...(t?.decimals == null ? { loanDecimalsUnread: true as const } : {}),
      markets,
      totalSupply: markets.reduce((n, m) => n + m.totalSupply, 0),
      totalBorrow: markets.reduce((n, m) => n + m.totalBorrow, 0),
      funded: markets.filter((m) => m.totalSupply > 0).length,
      loanTokenSupply: supply == null ? null : scale(supply, decimals),
    };
  });
  groups.sort((a, b) => b.funded - a.funded || b.markets.length - a.markets.length);
  const lltvs = new Map<number, { markets: number; funded: number }>();
  for (const x of rows) {
    const c = lltvs.get(x.lltv) ?? { markets: 0, funded: 0 };
    c.markets++;
    if (x.totalSupply > 0) c.funded++;
    lltvs.set(x.lltv, c);
  }
  return {
    blockNumber: r.head.block,
    totalsSource: "chain",
    censusBlock: r.list.toBlock,
    groups,
    summary: {
      total: rows.length,
      funded: rows.filter((x) => x.totalSupply > 0).length,
      borrowed: rows.filter((x) => x.totalBorrow > 0).length,
      idleCapital: rows.filter((x) => x.totalSupply > 0 && x.totalBorrow === 0).length,
      neverFunded: rows.filter((x) => x.totalSupply === 0).length,
      idleMarkets: rows.filter((x) => x.isIdle).length,
      loanTokens: groups.length,
      lltvs: [...lltvs.entries()].sort((a, b) => b[0] - a[0]).map(([lltv, c]) => ({ lltv, ...c })),
    },
    chainStale: false,
  };
}

/** The roster's rate-ceiling marks from the answer's rateAtTarget, at the head's time. Price
 *  sources for repeated pairs are left out: the markets answer names no oracle feeds. */
export function atBlockRosterMarks(r: MorphoAtBlockMarketsRead): MorphoRosterMarks {
  const marks: MorphoRosterMarks = { ceiling: {}, priceSources: {} };
  for (const m of r.markets) {
    if (!m.state || m.rateAtTarget == null) continue;
    const supply = Number(m.state.totalSupplyAssets);
    const u = supply > 0 ? Number(m.state.totalBorrowAssets) / supply : null;
    if (u == null || !fullyBorrowedShare(u)) continue;
    const elapsed = r.head.time - Number(m.state.lastUpdate);
    if (atRateCeiling(BigInt(m.rateAtTarget), u, elapsed))
      marks.ceiling[m.id.toLowerCase()] = { stored: m.rateAtTarget, elapsed };
  }
  return marks;
}

/** One market's answer as the market page's response. */
export function atBlockMarketResponse(r: MorphoAtBlockMarketRead): MorphoMarketChainResponse {
  const m = r.market;
  const loan = r.tokens[m.loanToken];
  const coll = r.tokens[m.collateralToken];
  const x = row(m, 0, r.tokens);
  const collateralDecimals = coll?.decimals ?? 18;
  const feeds: MorphoOracleFeed[] | null =
    r.oracleFeeds && r.oracleFeeds.length && r.oracleFeeds.every((f) => f.answer != null && f.updatedAt != null)
      ? r.oracleFeeds.map((f) => ({
          slot: f.slot,
          address: f.address,
          description: f.description,
          roundId: f.roundId ?? "0",
          answer: f.answer!,
          decimals: f.decimals,
          updatedAt: Number(f.updatedAt),
        }))
      : null;
  return {
    params: {
      id: m.id,
      loanToken: m.loanToken,
      collateralToken: m.collateralToken,
      oracle: m.oracle,
      irm: m.irm,
      lltv: m.lltv,
      createdBlock: 0,
    },
    blockNumber: r.head.block,
    timestamp: r.head.time,
    totalsSource: "chain",
    market: x,
    loanNamed: loan?.symbol != null,
    collateralDecimals,
    oraclePrice:
      m.price != null && loan?.decimals != null && coll?.decimals != null && m.price !== "0"
        ? Number(m.price) / 10 ** (36 + loan.decimals - coll.decimals)
        : null,
    oracleFeeds: feeds,
    oraclePublishedAt: feeds ? Math.min(...feeds.map((f) => f.updatedAt)) : null,
    rateAtTarget: m.rateAtTarget,
    chainStale: x == null,
  };
}
