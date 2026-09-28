import { resolvePrice, type PriceEntry } from "@/lib/aave/prices";
import { pricesHaveLoaded, UNPRICED_DUST_TOKENS } from "@/lib/aave-v4/unpriced";
import type { ReserveStats } from "@/lib/aave-v4/spoke-cards";

/** Lifetime USD totals that mirror the tower chart's breakdown-legend rows
 *  (Deposited / + Interest earned / Withdrawn / Liquidated / In Protocol;
 *  Borrowed / + Accrued interest / Repaid / Liquidated / Outstanding). Lives
 *  apart from the chart component so the footnote narration can quote the
 *  figures the towers draw without pulling the whole chart module into the
 *  page's initial bundle (the chart is a lazy chunk) — surplus-included always
 *  (a lifetime summary doesn't honour the chart's hide-surplus display toggle).
 *
 *  RULE (TO-DO-ui-jobs §98): the interest a chain balance carries beyond what
 *  the position's events moved is its own leg (`reserveLifetime`), so Deposited
 *  and Borrowed are, in each token, the sums of the supply and borrow events,
 *  and deposited + earned = withdrawn + liquidated + held, borrowed + accrued =
 *  repaid + liquidated + owed. In USD the inflow is the holding at the live
 *  price plus the outflows at their block prices, less the interest: the two
 *  sides then meet in dollars too, and a price move between the
 *  events sits in the inflow figure (it cannot be interest). A reserve whose
 *  events cannot account for its balance (no inflow indexed, or a balance below
 *  what the events leave), and every reserve on a page whose timeline holds a
 *  window of the history, takes no interest leg.
 *
 *  RULE: Rails never invents a price (rails-ops TO-DO-ui-jobs §40). A holding
 *  whose asset no source prices contributes NO USD leg here; its symbol comes
 *  back in `unpricedSymbols` so the narration that quotes these figures can say
 *  the totals are partial and name what is missing. */
export interface AaveLifetimeTotals {
  depositedUsd: number;
  supplyInterestUsd: number;
  withdrawnUsd: number;
  liquidatedCollUsd: number;
  inProtocolUsd: number;
  borrowedUsd: number;
  debtInterestUsd: number;
  repaidUsd: number;
  liquidatedDebtUsd: number;
  outstandingUsd: number;
  hasDebtHistory: boolean;
  /** Assets with a live balance and no price source — left out of every USD
   *  figure above, so anything that prints one has to name them. */
  unpricedSymbols: string[];
}

/** Below this many tokens an interest leg is zero: share rounding. */
const INTEREST_DUST_TOKENS = 1e-9;

/** One side's inflow and interest for a reserve. */
export interface LifetimeLeg {
  /** Held now: the chain balance, else the events' net. */
  held: number;
  heldUsd: number;
  /** "Deposited" / "Borrowed (all time)" in USD: held + outflows − interest. */
  inflowUsd: number;
  /** Interest in the token's units, and in USD (0 unpriced). */
  interest: number;
  interestUsd: number;
}

function leg(
  current: number | undefined,
  inflow: number,
  outflow: number,
  outflowUsd: number,
  price: number | null,
  complete: boolean,
): LifetimeLeg {
  const held = current ?? Math.max(0, inflow - outflow);
  const heldUsd = price == null ? 0 : held * price;
  // interest = held − (in − out): what the balance carries beyond the events.
  const interest = current == null ? null : current - (inflow - outflow);
  const accounted =
    complete && interest != null && inflow > 0 && interest > -INTEREST_DUST_TOKENS && interest <= inflow;
  const i = interest != null && accounted && interest >= INTEREST_DUST_TOKENS ? interest : 0;
  // A settled reserve's interest left with its outflows, so it takes their
  // average price and the settled figures stay fixed; an open one the live price.
  const settled = held <= INTEREST_DUST_TOKENS && outflow > 0;
  const interestPrice = settled ? outflowUsd / outflow : price;
  const interestUsd = interestPrice == null ? 0 : i * interestPrice;
  return { held, heldUsd, inflowUsd: Math.max(0, heldUsd + outflowUsd - interestUsd), interest: i, interestUsd };
}

/** A reserve's two lifetime legs: supply (Deposited + Interest earned) and
 *  debt (Borrowed + Accrued interest). The tower chart and the totals below
 *  both read this, so the rows and the narration state one set of figures. */
export function reserveLifetime(
  r: ReserveStats,
  price: number | null,
  historyComplete = true,
): { supply: LifetimeLeg; debt: LifetimeLeg } {
  return {
    supply: leg(
      r.currentSupplied,
      r.supplied,
      r.withdrawn + r.liquidatedCollateral,
      r.withdrawnUsd + r.liquidatedCollateralUsd,
      price,
      historyComplete,
    ),
    debt: leg(
      r.currentBorrowed,
      r.borrowed,
      r.repaid + r.liquidatedDebt,
      r.repaidUsd + r.liquidatedDebtUsd,
      price,
      historyComplete,
    ),
  };
}

export function computeAaveLifetimeTotals(
  reserves: ReserveStats[],
  prices?: Record<string, PriceEntry | number>,
  historyComplete = true,
): AaveLifetimeTotals {
  const t: AaveLifetimeTotals = {
    depositedUsd: 0,
    supplyInterestUsd: 0,
    withdrawnUsd: 0,
    liquidatedCollUsd: 0,
    inProtocolUsd: 0,
    borrowedUsd: 0,
    debtInterestUsd: 0,
    repaidUsd: 0,
    liquidatedDebtUsd: 0,
    outstandingUsd: 0,
    hasDebtHistory: false,
    unpricedSymbols: [],
  };
  // Nothing is known to be unpriced until the price map has answered at all.
  const mapAnswered = pricesHaveLoaded(prices);
  for (const r of reserves) {
    // Holdings at the live price; flows at the price stored for their block.
    const price = resolvePrice(r.symbol, prices);
    const { supply, debt } = reserveLifetime(r, price, historyComplete);
    if (mapAnswered && price == null && (supply.held > UNPRICED_DUST_TOKENS || debt.held > UNPRICED_DUST_TOKENS)) {
      t.unpricedSymbols.push(r.symbol);
    }
    t.inProtocolUsd += supply.heldUsd;
    t.withdrawnUsd += r.withdrawnUsd;
    t.liquidatedCollUsd += r.liquidatedCollateralUsd;
    t.depositedUsd += supply.inflowUsd;
    t.supplyInterestUsd += supply.interestUsd;
    t.outstandingUsd += debt.heldUsd;
    t.repaidUsd += r.repaidUsd;
    t.liquidatedDebtUsd += r.liquidatedDebtUsd;
    t.borrowedUsd += debt.inflowUsd;
    t.debtInterestUsd += debt.interestUsd;
    if (r.borrowed > 0 || r.repaid > 0 || r.liquidatedDebt > 0) t.hasDebtHistory = true;
  }
  return t;
}
