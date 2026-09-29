// Prose for the Aave-V3-architecture ChainTruthTower's Explanation pane — the
// V2/V4 grammar (status lead + data-derived bullets) applied to this tier.
// Shared by every Aave-V3-shaped market: Aave V3 on Ethereum, Aave V3 on Base
// and Seamless (a fork of the same machine) — only the label in the prose and
// the doc links differ, threaded through `opts.label`.

import type { ReactNode } from "react";
import type { TowerLine, TowerSideData } from "@/lib/shared/chain-truth-economics";
import type { AaveV3TowerData } from "@/lib/aave-v3/chain-truth-tower";
import { fmt2 } from "@/lib/aave-v3/liquidation-fee";
import { formatCompactUsd } from "@/components/shared/economics-chart-primitives";
import { formatCompact } from "@/lib/utils/format";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { AAVE_FAQ_URLS } from "@/components/transaction-timeline/explanation/shared/faqUrls";
import { SEAMLESS_DOCS_URL } from "@/lib/aave-v3/protocol-name";
import { WRITTEN_OFF_KEY } from "@/lib/aave-v3/chain-truth-tower";

/** Signed dollars for a net: "−$295". */
const signedUsd = (n: number): string => `${n < 0 ? "−" : "+"}${formatCompactUsd(Math.abs(n))}`;

/** "67.36 AAVE and 1.2 WETH" — each line's own token amount. */
const tokenList = (lines: TowerLine[]): string =>
  lines.map((l) => `${fmt2(String(l.amount))} ${l.symbol}`).join(" and ");

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

export function aaveV3EconomicsExplanation(data: AaveV3TowerData, opts: AaveV3EconomicsOpts = {}): ReactNode {
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
    // Borrowed + interest − repaid − liquidated = owed now, stated as one sum.
    const liqFirst = debtRepaid > 0 ? " and " : ", then ";
    items.push(
      <span key="debt-flow">
        Borrowed <Fig>{fmt(debtBorrowed, valued, debtSym)}</Fig> over the position&apos;s life
        {interest && (
          <>
            {" "}
            and <Fig>{fmt(valued ? (interest.usd ?? 0) : interest.amount, valued, debtSym)}</Fig> of interest accrued on
            it
          </>
        )}
        {debtRepaid > 0 && (
          <>
            , then <Fig>{fmt(debtRepaid, valued, debtSym)}</Fig> repaid
          </>
        )}
        {debtLiquidated > 0 && (
          <>
            {liqFirst}
            <Fig>{fmt(debtLiquidated, valued, debtSym)}</Fig> cleared by liquidation
          </>
        )}
        {currentDebt > 0 ? (
          <>
            , leaving <Fig>{fmt(currentDebt, valued, debtSym)}</Fig> owed.
          </>
        ) : (
          "."
        )}
      </span>,
    );
  }
  if (currentColl > 0) {
    items.push(
      <span key="current">
        The position currently holds <Fig>{fmt(currentColl, valued, collSym)}</Fig> supplied.
      </span>,
    );
  }
  if (collLiquidated > 0 && debtLiquidated > 0 && valued) {
    const net = debtLiquidated - collLiquidated;
    items.push(
      <span key="liq-net">
        Liquidations took {tokenList(data.collateral.liquidated)} of collateral to clear{" "}
        {tokenList(data.debt.liquidated.filter((l) => !isWrittenOff(l)))} of debt:{" "}
        <Fig>{fmt(collLiquidated, valued, collSym)}</Fig> against <Fig>{fmt(debtLiquidated, valued, debtSym)}</Fig>
        {data.liquidatedAtEventPrices ? " at the prices of the day" : ""}, a net {signedUsd(net)} to the borrower: the
        liquidation bonus, part of which went to the {label === "Seamless" ? "Seamless" : "Aave"} treasury.
      </span>,
    );
  } else if (collLiquidated > 0) {
    items.push(
      <span key="coll-liq">
        <Fig>{fmt(collLiquidated, valued, collSym)}</Fig> of collateral was seized in liquidation.
      </span>,
    );
  }
  if (data.liquidatedAtEventPrices && valued) {
    items.push(
      <span key="price-basis">
        Supplied, withdrawn, borrowed and repaid are valued at today&apos;s prices, and the liquidated amounts at the
        prices when each liquidation happened.
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
      "Flows are replayed from every supply, withdraw, borrow, repay and liquidation event the position's Pool has recorded.",
      "Current balances come from the Pool at the block the page reads, with interest already included.",
      `Dollar values use ${isSeamless ? "Seamless" : "Aave"}'s own on-chain oracle — the same price the Pool liquidates with.`,
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Lifetime flows",
        text: "the bars show every supply, withdrawal, borrow and repayment over the position's life.",
      },
      {
        bold: "Accrued interest",
        text: "the current balance minus the net of what the position's events supplied or borrowed. It is a segment of the debt bar, in USD when the debt is in more than one asset.",
      },
      {
        bold: "Liquidated",
        text: "the collateral a liquidation took (the liquidator's share and the treasury's fee) and the debt it cleared, valued at the prices when it happened.",
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
