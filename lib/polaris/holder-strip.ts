// Polaris's adapter onto the shared holder strip — what a wallet search states
// about the wallet above its own CDP cards.
//
// A pure function of the two responses the listing already holds: the rows the
// search returned (`/api/polaris/positions?wallet=…`) and the ONE market-board
// read the listing makes per page load (`/api/chain/polaris/markets`, the same
// read every card's approximate ratio comes from). It fetches nothing.
//
// THE UNITS DECIDE THE GRAMMAR. Collateral is pETH in both markets, so the
// wallet's collateral is a quantity and is stated exactly, with its value at the
// protocol's own feed beneath it. Debt is USDp in one market and GOLDp — a troy
// ounce of gold — in the other, so a wallet borrowing in both has no debt figure
// that isn't a valuation: that headline is stated in dollars, marked ≈, with the
// two legs named beneath. A wallet borrowing in one market only gets its debt
// exactly, in that market's own token, because there is nothing to convert.
//
// THE COUNTS ARE THE WHOLE WALLET; THE TOTALS ARE THE PAGE. While the wallet's
// `pagination.total` fits one page the two are the same set, and the strip sums
// the rows. Past that they are not, and a sum over one page of a longer list is
// the paging trap — so the strip states the count, says why the totals are
// absent, and never quietly sums a slice.

