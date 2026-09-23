// Moonwell — the ChainTruthTower Explanation pane + its "?" FAQ. Narrates the
// same figures computeMoonwellEconomics feeds the tower (lib/moonwell/economics.ts):
// a status-lead sentence plus bullets built from the data, in the Liquity V2 /
// Aave V4 grammar (components/protocol/liquity/trove-economics.tsx,
// aaveV4EconomicsContent in lib/shared/learn-more-content.ts).
//
// Reused verbatim by Moonwell on Base (opts.deployment) — same machine, same
// arithmetic, only the deployment's name changes in the prose.

import type { ReactNode } from "react";
import type { ChainTruthTowerData, TowerLine, TowerSideData } from "@/lib/shared/chain-truth-economics";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { MoonwellDeploymentName } from "@/lib/shared/learn-more-content";
import { formatCompact } from "@/lib/utils/format";
import { formatCompactUsd } from "@/components/shared/economics-chart-primitives";

const MOONWELL_DOC_URL = "https://docs.moonwell.fi";

function fig(text: string): ReactNode {
  return <span className="font-semibold text-foreground tabular-nums">{text}</span>;
}

/** The one symbol a side speaks, when it speaks only one — the condition under
 *  which an unvalued (token-unit) sum across its buckets is faithful; a
 *  cross-symbol token sum would invent a magnitude no chain read supports. */
function sideSymbol(side: TowerSideData): string | null {
  const syms = new Set(
    [...side.current, ...side.exited, ...side.liquidated, ...(side.interest ? [side.interest] : [])].map(
      (l) => l.symbol,
    ),
  );
  return syms.size === 1 ? [...syms][0] : null;
}

function sumScalar(lines: TowerLine[], valued: boolean): number {
  return lines.reduce((s, l) => s + (valued ? (l.usd ?? 0) : l.amount), 0);
}

/** A narratable figure for a bucket total: USD when the tower is valued, else
 *  the token amount when the side speaks one symbol. Null when there is
 *  nothing to say — the caller's clause then renders nothing at all. */
function scalarFig(amount: number, valued: boolean, symbol: string | null): ReactNode | null {
  if (amount <= 1e-9) return null;
  if (valued) return fig(formatCompactUsd(amount));
  if (!symbol) return null;
  return fig(`${formatCompact(amount)} ${symbol}`);
}

export interface MoonwellEconomicsOpts {
  deployment?: MoonwellDeploymentName;
}

export function moonwellEconomicsExplanation(data: ChainTruthTowerData, opts: MoonwellEconomicsOpts = {}): ReactNode {
  const name = opts.deployment === "base" ? "Moonwell on Base" : "Moonwell";
  const { valued, collateral, debt } = data;
  const collSymbol = sideSymbol(collateral);
  const debtSymbol = sideSymbol(debt);

  const hasAnything =
    collateral.current.length > 0 ||
    debt.current.length > 0 ||
    collateral.lifetimeInflow > 0 ||
    debt.lifetimeInflow > 0 ||
    collateral.exited.length > 0 ||
    debt.exited.length > 0 ||
    debt.liquidated.length > 0;
  if (!hasAnything) return null;

  const bullets: ReactNode[] = [];

  const suppliedFig = scalarFig(collateral.lifetimeInflow, valued, collSymbol);
  const withdrawnFig = scalarFig(sumScalar(collateral.exited, valued), valued, collSymbol);
  if (suppliedFig || withdrawnFig) {
    bullets.push(
      <span key="supply">
        {suppliedFig ? (
          <>It supplied {suppliedFig} into Moonwell markets over its life</>
        ) : (
          <>It supplied into Moonwell markets over its life</>
        )}
        {withdrawnFig && <> and withdrew {withdrawnFig}</>}.
      </span>,
    );
  }

  const borrowedFig = scalarFig(debt.lifetimeInflow, valued, debtSymbol);
  const repaidFig = scalarFig(sumScalar(debt.exited, valued), valued, debtSymbol);
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

  const currentCollFig = scalarFig(sumScalar(collateral.current, valued), valued, collSymbol);
  const debtInterestAmount = debt.interest ? (valued ? (debt.interest.usd ?? 0) : debt.interest.amount) : 0;
  const currentDebtFig = scalarFig(sumScalar(debt.current, valued) + debtInterestAmount, valued, debtSymbol);
  if (currentCollFig && currentDebtFig) {
    bullets.push(
      <span key="current">
        It now holds {currentCollFig} in collateral against {currentDebtFig} of debt.
      </span>,
    );
  } else if (currentCollFig) {
    bullets.push(<span key="current">It now holds {currentCollFig} in collateral, with no outstanding debt.</span>);
  } else if (currentDebtFig) {
    bullets.push(<span key="current">It now owes {currentDebtFig} in debt.</span>);
  }

  if (debt.interest && debt.interest.amount > 0) {
    const interestFig = scalarFig(debtInterestAmount, valued, debtSymbol);
    if (interestFig) {
      bullets.push(
        <span key="interest">{interestFig} of that debt is interest accrued since it last borrowed or repaid.</span>,
      );
    }
  }

  const liqFig = scalarFig(sumScalar(debt.liquidated, valued), valued, debtSymbol);
  if (liqFig) {
    bullets.push(<span key="liq">{liqFig} of debt was cleared through liquidation.</span>);
  }

  if (!valued) {
    bullets.push(
      <span key="unvalued">
        Bars are shown in token units — {name}&apos;s own oracle price wasn&apos;t available for every market in this
        position, so the figures aren&apos;t converted to USD.
      </span>,
    );
  }

  if (collateral.current.length > 0) {
    bullets.push(
      <span key="mechanism">
        Moonwell wraps each supply in an mToken; a market&apos;s exchange rate converts the mToken balance into
        today&apos;s underlying value, which is why collateral held can grow without a further deposit.
      </span>,
    );
  }

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

export function moonwellEconomicsContent(opts: MoonwellEconomicsOpts = {}): LearnMoreContent {
  const name = opts.deployment === "base" ? "Moonwell on Base" : "Moonwell";
  return {
    title: "About the Economics",
    intro: `This section replays every supply, withdrawal, borrow and repay ${name} has recorded for the position, and shows what it holds and owes now.`,
    stepsHeading: "How it's built:",
    steps: [
      "Every flow is replayed from the position's own Mint, Redeem, Borrow and RepayBorrow events on the market's mToken contracts.",
      "Current collateral is the mToken balance times the market's exchange rate; current debt is the Comptroller's own accountBorrows or borrowBalanceStored figure — both interest included.",
      `USD values use ${name}'s own oracle price for each market; when a contributing market has no on-chain price, the figures are shown in token units instead.`,
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "mTokens & the exchange rate",
        text: "each market's mToken is a receipt: balance × the market's exchange rate = the underlying claim. The exchange rate only rises as interest accrues, so a fixed mToken balance is worth ever more underlying over time.",
      },
    ],
    links: [{ label: "Moonwell docs", url: MOONWELL_DOC_URL }],
  };
}
