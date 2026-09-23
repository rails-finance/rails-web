// Prose for the Aave-V3-architecture ChainTruthTower's Explanation pane — the
// V2/V4 grammar (status lead + data-derived bullets) applied to this tier.
// Shared by every Aave-V3-shaped market: Aave V3 on Ethereum, Aave V3 on Base
// and Seamless (a fork of the same machine) — only the label in the prose and
// the doc links differ, threaded through `opts.label`.

import type { ReactNode } from "react";
import type { ChainTruthTowerData, TowerLine, TowerSideData } from "@/lib/shared/chain-truth-economics";
import { formatCompactUsd } from "@/components/shared/economics-chart-primitives";
import { formatCompact } from "@/lib/utils/format";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { AAVE_FAQ_URLS } from "@/components/transaction-timeline/explanation/shared/faqUrls";
import { SEAMLESS_DOCS_URL } from "@/lib/aave-v3/protocol-name";
import { WRITTEN_OFF_KEY } from "@/lib/aave-v3/chain-truth-tower";

export interface AaveV3EconomicsOpts {
  /** How the market names itself in the prose — "Aave V3" when unstated. */
  label?: string;
}

const sumScalar = (lines: TowerLine[], valued: boolean): number =>
  lines.reduce((s, l) => s + (valued ? (l.usd ?? 0) : l.amount), 0);

/** The one symbol a side speaks, when every contributing line agrees — the
 *  condition under which a token-unit figure for that side is meaningful. */
function sideSymbol(side: TowerSideData): string | null {
  const syms = new Set(
    [...side.current, ...side.exited, ...side.liquidated, ...(side.interest ? [side.interest] : [])]
      .filter((l) => l.amount > 0)
      .map((l) => l.symbol),
  );
  return syms.size === 1 ? [...syms][0] : null;
}

function fmt(scalar: number, valued: boolean, symbol: string | null): string {
  return valued ? formatCompactUsd(scalar) : symbol ? `${formatCompact(scalar)} ${symbol}` : formatCompact(scalar);
}