import type { HolderLeg, HolderStripProps } from "@/components/shared/holder-strip";
import type { PolarisPositionSummary } from "@/lib/sources/api/polaris-positions";
// Type-only — lib/sources/chain/* is server-only, and an `import type` is
// erased before the client bundle is built (the position card does the same).
import type { PolarisMarketsChainResponse } from "@/lib/sources/chain/polaris-position";
import { POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import { polarisPositionHref } from "@/lib/polaris/routes";
import { formatNumber, formatUsdValue } from "@/lib/utils/format";
import {
  holderCollProv,
  holderCollUsdProv,
  holderDebtSumProv,
  holderDebtValueProv,
  listingIcrProv,
} from "@/lib/polaris/live-provenance";

/** The ≈ on the wallet's debt, in one sentence — the same gesture the listing
 *  card's ratio wears, saying what the figure is and what is not in it. */
const DEBT_TIP =
  "An estimate: the wallet's open CDPs' last stated debts, USDp at one dollar and GOLDp at the gold price the protocol's own feed stated at the latest read. Interest since each CDP's last touch and any PSM share are not in it.";

/** Why a wallet has no ratio of its own. */
const NEAREST_TIP =
  "Each CDP is liquidated on its own ratio; the wallet has no ratio of its own. This is the open CDP closest to its market's minimum.";

const plural = (n: number, one: string, many: string): string => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** The counts sentence — the protocol's own noun, and the market spread stated
 *  only where it is a fact (a wallet holding in one market is not "across both
 *  markets"). */
function countsLine(
  counts: { open: number; closed: number; liquidated: number },
  openMarkets: Set<PolarisMarket>,
): string {
  const spread =
    openMarkets.size > 1
      ? " across both markets"
      : openMarkets.size === 1
        ? ` in the ${POLARIS_MARKET_CONFIG[[...openMarkets][0]].stable.symbol} market`
        : "";
  const head =
    counts.open > 0
      ? `This wallet holds ${plural(counts.open, "open CDP", "open CDPs")}${spread}`
      : "This wallet holds no open CDPs";
  const closed = counts.closed > 0 ? ` and has closed ${counts.closed.toLocaleString("en-US")}` : "";
  const liq =
    counts.liquidated > 0
      ? `; ${counts.liquidated.toLocaleString("en-US")} ${counts.liquidated === 1 ? "was" : "were"} liquidated`
      : "";
  return `${head}${closed}${liq}.`;
}

/** Build the strip for a wallet search's page of Polaris rows.
 *
 *  `total` is the wallet's own `pagination.total`; `perPage` the page size the
 *  listing asks for. `markets` is the board read — without it (or with a stale
 *  one) nothing here can be priced, and the caller does not mount the strip. */
export function polarisHolderStrip(
  rows: PolarisPositionSummary[],
  total: number,
  markets: PolarisMarketsChainResponse,
  perPage: number,
): HolderStripProps {
  const counts = {
    open: rows.filter((r) => r.status === "open").length,
    closed: rows.filter((r) => r.status === "closed").length,
    liquidated: rows.filter((r) => r.status === "liquidated").length,
  };
  const truncated = total > perPage;

  if (truncated) {
    // The rows are a slice of the wallet, so neither the per-status counts nor
    // any sum over them is a statement about the wallet. State the one figure
    // that is — how many it holds — and say why the rest is absent.
    return {
      countsLine: `This wallet holds ${plural(total, "CDP", "CDPs")}.`,
      counts: { open: 0, closed: 0, liquidated: 0 },
      legs: [],
      truncated: true,
      note: `Totals are stated for wallets holding up to ${perPage.toLocaleString("en-US")} positions; this one holds ${total.toLocaleString("en-US")}.`,
    };
  }

  const open = rows.filter((r) => r.status === "open");
  const boardFor = (m: string) => markets.markets.find((b) => b.market === m);

  // ── the collateral: pETH in both markets, so a quantity ──────────────────
  const coll = open.reduce((sum, r) => sum + r.coll, 0);
  // pETH has one price on this protocol — both markets read the same bonding
  // curve and the same ETH/USD medianiser, and the board carries it on each.
  const pethUsd = (boardFor("usdp") ?? markets.markets[0])?.price.pethUsd ?? null;
  const legs: HolderLeg[] = [];
  if (coll > 0) {
    legs.push({
      id: "collateral",
      label: "Total collateral",
      value: `${formatNumber(coll)} pETH`,
      approx: false,
      prov: holderCollProv(),
      footnote:
        pethUsd != null
          ? {
              text: `${formatUsdValue(coll * pethUsd)} by the protocol's feed · testnet`,
              prov: holderCollUsdProv(),
            }
          : undefined,
    });
  }

  // ── the debt: one token or two, and the grammar follows ──────────────────
  const debtByMarket = new Map<PolarisMarket, number>();
  for (const r of open) {
    if (r.debt > 0) debtByMarket.set(r.market, (debtByMarket.get(r.market) ?? 0) + r.debt);
  }
  if (debtByMarket.size === 1) {
    // One market: the sum is a quantity of that market's own token. Nothing to
    // convert, so nothing to approximate.
    const [market, amount] = [...debtByMarket][0];
    legs.push({
      id: "debt",
      label: "Total debt",
      value: `${formatNumber(amount)} ${POLARIS_MARKET_CONFIG[market].stable.symbol}`,
      approx: false,
      prov: holderDebtSumProv(market),
    });
  } else if (debtByMarket.size > 1) {
    // Two markets, two units: the only sum that exists is a valued one.
    let usd = 0;
    const parts: string[] = [];
    for (const [market, amount] of debtByMarket) {
      const symbol = POLARIS_MARKET_CONFIG[market].stable.symbol;
      // USDp is a dollar by construction; GOLDp is a troy ounce of gold, at
      // the gold price the market's own feed carries.
      const unitUsd = market === "usdp" ? 1 : (boardFor(market)?.price.xauUsd ?? null);
      if (unitUsd == null) continue;
      usd += amount * unitUsd;
      parts.push(`${formatNumber(amount)} ${symbol}`);
    }
    legs.push({
      id: "debt",
      label: "Total debt",
      value: formatUsdValue(usd),
      approx: true,
      tip: DEBT_TIP,
      prov: holderDebtValueProv(),
      footnote: { text: parts.join(" · ") },
    });
  }

  // ── nearest its floor: the open CDP whose ratio sits closest to its own
  //    minimum. Ranked by ratio ÷ minimum, because the two markets' floors can
  //    differ (defensive mode lifts one of them and not the other) and 130%
  //    against 115% is further from the floor than 160% against 150%. ────────
  let nearest: HolderStripProps["nearest"];
  let closest = Infinity;
  for (const r of open) {
    if (!(r.debt > 0) || !(r.coll > 0)) continue;
    const board = boardFor(r.market);
    if (!board) continue;
    const min = board.defensiveMode ? board.defensiveMcr : board.mcr;
    const ratio = (r.coll * board.price.pethInDebt) / r.debt;
    const headroom = ratio / min;
    if (headroom >= closest) continue;
    closest = headroom;
    nearest = {
      href: polarisPositionHref(r.market, r.cdpId),
      label: `${r.market}/${r.cdpId}`,
      ratioPct: ratio * 100,
      minPct: min * 100,
      approx: true,
      tip: NEAREST_TIP,
      prov: listingIcrProv(r.market),
    };
  }

  return {
    countsLine: countsLine(counts, new Set(open.map((r) => r.market))),
    counts,
    legs,
    nearest,
    truncated: false,
  };
}
