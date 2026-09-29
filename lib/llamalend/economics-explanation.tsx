// Curve LlamaLend — the ChainTruthTower Explanation pane + its "?" FAQ.
// Narrates the same figures computeLlamalendEconomics feeds the tower
// (lib/llamalend/economics.ts): a status-lead sentence plus bullets built from
// the data, in the Liquity V2 / Aave V4 grammar
// (components/protocol/liquity/trove-economics.tsx, aaveV4EconomicsContent in
// lib/shared/learn-more-content.ts).

import type { ReactNode } from "react";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { formatCompact, formatNumber } from "@/lib/utils/format";
import { fmtColl, fmtPrice } from "@/lib/llamalend/event-figures";
import { formatCompactUsd } from "@/components/shared/economics-chart-primitives";

const LLAMALEND_DOC_URL = "https://docs.curve.finance/lending/overview/";

function sideTotal(lines: TowerLine[], valued: boolean): number {
  return lines.reduce((s, l) => s + Math.max(0, valued ? (l.usd ?? 0) : l.amount), 0);
}

function soleSymbol(lines: TowerLine[]): string | null {
  const symbols = new Set(lines.filter((l) => l.amount > 0).map((l) => l.symbol));
  return symbols.size === 1 ? [...symbols][0] : null;
}

function lineFig(l: TowerLine, valued: boolean): string {
  return valued && l.usd != null ? formatCompactUsd(l.usd) : `${formatCompact(l.amount)}`;
}

function fmt(n: number, valued: boolean, symbol: string | null): string {
  return valued ? formatCompactUsd(n) : symbol ? `${formatCompact(n)} ${symbol}` : formatCompact(n);
}

