// Prose for SparkLend's ChainTruthTower Explanation pane — the V2/V4 grammar
// (status lead + data-derived bullets) applied to this tier. SparkLend prices
// every reserve at its own oracle, so this tower is usually valued (USD bars);
// it degrades to the token-only gated list only when RPC can't price a
// contributing reserve, which the bullets below narrate truthfully either way.

import type { ReactNode } from "react";
import type { ChainTruthTowerData, TowerLine, TowerSideData } from "@/lib/shared/chain-truth-economics";
import { formatCompactUsd } from "@/components/shared/economics-chart-primitives";
import { formatCompact } from "@/lib/utils/format";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const SPARK_DOCS = {
  SPARKLEND: "https://docs.spark.fi/products/sparklend",
  LIQUIDATIONS: "https://docs.spark.fi/products/sparklend/guides/liquidations",
  FAQ: "https://docs.spark.fi/faq",
} as const;

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

export function sparkEconomicsExplanation(data: ChainTruthTowerData): ReactNode {
  const valued = data.valued;
  const collSym = sideSymbol(data.collateral);
  const debtSym = sideSymbol(data.debt);

  const collSupplied = data.collateral.lifetimeInflow;
  const collWithdrawn = sumScalar(data.collateral.exited, valued);
  const debtBorrowed = data.debt.lifetimeInflow;
  const debtRepaid = sumScalar(data.debt.exited, valued);
  const interest = data.debt.interest && data.debt.interest.amount > 0 ? data.debt.interest : null;
  const collLiquidated = sumScalar(data.collateral.liquidated, valued);
  const debtLiquidated = sumScalar(data.debt.liquidated, valued);

  const currentColl = sumScalar(data.collateral.current, valued);
  const currentDebt =
    sumScalar(data.debt.current, valued) + (interest ? (valued ? (interest.usd ?? 0) : interest.amount) : 0);
  const reserveCount = new Set([...data.collateral.current, ...data.debt.current].map((l) => l.symbol)).size;

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
  if (!valued) {
    items.push(
      <span key="token-units">
        {reserveCount > 1 ? "Reserves are" : "The reserve is"} shown in token units rather than USD because
        SparkLend&apos;s oracle price for one or more of the assets involved isn&apos;t available right now.
      </span>,
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures total this position&apos;s lifetime flows on SparkLend across every event in its captured history.
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

export function sparkEconomicsContent(): LearnMoreContent {
  return {
    title: "About the Economics",
    intro:
      "This section traces a position's supply and borrow flows over its lifetime, replayed from the Pool's own events.",
    stepsHeading: "How it's built:",
    steps: [
      "Flows are replayed from every supply, withdraw, borrow and repay event the position's own Pool has recorded.",
      "Current balances come from the Pool at the block the page reads, with interest already included.",
      "Dollar values use SparkLend's own on-chain oracle — the same price the Pool liquidates with.",
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
      { label: "SparkLend docs", url: SPARK_DOCS.SPARKLEND },
      { label: "Liquidations", url: SPARK_DOCS.LIQUIDATIONS },
      { label: "Spark FAQ", url: SPARK_DOCS.FAQ },
    ],
  };
}
