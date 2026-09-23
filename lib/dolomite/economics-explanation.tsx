// Dolomite — the ChainTruthTower Explanation pane + its "?" FAQ. Narrates the
// same figures computeDolomiteEconomics feeds the tower (lib/dolomite/economics.ts):
// a status-lead sentence plus bullets built from the data, in the Liquity V2 /
// Aave V4 grammar (components/protocol/liquity/trove-economics.tsx,
// aaveV4EconomicsContent in lib/shared/learn-more-content.ts).

import type { ReactNode } from "react";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { formatCompact } from "@/lib/utils/format";
import { formatCompactUsd } from "@/components/shared/economics-chart-primitives";

const DOLOMITE_DOC_URL = "https://docs.dolomite.io/";

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

export function dolomiteEconomicsExplanation(data: ChainTruthTowerData): ReactNode {
  const valued = data.valued;
  const bullets: string[] = [];

  const deposited = data.collateral.lifetimeInflow;
  const withdrawn = sideTotal(data.collateral.exited, valued);
  if (deposited > 0 || withdrawn > 0) {
    const symbol = soleSymbol([...data.collateral.current, ...data.collateral.exited]);
    const parts: string[] = [];
    if (deposited > 0) parts.push(`${fmt(deposited, valued, symbol)} deposited`);
    if (withdrawn > 0) parts.push(`${fmt(withdrawn, valued, symbol)} withdrawn`);
    bullets.push(`Over its life this sub-account has had ${parts.join(" and ")}.`);
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

  if (sideTotal(data.collateral.liquidated, valued) > 0 || sideTotal(data.debt.liquidated, valued) > 0) {
    bullets.push("This sub-account's history includes a liquidation.");
  }

  const currentColl = sideTotal(data.collateral.current, valued);
  const currentDebt = sideTotal(data.debt.current, valued);
  if (currentColl > 0 || currentDebt > 0) {
    const pieces: string[] = [];
    if (currentColl > 0) pieces.push(`${fmt(currentColl, valued, soleSymbol(data.collateral.current))} supplied`);
    if (currentDebt > 0) pieces.push(`${fmt(currentDebt, valued, soleSymbol(data.debt.current))} borrowed`);
    bullets.push(`Right now it holds ${pieces.join(" and ")}.`);
  }

  bullets.push(
    "This position is scoped to one Dolomite sub-account (this wallet's other sub-accounts, if it has any, keep their own separate collateral and debt).",
  );

  if (!valued) {
    bullets.push(
      "Bars are shown in token units because no on-chain price is captured for one or more of the assets involved.",
    );
  }

  if (bullets.length === 0) return null;

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures total this sub-account&apos;s lifetime flows on Dolomite across every event in its captured
        history.
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

export function dolomiteEconomicsContent(): LearnMoreContent {
  return {
    title: "About the Economics",
    intro:
      "This section traces this sub-account's deposit and borrow flows over its lifetime, replayed from Dolomite's own on-chain events.",
    stepsHeading: "How this is built:",
    steps: [
      "Every deposit, withdrawal, borrow and repayment is replayed from the sub-account's own events.",
      "A negative balance in a market IS the debt — Dolomite has no separate borrow action — so each move is sorted by which side of zero the balance sat on.",
      "USD values come from Dolomite's own on-chain oracle price for each market.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Sub-accounts",
        text: "one wallet can run several isolated Dolomite sub-accounts, each with its own collateral, debt and margin — this page covers only the one named in its address.",
      },
    ],
    links: [{ label: "Dolomite docs", url: DOLOMITE_DOC_URL }],
  };
}
