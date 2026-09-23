// Compound V2 — the tower's Explanation pane + "?" FAQ. Narrates the same
// `ChainTruthTowerData` computeCompoundV2Economics builds, in the Liquity V2 /
// Aave V4 grammar (a status lead + bullets derived from the data, then a
// LearnMore FAQ) — see chain-truth-tower.tsx's `explanation`/`learnMore` props.

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { ChainTruthTowerData, TowerLine, TowerSideData } from "@/lib/shared/chain-truth-economics";
import { formatCompactUsd } from "@/components/shared/economics-chart-primitives";
import { formatCompact } from "@/lib/utils/format";

const COMPOUND_V2_DOC_URL = "https://docs.compound.finance/v2/";

function sumUsd(lines: TowerLine[]): number | null {
  if (lines.length === 0 || !lines.every((l) => l.usd != null)) return null;
  return lines.reduce((s, l) => s + (l.usd ?? 0), 0);
}

function oneSymbol(lines: TowerLine[]): string | null {
  const syms = new Set(lines.map((l) => l.symbol));
  return syms.size === 1 ? [...syms][0] : null;
}

/** Text for a group of lines — the USD sum when valued, else a token amount
 *  when the group speaks one symbol, else just an asset count. */
function describeLines(lines: TowerLine[], valued: boolean): string | null {
  if (lines.length === 0) return null;
  if (valued) {
    const usd = sumUsd(lines);
    if (usd != null) return formatCompactUsd(usd);
  }
  const sym = oneSymbol(lines);
  if (sym) return `${formatCompact(lines.reduce((s, l) => s + l.amount, 0))} ${sym}`;
  return `${lines.length} markets`;
}

/** The one symbol a side speaks, when every one of its lines agrees — the
 *  condition under which a plain `lifetimeInflow` scalar can carry a symbol. */
function sideSymbol(side: TowerSideData): string | null {
  const syms = new Set(
    [
      ...side.current,
      ...(side.received ?? []),
      ...side.exited,
      ...side.liquidated,
      ...(side.interest ? [side.interest] : []),
    ].map((l) => l.symbol),
  );
  return syms.size === 1 ? [...syms][0] : null;
}

function fmtScalar(value: number, valued: boolean, symbol: string | null): string | null {
  if (value <= 0) return null;
  if (valued) return formatCompactUsd(value);
  if (symbol) return `${formatCompact(value)} ${symbol}`;
  return null;
}

export function compoundV2EconomicsExplanation(data: ChainTruthTowerData): ReactNode {
  const valued = data.valued;
  const collSymbol = sideSymbol(data.collateral);
  const debtSymbol = sideSymbol(data.debt);

  const suppliedText = fmtScalar(data.collateral.lifetimeInflow, valued, collSymbol);
  const withdrawnText = describeLines(data.collateral.exited, valued);
  const borrowedText = fmtScalar(data.debt.lifetimeInflow, valued, debtSymbol);
  const repaidText = describeLines(data.debt.exited, valued);
  const interestText =
    data.debt.interest && data.debt.interest.amount > 0 ? describeLines([data.debt.interest], valued) : null;
  const currentCollText = describeLines(data.collateral.current, valued);
  const currentDebtText = describeLines(data.debt.current, valued);
  const liquidatedDebtText = describeLines(data.debt.liquidated, valued);

  const hasAnything =
    suppliedText ||
    withdrawnText ||
    borrowedText ||
    repaidText ||
    interestText ||
    currentCollText ||
    currentDebtText ||
    liquidatedDebtText;
  if (!hasAnything) return null;

  const bullets: string[] = [];

  if (suppliedText) {
    bullets.push(
      `Supplied ${suppliedText} in collateral over its captured history${withdrawnText ? `, withdrawing ${withdrawnText} of it` : ""}.`,
    );
  } else if (withdrawnText) {
    bullets.push(`Withdrew ${withdrawnText} in collateral over its captured history.`);
  }

  if (borrowedText) {
    bullets.push(`Borrowed ${borrowedText} against it${repaidText ? `, repaying ${repaidText}` : ""}.`);
  } else if (repaidText) {
    bullets.push(`Repaid ${repaidText} of debt over its captured history.`);
  }

  if (interestText) {
    bullets.push(
      `About ${interestText} of the current debt is accrued interest built up since the last borrow or repayment.`,
    );
  }

  if (currentCollText || currentDebtText) {
    bullets.push(`It currently holds ${currentCollText ?? "no collateral"} against ${currentDebtText ?? "no debt"}.`);
  }

  if (liquidatedDebtText) {
    bullets.push(`Liquidation cleared ${liquidatedDebtText} of debt over its life.`);
  }

  bullets.push(
    "Collateral is shown at its current value — the cToken balance converted at the market's own exchange rate — not the raw cToken amount, so it already includes the interest earned.",
  );

  if (!valued) {
    bullets.push(
      "Bars are shown in token units, not dollars, because no on-chain price is captured for one or more of the markets held here.",
    );
  }

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures total this position&apos;s lifetime flows on Compound V2 across every event in its captured
        history.
      </p>
      {bullets.map((item, i) => (
        <div key={i} className="flex items-start gap-2 leading-relaxed">
          <span className="select-none text-rb-500">•</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

export function compoundV2EconomicsContent(): LearnMoreContent {
  return {
    title: "About the Economics",
    intro:
      "This section replays every Compound V2 event this position's captured history holds — supplies, withdrawals, borrows, repayments and liquidations — beside its current market balances.",
    stepsHeading: "How this is built:",
    steps: [
      "Flows are replayed from the wallet's own cToken events, per market.",
      "Collateral is shown at balanceOfUnderlying — the cToken balance converted at the market's exchangeRateStored — so it already includes accrued interest; debt is shown as of the last borrow, repayment or liquidation.",
      "USD values use Compound's own on-chain oracle price for each market (getUnderlyingPrice) — the same price the Comptroller reads — and only appear when every contributing market is priced.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Exchange rate",
        text: "cTokens are receipt tokens that accrue value against the underlying asset; a balance's underlying amount grows over time even though the cToken count doesn't.",
      },
    ],
    links: [{ label: "Compound V2 docs", url: COMPOUND_V2_DOC_URL }],
  };
}