export function llamalendEconomicsExplanation(
  data: ChainTruthTowerData,
  /** The collateral price the dollar figures use (today's oracle), with its
   *  units, where the tower is valued. */
  pricing?: { price: number; collateralSymbol: string; borrowedSymbol: string } | null,
  /** On a position in its bands now: the collateral the AMM sold net of
   *  buy-backs (llamalendSoldInBands) and the converted balance it holds. */
  inBands?: { sold: number; converted: number } | null,
): ReactNode {
  const valued = data.valued;
  const bullets: string[] = [];

  const deposited = data.collateral.lifetimeInflow;
  const lostLines = data.collateral.exited.filter((l) => l.key === "coll-lost");
  const withdrawn = sideTotal(
    data.collateral.exited.filter((l) => l.key !== "coll-lost" && l.key !== "coll-sold"),
    valued,
  );
  if (deposited > 0 || withdrawn > 0) {
    const symbol = soleSymbol([...data.collateral.current, ...data.collateral.exited]);
    const parts: string[] = [];
    if (deposited > 0) parts.push(`${fmt(deposited, valued, symbol)} added as collateral`);
    if (withdrawn > 0) parts.push(`${fmt(withdrawn, valued, symbol)} withdrawn`);
    bullets.push(`Over its life this position has had ${parts.join(" and ")}.`);
  }

  const borrowed = data.debt.lifetimeInflow;
  const repaid = sideTotal(data.debt.exited, valued);
  if (borrowed > 0 || repaid > 0) {
    const symbol = soleSymbol([...data.debt.current, ...data.debt.exited]);
    const parts: string[] = [];
    if (borrowed > 0) parts.push(`${fmt(borrowed, valued, symbol)} borrowed`);
    if (repaid > 0) parts.push(`${fmt(repaid, valued, symbol)} repaid`);
    bullets.push(`It has also had ${parts.join(" and ")}.`);
  }

  const paidInterest = data.debt.costs?.find((l) => l.key === "debt-interest-paid");
  if (paidInterest) {
    bullets.push(
      `The repayments exceed the borrowing by ${lineFig(paidInterest, valued)}${valued ? "" : ` ${paidInterest.symbol}`}: that is the interest the loan paid before it closed.`,
    );
  }
  const accruedInterest = data.debt.interest;
  if (accruedInterest) {
    bullets.push(
      `${fmt(accruedInterest.amount, false, accruedInterest.symbol)}${valued && accruedInterest.usd != null ? ` (${formatCompactUsd(accruedInterest.usd)})` : ""} of interest has built up on what was borrowed and not repaid.`,
    );
  }

  const lost = lostLines[0];
  if (lost) {
    bullets.push(
      `${fmtColl(lost.amount)} ${lost.symbol}${valued && lost.usd != null ? ` (${formatCompactUsd(lost.usd)})` : ""} was lost to soft-liquidation: the AMM sold it while the price sat in the bands and did not buy it back.`,
    );
  }

  const liquidated = sideTotal(data.collateral.liquidated, valued) + sideTotal(data.debt.liquidated, valued);
  // A liquidated position's collateral side, token by token: deposited =
  // sold by the AMM + taken + withdrawn + held, and the borrowed token the
  // sales left in the position = taken with it + held.
  const soldLine = data.collateral.exited.find((l) => l.key === "coll-sold");
  const convInLine = (data.collateral.received ?? []).find((l) => l.key === "converted-in");
  if (soldLine && convInLine) {
    const cSym = soldLine.symbol;
    const bSym = convInLine.symbol;
    const amt = (lines: TowerLine[], key: string) =>
      lines.filter((l) => l.key === key).reduce((t, l) => t + l.amount, 0);
    const taken = amt(data.collateral.liquidated, "coll-taken");
    const convTaken = amt(data.collateral.liquidated, "converted-taken");
    const withdrawnC = amt(data.collateral.exited, "coll-withdrawn");
    const heldC = amt(data.collateral.current, "collateral");
    const heldB = amt(data.collateral.current, "converted");
    const deposited = soldLine.amount + taken + withdrawnC + heldC;
    const cParts = [
      `${fmtColl(soldLine.amount)} sold by the AMM`,
      ...(taken > 0 ? [`${fmtColl(taken)} taken in liquidation`] : []),
      ...(withdrawnC > 0 ? [`${fmtColl(withdrawnC)} withdrawn`] : []),
      ...(heldC > 0 ? [`${fmtColl(heldC)} held now`] : []),
    ];
    bullets.push(
      `In ${cSym}, the ${fmtColl(deposited)} deposited is ${cParts.join(" + ")}. The AMM's sales left ${formatNumber(convInLine.amount)} ${bSym} in the position, ${heldB > 0 ? `${formatNumber(convTaken)} taken in liquidation and ${formatNumber(heldB)} held now` : "all taken in liquidation"}.${
        valued
          ? ` The bars value the ${cSym} at today's price and the ${bSym} at about a dollar, so the sold ${cSym} and the ${bSym} it became differ by the price move since the sales.`
          : ""
      }`,
    );
  } else if (liquidated > 0) {
    bullets.push("Part of this position's collateral and debt was taken in a hard liquidation.");
  }

  const convertedLine = data.collateral.current.find((l) => l.key === "converted");
  const heldLine = data.collateral.current.find((l) => l.key === "collateral");
  if (!convertedLine) {
    bullets.push(
      "When the price falls into a position's bands, the AMM converts its collateral into the borrowed token band by band; this position isn't in its bands right now.",
    );
  }

  const currentColl = sideTotal(data.collateral.current, valued);
  const currentDebt = sideTotal([...data.debt.current, ...(data.debt.interest ? [data.debt.interest] : [])], valued);
  if (currentColl > 0 || currentDebt > 0) {
    const coll = fmt(currentColl, valued, soleSymbol(data.collateral.current));
    const debt = currentDebt > 0 ? ` against ${fmt(currentDebt, valued, soleSymbol(data.debt.current))} of debt` : "";
    // The card's Collateral figure is the collateral token alone; the tower's
    // counts the converted balance with it, so the split is stated.
    bullets.push(
      convertedLine && heldLine && currentColl > 0
        ? `Right now it holds ${coll} of collateral: ${lineFig(heldLine, valued)} of ${heldLine.symbol} and ${lineFig(convertedLine, valued)} of ${convertedLine.symbol.replace(" (converted)", "")} converted from it${debt ? `,${debt}` : ""}. The card's Collateral figure counts the ${heldLine.symbol} alone.`
        : currentColl > 0
          ? `Right now it holds ${coll} of collateral${debt}.`
          : `Right now it owes ${fmt(currentDebt, valued, soleSymbol(data.debt.current))}.`,
    );
  }

  // Deposits and holdings are valued at the same (today's) price, so the gap
  // between them on a position in its bands is what the AMM's sales cost.
  if (inBands && heldLine && valued && pricing && liquidated <= 0) {
    const gap = deposited - withdrawn - currentColl;
    if (gap > 0) {
      bullets.push(
        `Deposits and holdings are both valued at today's price, so the ${formatCompactUsd(gap)} between them is what the AMM's sales cost at that price: it sold ${fmtColl(inBands.sold)} ${heldLine.symbol} more than it bought back, and holds ${formatNumber(inBands.converted)} ${pricing.borrowedSymbol} for it.`,
      );
    }
  }

  if (valued && pricing) {
    bullets.push(
      `Collateral amounts are valued at today's ${pricing.collateralSymbol} price, ${pricing.price >= 1 ? Math.round(pricing.price).toLocaleString("en-US") : fmtPrice(pricing.price)} ${pricing.borrowedSymbol}; a liquidation card values what it took at the price in its block.`,
    );
  }

  if (!valued) {
    bullets.push(
      "Bars are shown in token units: this market doesn't borrow crvUSD, so no dollar price is captured for it.",
    );
  }

  if (bullets.length === 0) return null;

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures total this position&apos;s lifetime flows on LlamaLend across every event in its captured history.
      </p>
      {bullets.slice(0, 8).map((bullet, i) => (
        <div key={i} className="flex items-start gap-2 leading-relaxed">
          <span className="select-none text-rb-500">•</span>
          <span>{bullet}</span>
        </div>
      ))}
    </div>
  );
}

export function llamalendEconomicsContent(): LearnMoreContent {
  return {
    title: "About the Economics",
    intro:
      "This section traces this position's collateral and debt flows over its lifetime, added up from the position's own transactions.",
    stepsHeading: "How this is built:",
    steps: [
      "Every collateral deposit and withdrawal, borrow and repay is added up from the position's own transactions.",
      "Current collateral and debt are the position's balances read from the chain at the latest block; collateral counts the borrowed token the AMM holds from sold collateral with the collateral token.",
      "Dollar values are shown only on markets that borrow crvUSD; other markets are drawn in their own token.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Soft-liquidation band",
        text: "as a loan's health worsens, the AMM progressively converts collateral into the borrowed token across a price band, instead of an all-or-nothing liquidation.",
      },
      {
        bold: "Hard liquidation",
        text: "once health is below 0, anyone may repay the debt and take the collateral and any already-converted balance.",
      },
    ],
    links: [{ label: "Curve lending docs", url: LLAMALEND_DOC_URL }],
  };
}
