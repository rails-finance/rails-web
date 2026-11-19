import type { Provenance } from "@/components/shared/provenance";
import { aaveV4NoFigureLine } from "@/lib/aave-v4/price-notes";
import { resolvePrice, type PriceEntry } from "@/lib/aave/prices";
import { shownUsd } from "@/lib/shared/shown-usd";
import { listSymbols, pricesHaveLoaded, unpricedFloor } from "@/lib/aave-v4/unpriced";
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
 *  window of the history, takes no interest leg. The interest has a dollar
 *  figure only while all of it is still held (LifetimeLeg.interestUsd); once
 *  any of the side has left, neither it nor the inflow apart from it has one,
 *  and the side states held + outflows together (ui-jobs 743).
 *
 *  RULE: Rails never invents a price (rails-ops TO-DO-ui-jobs §40). A holding
 *  whose asset no source prices contributes NO USD leg here; its symbol comes
 *  back in `unpricedSymbols` so the narration that quotes these figures can say
 *  the totals are partial and name what is missing. */
export interface AaveLifetimeTotals {
  /** Null where a reserve's interest has no figure (LifetimeLeg.interestUsd). */
  depositedUsd: number | null;
  supplyInterestUsd: number | null;
  /** Supplied + earned: held + outflows, each a shown product. */
  suppliedGrossUsd: number;
  withdrawnUsd: number;
  liquidatedCollUsd: number;
  inProtocolUsd: number;
  borrowedUsd: number | null;
  debtInterestUsd: number | null;
  borrowedGrossUsd: number;
  repaidUsd: number;
  liquidatedDebtUsd: number;
  outstandingUsd: number;
  hasDebtHistory: boolean;
  /** Assets with a live balance and no price source — left out of every USD
   *  figure above, so anything that prints one has to name them. */
  unpricedSymbols: string[];
  /** Every asset a figure above cannot stand on: a held balance or an outflow
   *  with no on-chain price. Where any, the figures are not drawn (ui-jobs 743). */
  noFigure: string[];
}

/** Below this many tokens an interest leg is zero: share rounding. */
const INTEREST_DUST_TOKENS = 1e-9;

/** One side's inflow and interest for a reserve. Every dollar figure is a
 *  sum of shown products (ui-jobs 743); null where one cannot be. */
export interface LifetimeLeg {
  /** Held now: the chain balance, else the events' net. */
  held: number;
  /** held × the latest block's price as shown, to the cent; null unpriced. */
  heldUsd: number | null;
  /** What has passed through the side: held + every outflow, each at its own
   *  block's price, to the cent. The side bar's figure. */
  grossUsd: number | null;
  /** "Deposited" / "Borrowed (all time)" in USD: gross − interest; null
   *  where the interest has no figure. */
  inflowUsd: number | null;
  /** Interest in the token's units. */
  interest: number;
  /** The interest at the latest block's price, to the cent, while all of it
   *  is still held; null once any of the side has left (see below). */
  interestUsd: number | null;
}

const cents = (v: number): number => Math.round(v * 100) / 100;

function leg(
  current: number | undefined,
  inflow: number,
  outflow: number,
  outflowUsd: number,
  price: number | null,
  complete: boolean,
  floor: number,
): LifetimeLeg {
  const held = current ?? Math.max(0, inflow - outflow);
  // A balance at or below the residue floor (unpricedFloor) is held at $0.
  const heldUsd = held <= floor ? 0 : price == null ? null : shownUsd(held, price);
  // interest = held − (in − out): what the balance carries beyond the events.
  const interest = current == null ? null : current - (inflow - outflow);
  const accounted =
    complete && interest != null && inflow > 0 && interest > -INTEREST_DUST_TOKENS && interest <= inflow;
  const i = interest != null && accounted && interest >= INTEREST_DUST_TOKENS ? interest : 0;
  // The interest is priced only while all of it is still held, at the latest
  // block's on-chain price. Once anything has left, some of the interest may
  // have left with it at the outflows' blocks, and the events do not say how
  // much at which: no price stands at its own block, so it has no figure.
  const interestUsd = i === 0 ? 0 : outflow > 0 || price == null ? null : shownUsd(i, price);
  const grossUsd = heldUsd == null ? null : cents(heldUsd + outflowUsd);
  return {
    held,
    heldUsd,
    grossUsd,
    inflowUsd: grossUsd == null || interestUsd == null ? null : Math.max(0, cents(grossUsd - interestUsd)),
    interest: i,
    interestUsd,
  };
}

/** A reserve's two lifetime legs: supply (Deposited + Interest earned) and
 *  debt (Borrowed + Accrued interest). The tower chart and the totals below
 *  both read this, so the rows and the narration state one set of figures. */
