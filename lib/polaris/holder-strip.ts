// Polaris's adapter onto the shared holder strip — what a wallet search states
// about the wallet above its own CDP cards.
//
// A pure function of the two responses the listing already holds: the rows the
// search returned (`/api/polaris/positions?wallet=…`) and the ONE market-board
// read the listing makes per page load (`/api/chain/polaris/markets`, the same
// read every card's approximate ratio comes from). It fetches nothing.
//
// THE UNITS DECIDE THE GRAMMAR. Collateral is pETH in both markets, so the
// wallet's collateral is a quantity of pETH, with its value at the protocol's
// own feed beneath it. Debt is USDp in one market and GOLDp — a troy ounce of
// gold — in the other, so a wallet borrowing in both has no debt figure that
// isn't a valuation: that headline is stated in dollars, with the two legs
// named beneath. A wallet borrowing in one market only gets its debt in that
// market's token.
//
// THE CARD'S FIGURE, AND THE CARD'S MARKS (ui-jobs 737). The rows are each
// CDP's last emitted figures: reward pETH and PSM shares move the collateral,
// and interest, stability gains and PSM shares the debt, between touches, and
// land only at the next one. The cards below draw the same figures without a
// ≈, so the legs draw the card's figure (compact, the token's icon, the USD
// line) and no ≈; the tip and the receipt say what built up since. Live
// per-row reads are a later item.
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
import { POLARIS_CORE, POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import { holderUsdReceipt, type UsdLeg } from "@/lib/shared/holder-usd-receipt";
import { formatNumber, formatUsdValue } from "@/lib/utils/format";
import { holderCollProv, holderDebtSumProv } from "@/lib/polaris/live-provenance";

const BOARD_VIA = "GET /api/chain/polaris/markets";
const TESTNET = "A Sepolia testnet figure: a test dollar.";

/** What each leg leaves out, in a sentence or two. */
const LEG_TIP = {
  collateral: "As of each open position's last touch. The reward pETH and PSM shares built up since are left out.",
  debt: "As of each open position's last touch. The interest, stability gains and PSM shares built up since are left out.",
  debtValued:
    "The open positions' debts as of each one's last touch, USDp at one dollar and GOLDp at the gold price the protocol's feed states. The interest, stability gains and PSM shares built up since are left out.",
} as const;

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
      ? `This wallet holds ${plural(counts.open, "open position", "open positions")}${spread}`
      : "This wallet holds no open positions";
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
  /** The answer's count of CDPs the wallet passed on, every page (ui-jobs 715). */
  passedOn = 0,
  /** The wallet the search names (an address or an ENS name), for the link. */
  wallet?: string,
): HolderStripProps {
  // A CDP the wallet passed on is not its holding: left out of the counts,
  // the sums and the count it holds. Whether the page is the whole answer is
  // read on the answer's total, moved ones in.
  const answerTruncated = total > perPage;
  const held = total - passedOn;
  rows = rows.filter((r) => !r.formerHold);
  const counts = {
    open: rows.filter((r) => r.status === "open").length,
    closed: rows.filter((r) => r.status === "closed").length,
    liquidated: rows.filter((r) => r.status === "liquidated").length,
  };
  const truncated = answerTruncated;

  if (truncated) {
    // The rows are a slice of the wallet, so neither the per-status counts nor
    // any sum over them is a statement about the wallet. State the one figure
    // that is — how many it holds — and say why the rest is absent.
    return {
      countsLine: `This wallet holds ${plural(held, "position", "positions")}.`,
      counts: { open: 0, closed: 0, liquidated: 0 },
      legs: [],
      truncated: true,
      positions: held,
      wallet,
      note: `Totals are stated for wallets holding up to ${perPage.toLocaleString("en-US")} positions; this one holds ${held.toLocaleString("en-US")}.`,
    };
  }

  const open = rows.filter((r) => r.status === "open");
  const boardFor = (m: string) => markets.markets.find((b) => b.market === m);
  // USDp is a dollar by construction; GOLDp is a troy ounce of gold, at the
  // gold price the market's own feed carries.
  const unitUsdOf = (m: PolarisMarket): number | null => (m === "usdp" ? 1 : (boardFor(m)?.price.xauUsd ?? null));
  const debtLeg = (m: PolarisMarket, amount: number): UsdLeg | null => {
    const price = unitUsdOf(m);
    if (price == null) return null;
    const token = POLARIS_MARKET_CONFIG[m].stable.symbol;
    const amountNote = `Σ last emitted debt of the wallet's open positions in the ${token} market`;
    return m === "usdp"
      ? {
          token,
          amount,
          amountNote,
          price,
          face: true,
          priceNote: "USDp's $1 face",
        }
      : {
          token,
          amount,
          amountNote,
          price,
          priceNote: "GOLDp / USD: a troy ounce of gold at the XAU/USD medianiser's previewExternalPrice()",
          priceContract: { name: "Polaris XAU/USD Medianiser", address: POLARIS_CORE.xauUsdMedianiser },
        };
  };

  // ── the collateral: pETH in both markets, so a quantity ──────────────────
  const coll = open.reduce((sum, r) => sum + r.coll, 0);
  // pETH has one price on this protocol — both markets read the same bonding
  // curve and the same ETH/USD medianiser, and the board carries it on each.
  const pethUsd = (boardFor("usdp") ?? markets.markets[0])?.price.pethUsd ?? null;
  const legs: HolderLeg[] = [];
  if (coll > 0) {
    const receipt =
      pethUsd != null
        ? holderUsdReceipt({
            what: "The wallet's collateral in USD",
            legs: [
              {
                token: "pETH",
                amount: coll,
                amountNote: "Σ last emitted collateral of the wallet's open positions",
                price: pethUsd,
                priceNote:
                  "pETH / USD: the bonding curve's currentPrice() × the ETH/USD medianiser's previewExternalPrice()",
                priceContract: { name: "Polaris bonding curve", address: POLARIS_CORE.bondingCurve },
              },
            ],
            block: markets.blockNumber,
            via: BOARD_VIA,
            caveat: TESTNET,
          })
        : null;
    legs.push({
      id: "collateral",
      label: "Total collateral",
      value: `${formatNumber(coll)} pETH`,
      approx: false,
      tip: LEG_TIP.collateral,
      prov: holderCollProv(),
      figure: {
        amount: coll,
        tokens: [{ symbol: "pETH" }],
        usd: receipt?.usd ?? null,
        usdProv: receipt?.prov,
      },
    });
  }

  // ── the debt: one token or two, and the grammar follows ──────────────────
  const debtByMarket = new Map<PolarisMarket, number>();
  for (const r of open) {
    if (r.debt > 0) debtByMarket.set(r.market, (debtByMarket.get(r.market) ?? 0) + r.debt);
  }
  if (debtByMarket.size === 1) {
    // One market: the sum is a quantity of that market's token, as of
    // each position's last touch.
    const [market, amount] = [...debtByMarket][0];
    legs.push({
      id: "debt",
      label: "Total debt",
      value: `${formatNumber(amount)} ${POLARIS_MARKET_CONFIG[market].stable.symbol}`,
      approx: false,
      tip: LEG_TIP.debt,
      prov: holderDebtSumProv(market),
      figure: (() => {
        const leg = debtLeg(market, amount);
        const receipt = leg
          ? holderUsdReceipt({
              what: "The wallet's debt in USD",
              legs: [leg],
              block: markets.blockNumber,
              via: BOARD_VIA,
              caveat: TESTNET,
            })
          : null;
        return {
          amount,
          tokens: [{ symbol: POLARIS_MARKET_CONFIG[market].stable.symbol }],
          usd: receipt?.usd ?? null,
          usdProv: receipt?.prov,
        };
      })(),
    });
  } else if (debtByMarket.size > 1) {
    // Two markets, two units: the only sum that exists is a valued one.
    const parts: { text: string; symbol: string }[] = [];
    const usdLegs: UsdLeg[] = [];
    for (const [market, amount] of debtByMarket) {
      const symbol = POLARIS_MARKET_CONFIG[market].stable.symbol;
      const leg = debtLeg(market, amount);
      if (!leg) continue;
      usdLegs.push(leg);
      parts.push({ text: `${formatNumber(amount)} ${symbol}`, symbol });
    }
    // A sum across tokens stands only where every token is priced: a total
    // of the priced ones alone would read as the whole.
    if (usdLegs.length === debtByMarket.size) {
      const receipt = holderUsdReceipt({
        what: "The wallet's debt in USD, across both markets",
        legs: usdLegs,
        block: markets.blockNumber,
        via: BOARD_VIA,
        caveat: `The two markets' debts are different tokens, so their sum exists only at a price. ${TESTNET}`,
      });
      legs.push({
        id: "debt",
        label: "Total debt",
        value: formatUsdValue(receipt.usd),
        approx: false,
        tip: LEG_TIP.debtValued,
        prov: receipt.prov,
        // Each market's amount with its token's icon, beneath the dollars
        // (ui-jobs 738).
        footnote: { text: parts.map((p) => p.text).join(" · "), parts },
        figure: {
          tokens: usdLegs.map((l) => ({ symbol: l.token })),
          usd: receipt.usd,
        },
      });
    } else {
      // A market's price missing: each market's debt stands, with no total.
      legs.push({
        id: "debt",
        label: "Total debt",
        value: [...debtByMarket]
          .map(([m, amount]) => `${formatNumber(amount)} ${POLARIS_MARKET_CONFIG[m].stable.symbol}`)
          .join(" · "),
        approx: false,
        tip: LEG_TIP.debt,
        prov: {
          kind: "chain",
          pclass: "emitted",
          summary:
            "The wallet's open positions' debt, market by market — the sum of each position's last emitted debt in its market's unit. A market's price is missing, so the two carry no total in dollars.",
          via: `${BOARD_VIA} · Σ last emitted debt, per market`,
        },
      });
    }
  }

  return {
    countsLine: countsLine(counts, new Set(open.map((r) => r.market))),
    counts,
    legs,
    truncated: false,
    positions: held,
    wallet,
  };
}
