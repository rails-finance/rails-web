// Curve LlamaLend — the ChainTruthTower Explanation pane + its "?" FAQ.
// Narrates the same figures computeLlamalendEconomics feeds the tower
// (lib/llamalend/economics.ts): a status-lead sentence plus bullets built from
// the data, in the Liquity V2 / Aave V4 grammar
// (components/protocol/liquity/trove-economics.tsx, aaveV4EconomicsContent in
// lib/shared/learn-more-content.ts).

import type { ReactNode } from "react";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { formatCompact } from "@/lib/utils/format";
import { formatCompactUsd } from "@/components/shared/economics-chart-primitives";

const LLAMALEND_DOC_URL = "https://docs.curve.finance/lending/overview/";

function sideTotal(lines: TowerLine[], valued: boolean): number {
  return lines.reduce((s, l) => s + Math.max(0, valued ? (l.usd ?? 0) : l.amount), 0);
}

function soleSymbol(lines: TowerLine[]): string | null {
  const symbols = new Set(lines.filter((l) => l.amount > 0).map((l) => l.symbol));
  return symbols.size === 1 ? [...symbols][0] : null;
}

function fmt(n: number, valued: boolean, symbol: string | null): string {
  return valued ? formatCompactUsd(n) : symbol ? `${formatCompact(n)} ${symbol}` : formatCompact(n);
}

export function llamalendEconomicsExplanation(data: ChainTruthTowerData): ReactNode {
  const valued = data.valued;
  const bullets: string[] = [];

  const deposited = data.collateral.lifetimeInflow;
  const withdrawn = sideTotal(data.collateral.exited, valued);
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

  const liquidated = sideTotal(data.collateral.liquidated, valued) + sideTotal(data.debt.liquidated, valued);
  if (liquidated > 0) {
    bullets.push("Part of this position's collateral and debt was taken in a hard liquidation.");
  }

  const hasConverted = data.collateral.current.some((l) => l.symbol.includes("(converted)"));
  bullets.push(
    hasConverted
      ? "Part of this position's collateral currently sits converted to the borrowed token — the market's soft-liquidation band has been swapping between the two as the price moved through it."
      : "As a loan's health worsens, LlamaLend's soft-liquidation band progressively converts collateral into the borrowed token rather than liquidating all at once; this position isn't in that band right now.",
  );

  const currentColl = sideTotal(data.collateral.current, valued);
  const currentDebt = sideTotal(data.debt.current, valued);
  if (currentColl > 0 || currentDebt > 0) {
    const pieces: string[] = [];
    if (currentColl > 0) pieces.push(`${fmt(currentColl, valued, soleSymbol(data.collateral.current))} of collateral`);
    if (currentDebt > 0) pieces.push(`${fmt(currentDebt, valued, soleSymbol(data.debt.current))} of debt`);
    bullets.push(`Right now it holds ${pieces.join(" against ")}.`);
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
      {bullets.slice(0, 6).map((bullet, i) => (
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
      "This section traces this position's collateral and debt flows over its lifetime, replayed from the controller's own on-chain events.",
    stepsHeading: "How this is built:",
    steps: [
      "Every collateral add/withdraw and borrow/repay is replayed from the position's own controller events.",
      "Current collateral and debt are read at the head block, from the controller's live user state.",
      "Dollar values are shown only on markets that borrow crvUSD; other markets are drawn in their own token.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Soft liquidation band",
        text: "as a loan's health worsens, the AMM progressively converts collateral into the borrowed token across a price band, instead of an all-or-nothing liquidation.",
      },
      {
        bold: "Hard liquidation",
        text: "if the price moves past the band without recovering, the remaining collateral (and any already-converted balance) can be seized to clear the debt.",
      },
    ],
    links: [{ label: "Curve lending docs", url: LLAMALEND_DOC_URL }],
  };
}
