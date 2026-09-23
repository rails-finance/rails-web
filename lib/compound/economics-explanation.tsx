// Compound V3 (Comet) — the tower's Explanation pane + "?" FAQ. Narrates the
// same `ChainTruthTowerData` computeCompoundEconomics builds, in the
// Liquity V2 / Aave V4 grammar (a status lead + bullets derived from the
// data, then a LearnMore FAQ) — see chain-truth-tower.tsx's `explanation`/
// `learnMore` props.

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { ChainTruthTowerData, TowerLine, TowerSideData } from "@/lib/shared/chain-truth-economics";
import { formatCompactUsd } from "@/components/shared/economics-chart-primitives";
import { formatCompact } from "@/lib/utils/format";

const COMPOUND_DOC_URLS = {
  OVERVIEW: "https://docs.compound.finance/",
  COLLATERAL_BORROWING: "https://docs.compound.finance/collateral-and-borrowing/",
  LIQUIDATION: "https://docs.compound.finance/liquidation/",
  INTEREST_RATES: "https://docs.compound.finance/interest-rates/",
} as const;

export interface CompoundEconomicsOpts {
  /** Names the Base deployment ("Compound V3 on Base") rather than Ethereum's. */
  onBase?: boolean;
}

function protocolName(opts?: CompoundEconomicsOpts): string {
  return opts?.onBase ? "Compound V3 on Base" : "Compound V3";
}

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
  return `${lines.length} assets`;
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

export function compoundEconomicsExplanation(data: ChainTruthTowerData, opts?: CompoundEconomicsOpts): ReactNode {
  const name = protocolName(opts);
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
  const liquidatedCollText = describeLines(data.collateral.liquidated, valued);
  const liquidatedDebtText = describeLines(data.debt.liquidated, valued);

  const hasAnything =
    suppliedText ||
    withdrawnText ||
    borrowedText ||
    repaidText ||
    interestText ||
    currentCollText ||
    currentDebtText ||
    liquidatedCollText ||
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

  if (liquidatedCollText && liquidatedDebtText) {
    bullets.push(
      `Liquidation cleared ${liquidatedCollText} of collateral and ${liquidatedDebtText} of debt over its life.`,
    );
  } else if (liquidatedCollText || liquidatedDebtText) {
    bullets.push(`Liquidation cleared ${liquidatedCollText ?? liquidatedDebtText} over its life.`);
  }

  bullets.push(
    `${name} borrows one base asset per market; every other asset held here is collateral, which earns nothing and cannot itself be borrowed.`,
  );

  if (!valued) {
    bullets.push(
      "Bars are shown in token units, not dollars, because no on-chain price is captured for one or more of the assets held here.",
    );
  }

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures total this position&apos;s lifetime flows on {name} across every event in its captured history.
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

export function compoundEconomicsContent(opts?: CompoundEconomicsOpts): LearnMoreContent {
  const name = protocolName(opts);
  return {
    title: "About the Economics",
    intro: `This section replays every ${name} event this position's captured history holds — supplies, withdrawals, borrows and repayments — beside its current base and collateral balances.`,
    stepsHeading: "How this is built:",
    steps: [
      "Flows are replayed from the position's own Comet events, decomposed at the running base balance's zero crossings — a supply into a negative balance repays debt first, and a withdrawal past zero borrows.",
      "Current balances are read from the market's Comet contract, interest included.",
      "USD values use Comet's own on-chain oracle price for each asset — the same price the market liquidates with — and only appear when every contributing asset is priced.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Base asset vs collateral",
        text: "each Comet market borrows exactly one base asset; every other asset held is collateral, which earns nothing and cannot itself be borrowed.",
      },
    ],
    links: [
      { label: "Compound V3 docs", url: COMPOUND_DOC_URLS.OVERVIEW },
      { label: "Collateral & borrowing", url: COMPOUND_DOC_URLS.COLLATERAL_BORROWING },
      { label: "Liquidation", url: COMPOUND_DOC_URLS.LIQUIDATION },
    ],
  };
}
