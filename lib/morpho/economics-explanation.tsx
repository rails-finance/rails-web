// Morpho Blue — the ChainTruthTower Explanation pane + its "?" FAQ. Narrates
// the same figures computeMorphoEconomics feeds the tower
// (lib/morpho/economics.ts): a status-lead sentence plus bullets built from
// the data, in the Liquity V2 / Aave V4 grammar
// (components/protocol/liquity/trove-economics.tsx, aaveV4EconomicsContent in
// lib/shared/learn-more-content.ts).
//
// Morpho carries no oracle at this tier — the tower is token units, not USD —
// and every position is one isolated market, so `collateralUnit`/`debtUnit`
// name the two tokens directly. Reused verbatim by Morpho Blue on Base
// (opts.onBase); same machine, only the deployment's name changes in the prose.

import type { ReactNode } from "react";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { formatCompact } from "@/lib/utils/format";

const MORPHO_DOC_URLS = {
  OVERVIEW: "https://docs.morpho.org/",
  MARKET: "https://docs.morpho.org/learn/concepts/market/",
  LIQUIDATION: "https://docs.morpho.org/learn/concepts/liquidation/",
  IRM: "https://docs.morpho.org/learn/concepts/irm/",
};

function fig(text: string): ReactNode {
  return <span className="font-semibold text-foreground tabular-nums">{text}</span>;
}

function sumFig(lines: TowerLine[], unit: string | undefined): ReactNode | null {
  const amount = lines.reduce((s, l) => s + l.amount, 0);
  if (amount <= 1e-9) return null;
  return fig(`${formatCompact(amount)} ${unit ?? lines[0]?.symbol ?? ""}`.trim());
}

function scalarFig(amount: number, unit: string | undefined): ReactNode | null {
  if (amount <= 1e-9 || !unit) return null;
  return fig(`${formatCompact(amount)} ${unit}`);
}

export interface MorphoEconomicsOpts {
  onBase?: boolean;
}

export function morphoEconomicsExplanation(data: ChainTruthTowerData, opts: MorphoEconomicsOpts = {}): ReactNode {
  const name = opts.onBase ? "Morpho Blue on Base" : "Morpho Blue";
  const { collateral, debt, collateralUnit, debtUnit } = data;

  const hasAnything =
    collateral.current.length > 0 ||
    debt.current.length > 0 ||
    collateral.lifetimeInflow > 0 ||
    debt.lifetimeInflow > 0 ||
    collateral.exited.length > 0 ||
    debt.exited.length > 0 ||
    collateral.liquidated.length > 0;
  if (!hasAnything) return null;

  const bullets: ReactNode[] = [];

  const depositedFig = scalarFig(collateral.lifetimeInflow, collateralUnit);
  const withdrawnFig = sumFig(collateral.exited, collateralUnit);
  if (depositedFig || withdrawnFig) {
    bullets.push(
      <span key="supply">
        {depositedFig ? (
          <>It deposited {depositedFig} as collateral over its life</>
        ) : (
          <>It deposited collateral over its life</>
        )}
        {withdrawnFig && <> and withdrew {withdrawnFig}</>}.
      </span>,
    );
  }

  const borrowedFig = scalarFig(debt.lifetimeInflow, debtUnit);
  const repaidFig = sumFig(debt.exited, debtUnit);
  if (borrowedFig || repaidFig) {
    bullets.push(
      <span key="borrow">
        {borrowedFig ? (
          <>It borrowed {borrowedFig} against that collateral</>
        ) : (
          <>It borrowed against that collateral</>
        )}
        {repaidFig && <> and repaid {repaidFig}</>}.
      </span>,
    );
  }

  const currentCollFig = sumFig(collateral.current, collateralUnit);
  const currentDebtFig = scalarFig(
    debt.current.reduce((s, l) => s + l.amount, 0) + (debt.interest?.amount ?? 0),
    debtUnit,
  );
  if (currentCollFig && currentDebtFig) {
    bullets.push(
      <span key="current">
        It now holds {currentCollFig} of collateral against {currentDebtFig} of debt.
      </span>,
    );
  } else if (currentCollFig) {
    bullets.push(<span key="current">It now holds {currentCollFig} of collateral, with no outstanding debt.</span>);
  } else if (currentDebtFig) {
    bullets.push(<span key="current">It now owes {currentDebtFig} of debt.</span>);
  }

  if (debt.interest && debt.interest.amount > 0) {
    const interestFig = scalarFig(debt.interest.amount, debtUnit);
    if (interestFig) {
      bullets.push(
        <span key="interest">
          {interestFig} of that debt is interest accrued in the market&apos;s own loan token since it was borrowed.
        </span>,
      );
    }
  }

  const liqFig = sumFig(collateral.liquidated, collateralUnit);
  if (liqFig) {
    bullets.push(<span key="liq">{liqFig} of collateral was seized in liquidation.</span>);
  }

  bullets.push(
    <span key="unvalued">
      Bars are shown in token units rather than USD — {name} has no oracle at this level, so collateral and debt each
      stack in their own token.
    </span>,
  );

  bullets.push(
    <span key="mechanism">
      This position lives in one isolated market — a single collateral token, a single loan token, its own oracle and
      its own liquidation threshold — so its figures never mix with any other market on {name}.
    </span>,
  );

  if (bullets.length === 0) return null;

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures total this position&apos;s lifetime flows on {name} across every event in its captured history.
      </p>
      {bullets.slice(0, 6).map((item, i) => (
        <div key={i} className="flex items-start gap-2 leading-relaxed">
          <span className="select-none text-rb-500">•</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

export function morphoEconomicsContent(opts: MorphoEconomicsOpts = {}): LearnMoreContent {
  const name = opts.onBase ? "Morpho Blue on Base" : "Morpho Blue";
  return {
    title: "About the Economics",
    intro: `This section replays every supply, withdrawal, borrow and repay ${name} has recorded for the position's market, and shows what it holds and owes now.`,
    stepsHeading: "How it's built:",
    steps: [
      "Every flow is replayed from the position's own SupplyCollateral, WithdrawCollateral, Borrow and Repay events on the market.",
      "Current debt comes from the market's own borrow shares, converted to assets at the market's live index — the accrued segment is that figure minus the net principal borrowed.",
      "There is no USD conversion at this tier: Morpho keeps no protocol-wide oracle, so both bars are drawn in their own token.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Isolated markets",
        text: "each Morpho Blue market pairs exactly one collateral token with one loan token, under its own oracle and liquidation loan-to-value — risk never crosses into another market.",
      },
      {
        bold: "Borrow shares",
        text: "debt is tracked in shares of the market's total borrow, not a raw token balance; the market's index converts shares to assets as interest accrues.",
      },
    ],
    links: [
      { label: "Morpho markets", url: MORPHO_DOC_URLS.MARKET },
      { label: "Interest rate model", url: MORPHO_DOC_URLS.IRM },
      { label: "Morpho docs", url: MORPHO_DOC_URLS.OVERVIEW },
    ],
  };
}