function Fig({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-foreground tabular-nums">{children}</span>;
}

export function aaveV3EconomicsExplanation(data: ChainTruthTowerData, opts: AaveV3EconomicsOpts = {}): ReactNode {
  const label = opts.label ?? "Aave V3";
  const valued = data.valued;
  const collSym = sideSymbol(data.collateral);
  const debtSym = sideSymbol(data.debt);

  const collSupplied = data.collateral.lifetimeInflow;
  const collWithdrawn = sumScalar(data.collateral.exited, valued);
  const debtBorrowed = data.debt.lifetimeInflow;
  const debtRepaid = sumScalar(data.debt.exited, valued);
  const interest = data.debt.interest && data.debt.interest.amount > 0 ? data.debt.interest : null;
  const collLiquidated = sumScalar(data.collateral.liquidated, valued);
  // The debt side's involuntary bucket holds two mechanics: the cover a
  // liquidator repaid, and the remainder the Pool wrote off. Told apart by key.
  const isWrittenOff = (l: TowerLine) => l.key.startsWith(WRITTEN_OFF_KEY);
  const debtLiquidated = sumScalar(
    data.debt.liquidated.filter((l) => !isWrittenOff(l)),
    valued,
  );
  const debtWrittenOff = sumScalar(data.debt.liquidated.filter(isWrittenOff), valued);

  const currentColl = sumScalar(data.collateral.current, valued);
  const currentDebt =
    sumScalar(data.debt.current, valued) + (interest ? (valued ? (interest.usd ?? 0) : interest.amount) : 0);

  const items: ReactNode[] = [];

  if (collSupplied > 0) {
    items.push(
      <span key="coll-flow">
        Supplied <Fig>{fmt(collSupplied, valued, collSym)}</Fig> over the position&apos;s life
        {collWithdrawn > 0 && (
          <>
            , of which <Fig>{fmt(collWithdrawn, valued, collSym)}</Fig> was withdrawn
          </>
        )}
        .
      </span>,
    );
  }
  if (debtBorrowed > 0) {
    items.push(
      <span key="debt-flow">
        Borrowed <Fig>{fmt(debtBorrowed, valued, debtSym)}</Fig> over the position&apos;s life
        {debtRepaid > 0 && (
          <>
            , of which <Fig>{fmt(debtRepaid, valued, debtSym)}</Fig> was repaid
          </>
        )}
        .
      </span>,
    );
  }
  if (interest) {
    items.push(
      <span key="interest">
        <Fig>{fmt(valued ? (interest.usd ?? 0) : interest.amount, valued, debtSym)}</Fig> in interest has accrued on the
        debt, included in the current balance below.
      </span>,
    );
  }
  if (currentColl > 0 || currentDebt > 0) {
    items.push(
      <span key="current">
        {currentColl > 0 ? (
          <>
            The position currently holds <Fig>{fmt(currentColl, valued, collSym)}</Fig> supplied
          </>
        ) : (
          "The position currently holds no collateral"
        )}
        {currentDebt > 0 ? (
          <>
            {" "}
            and owes <Fig>{fmt(currentDebt, valued, debtSym)}</Fig>.
          </>
        ) : (
          ", with no debt outstanding."
        )}
      </span>,
    );
  }
  if (collLiquidated > 0) {
    items.push(
      <span key="coll-liq">
        <Fig>{fmt(collLiquidated, valued, collSym)}</Fig> of collateral was seized in liquidation.
      </span>,
    );
  }
  if (debtLiquidated > 0) {
    items.push(
      <span key="debt-liq">
        <Fig>{fmt(debtLiquidated, valued, debtSym)}</Fig> of debt was cleared by liquidation.
      </span>,
    );
  }
  if (debtWrittenOff > 0) {
    items.push(
      <span key="debt-written-off">
        <Fig>{fmt(debtWrittenOff, valued, debtSym)}</Fig> of debt was written off as bad debt: a liquidation left no
        collateral to cover it, so the Pool burned it unpaid.
      </span>,
    );
  }
  if (!valued) {
    items.push(
      <span key="token-units">
        Bars are shown in token units rather than USD because {label} has no on-chain price captured for one or more of
        the assets involved.
      </span>,
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures total this position&apos;s lifetime flows on {label} across every event in its captured history.
      </p>
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2 leading-relaxed">
          <span className="select-none text-rb-500">•</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

export function aaveV3EconomicsContent(opts: AaveV3EconomicsOpts = {}): LearnMoreContent {
  const label = opts.label ?? "Aave V3";
  const isSeamless = label === "Seamless";
  const isBase = label === "Aave V3 on Base";
  return {
    title: "About the Economics",
    intro:
      "This section traces a position's supply and borrow flows over its lifetime, replayed from the Pool's own events.",
    stepsHeading: "How it's built:",
    steps: [
      "Flows are replayed from every supply, withdraw, borrow and repay event the position's own Pool has recorded.",
      "Current balances come from the Pool at the block the page reads, with interest already included.",
      `Dollar values use ${isSeamless ? "Seamless" : "Aave"}'s own on-chain oracle — the same price the Pool liquidates with.`,
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Lifetime flows",
        text: "the bars show every supply, withdrawal, borrow and repayment over the position's life, not just the current balance.",
      },
      {
        bold: "Accrued interest",
        text: "the current balance minus the net of what was actually supplied or borrowed; shown as its own segment when the debt is a single asset whose history adds up cleanly.",
      },
    ],
    links: [
      ...(isSeamless ? [{ label: "Seamless docs", url: SEAMLESS_DOCS_URL }] : []),
      ...(isBase ? [{ label: "Aave on Base", url: "https://app.aave.com/markets/?marketName=proto_base_v3" }] : []),
      { label: "Supplying assets", url: AAVE_FAQ_URLS.SUPPLYING },
      { label: "Borrowing", url: AAVE_FAQ_URLS.BORROWING },
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
    ],
  };
}