export function reserveLifetime(
  r: ReserveStats,
  price: number | null,
  historyComplete = true,
): { supply: LifetimeLeg; debt: LifetimeLeg } {
  const floor = unpricedFloor(r);
  return {
    supply: leg(
      r.currentSupplied,
      r.supplied,
      r.withdrawn + r.liquidatedCollateral,
      r.withdrawnUsd + r.liquidatedCollateralUsd,
      price,
      historyComplete,
      floor,
    ),
    debt: leg(
      r.currentBorrowed,
      r.borrowed,
      r.repaid + r.liquidatedDebt,
      r.repaidUsd + r.liquidatedDebtUsd,
      price,
      historyComplete,
      floor,
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
    suppliedGrossUsd: 0,
    withdrawnUsd: 0,
    liquidatedCollUsd: 0,
    inProtocolUsd: 0,
    borrowedUsd: 0,
    debtInterestUsd: 0,
    borrowedGrossUsd: 0,
    repaidUsd: 0,
    liquidatedDebtUsd: 0,
    outstandingUsd: 0,
    hasDebtHistory: false,
    unpricedSymbols: [],
    noFigure: [],
  };
  // Nothing is known to be unpriced until the price map has answered at all.
  const mapAnswered = pricesHaveLoaded(prices);
  for (const r of reserves) {
    // Holdings at the live price; flows at the price stored for their block.
    const price = resolvePrice(r.symbol, prices);
    const { supply, debt } = reserveLifetime(r, price, historyComplete);
    if (mapAnswered && price == null && (supply.held > unpricedFloor(r) || debt.held > unpricedFloor(r))) {
      t.unpricedSymbols.push(r.symbol);
    }
    const add = (a: number | null, b: number | null) => (a == null || b == null ? null : cents(a + b));
    t.inProtocolUsd = cents(t.inProtocolUsd + (supply.heldUsd ?? 0));
    t.withdrawnUsd = cents(t.withdrawnUsd + r.withdrawnUsd);
    t.liquidatedCollUsd = cents(t.liquidatedCollUsd + r.liquidatedCollateralUsd);
    t.suppliedGrossUsd = cents(t.suppliedGrossUsd + (supply.grossUsd ?? 0));
    t.depositedUsd = add(t.depositedUsd, supply.inflowUsd);
    t.supplyInterestUsd = add(t.supplyInterestUsd, supply.interestUsd);
    t.outstandingUsd = cents(t.outstandingUsd + (debt.heldUsd ?? 0));
    t.repaidUsd = cents(t.repaidUsd + r.repaidUsd);
    t.liquidatedDebtUsd = cents(t.liquidatedDebtUsd + r.liquidatedDebtUsd);
    t.borrowedGrossUsd = cents(t.borrowedGrossUsd + (debt.grossUsd ?? 0));
    t.borrowedUsd = add(t.borrowedUsd, debt.inflowUsd);
    t.debtInterestUsd = add(t.debtInterestUsd, debt.interestUsd);
    if (r.borrowed > 0 || r.repaid > 0 || r.liquidatedDebt > 0) t.hasDebtHistory = true;
  }
  t.noFigure = [
    ...new Set([
      ...t.unpricedSymbols,
      ...reserves.filter((r) => (r.unpricedFlows ?? []).length > 0).map((r) => r.symbol),
    ]),
  ];
  return t;
}

/** Whether the lifetime figures may be drawn (ui-jobs 743): only once the
 *  oracle read has answered and every holding and outflow has an on-chain
 *  price; otherwise the line that stands in their place. */
export function lifetimeFiguresState(
  read: "pending" | "failed" | "answered",
  noFigure: readonly string[],
): { draw: true } | { draw: false; line: string } {
  if (read === "pending") return { draw: false, line: aaveV4NoFigureLine({ missing: [], state: "pending" }) };
  if (read === "failed") return { draw: false, line: aaveV4NoFigureLine({ missing: [], state: "failed" }) };
  if (noFigure.length > 0)
    return {
      draw: false,
      line: `No dollar figures here: ${listSymbols([...noFigure])} ${noFigure.length === 1 ? "has" : "have"} no on-chain price, so the breakdown gives those balances in their assets' units`,
    };
  return { draw: true };
}

/** Where each interest row's amount comes from, by side. */
export const INTEREST_AMOUNT_NOTE = {
  supply:
    "the spoke's supply balance at the latest block, less what the position's events supplied: all of it still held",
  debt: "the spoke's debt at the latest block, less what the position's events borrowed: all of it still owed",
} as const;

/** Why an interest figure, or an all-time figure set apart from the interest,
 *  is not drawn. The receipt holds the reason in full; the Explanation's
 *  bullet gives it in a clause. */
const SETTLED_INTEREST_NOTE =
  "some of the interest may have left with the withdrawals, repayments or liquidations, each at its own block, and the events do not say how much left at which, so the interest has no on-chain price at its own block";

export function noInterestFigureProv(what: string): Provenance {
  return {
    kind: "derived",
    summary: `${what} — no dollar figure: ${SETTLED_INTEREST_NOTE}.`,
    via: "no on-chain price at the interest's own block",
  };
}

/** A side bar's figure: what has passed through the side, every holding and
 *  outflow a shown product, to the cent; null where the side has any asset or
 *  outflow with no on-chain price, so no bar is drawn from a partial. */
export function lifetimeSideBarUsd(gross: readonly (number | null)[], excluded: readonly string[]): number | null {
  if (excluded.length > 0 || gross.some((g) => g == null)) return null;
  return cents(gross.reduce<number>((s, g) => s + (g ?? 0), 0));
}
