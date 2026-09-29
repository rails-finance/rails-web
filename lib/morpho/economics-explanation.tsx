// Morpho Blue — the ChainTruthTower Explanation pane + its "?" FAQ. Narrates
// the same figures computeMorphoEconomics feeds the tower
// (lib/morpho/economics.ts): a status-lead sentence plus bullets built from
// the data, in the Liquity V2 / Aave V4 grammar
// (components/protocol/liquity/trove-economics.tsx, aaveV4EconomicsContent in
// lib/shared/learn-more-content.ts).
//
// Morpho prices in each market's loan token and has no USD price, so the tower
// is in token units, and every position is one isolated market, so `collateralUnit`/`debtUnit`
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
  /** The market's LLTV, for the liquidation incentive, and the bad debt its
   *  liquidations wrote off: with none, the collateral a liquidation seized
   *  was worth the debt it cleared × the incentive. */
  lltv?: number;
  badDebt?: number;
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
  const clearedAmt = debt.liquidated.reduce((a, l) => a + l.amount, 0);
  const clearedFig = scalarFig(clearedAmt, debtUnit);
  const interestAmt = debt.interest?.amount ?? 0;
  const owedNow = debt.current.reduce((a, l) => a + l.amount, 0) + interestAmt;
  if (borrowedFig && (repaidFig || clearedFig)) {
    // The debt column reconciled: borrowed − repaid − cleared + interest = owed.
    bullets.push(
      <span key="borrow">
        It borrowed {borrowedFig}
        {repaidFig && <>, repaid {repaidFig}</>}
        {clearedFig && <>, had {clearedFig} cleared by liquidation</>}
        {interestAmt > 1e-9 && <> and accrued {scalarFig(interestAmt, debtUnit)} of interest</>}, which leaves{" "}
        {scalarFig(owedNow, debtUnit) ?? fig(`0 ${debtUnit ?? ""}`)} owed. Repayments settle interest as well as the
        amount borrowed, which is why the column&apos;s {debtUnit} bar is the borrowed amount less everything paid back.
      </span>,
    );
  } else if (borrowedFig || repaidFig) {
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

  const liqFig = sumFig(collateral.liquidated, collateralUnit);
  if (liqFig) {
    // With no bad debt written off, a liquidation seized collateral worth the
    // debt it cleared × the market's incentive factor, at the price it ran on.
    const lif = opts.lltv && opts.lltv > 0 ? Math.min(1.15, 1 / (0.3 * opts.lltv + 0.7)) : null;
    const net = lif != null && clearedAmt > 0 && !(opts.badDebt && opts.badDebt > 0) ? clearedAmt * (lif - 1) : null;
    bullets.push(
      <span key="liq">
        Liquidation seized {liqFig} of collateral
        {clearedFig ? <> to clear {clearedFig} of debt</> : null}
        {net != null && lif != null ? (
          <>
            ; at the market&apos;s {((lif - 1) * 100).toFixed(2)}% incentive that collateral was worth{" "}
            {scalarFig(clearedAmt * lif, debtUnit)}, a net cost to the position of {scalarFig(net, debtUnit)}
          </>
        ) : null}
        .
      </span>,
    );
  }

  bullets.push(
    <span key="unvalued">
      Bars are in token units: each {name} market&apos;s oracle prices the collateral in the loan token and there is no
      USD price, so collateral and debt each stack in their own token.
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
      {bullets.slice(0, 8).map((item, i) => (
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
    intro: `This section adds up every Add Collateral, Remove Collateral, Borrow, Repay and Liquidation event ${name} has recorded for the position, and shows what it holds and owes now.`,
    stepsHeading: "How it's built:",
    steps: [
      "Collateral: added, less removed, less seized by liquidation, is what the position holds.",
      "Debt: borrowed, less repaid, less cleared by liquidation, plus the interest accrued, is what the position owes. The owed figure is the position's borrow shares at the market's totals, read from the chain.",
      "Everything is in token units: each market's oracle prices the collateral in the loan token, and Morpho has no USD price.",
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
