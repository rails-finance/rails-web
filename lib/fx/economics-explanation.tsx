// f(x) V2 economics Explanation — the plain-language narration under the
// chain-truth tower, mirroring the V2 benchmark (trove-economics.tsx): a
// status-lead sentence plus bullets built straight from the tower's own data
// (computeFxEconomics), never boilerplate.

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { ChainTruthTowerData } from "@/lib/shared/chain-truth-economics";
import { formatCompact } from "@/lib/utils/format";

const DUST = 1e-9;

// f(x) is always token mode — fxUSD isn't $1-pinned by charter.
const fig = (amount: number, symbol: string): string => `${formatCompact(amount)} ${symbol}`;

/** Explanation body for the f(x) tower — a lead sentence plus bullets derived
 *  from `data`. Returns null when there's nothing to narrate. */
export function fxEconomicsExplanation(data: ChainTruthTowerData): ReactNode {
  const { collateral, debt } = data;
  const collSym = collateral.current[0]?.symbol ?? data.collateralUnit ?? "collateral";
  const bullets: ReactNode[] = [];

  const collNow = collateral.current[0];
  if (collNow) {
    bullets.push(
      <span key="coll-current">
        The position currently holds {fig(collNow.amount, collSym)} of settled collateral, read from f(x)&apos;s pool
        contract at a named block.
      </span>,
    );
  }

  const debtRepaid = debt.exited.reduce((sum, l) => sum + l.amount, 0);
  if (debt.lifetimeInflow > DUST || debtRepaid > DUST) {
    bullets.push(
      <span key="debt-flow">
        {debt.lifetimeInflow > DUST && <>{fig(debt.lifetimeInflow, "fxUSD")} borrowed</>}
        {debtRepaid > DUST && (
          <>
            {debt.lifetimeInflow > DUST ? ", " : ""}
            {fig(debtRepaid, "fxUSD")} repaid
          </>
        )}
        {" over the position's own events."}
      </span>,
    );
  }

  const socialized = debt.liquidated.find((l) => l.key === "debt-socialized");
  const socializedAccrual = debt.interest;
  if (socialized) {
    bullets.push(
      <span key="socialized">
        {fig(socialized.amount, "fxUSD")} of debt was moved by the pool, without the owner&apos;s transaction:{" "}
        {socialized.tipLabel?.includes(": ")
          ? socialized.tipLabel.slice(socialized.tipLabel.indexOf(": ") + 2).replace(/ · /g, ", ")
          : "rebalances cleared it, net of other positions' bad debt"}
        .
      </span>,
    );
  } else if (socializedAccrual) {
    bullets.push(
      <span key="socialized-accrual">
        {fig(socializedAccrual.amount, "fxUSD")} of debt arrived without the owner&apos;s transaction: other
        positions&apos; bad debt, which the pool adds to every position through its debt index.
      </span>,
    );
  }

  const liquidated = debt.liquidated.find((l) => l.key === "debt-liquidated");
  if (liquidated) {
    bullets.push(
      <span key="liquidated">{fig(liquidated.amount, "fxUSD")} of debt was cleared in a direct liquidation.</span>,
    );
  }

  bullets.push(
    <span key="mechanic">
      f(x) positions are tracked as shares in the pool&apos;s tick tree; when the price moves, whole ticks rebalance
      together, so a position&apos;s debt ratio and balances can shift with no transaction from its own owner.
    </span>,
  );

  const debtNow = debt.current[0];
  if (debtNow) {
    bullets.push(
      <span key="debt-current">The position currently owes {fig(debtNow.amount, "fxUSD")} of settled debt.</span>,
    );
  }

  bullets.push(
    <span key="unvalued">
      fxUSD isn&apos;t pinned to a dollar, so amounts are shown in token units, never restated as USD.
    </span>,
  );

  if (bullets.length === 0) return null;

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures total this position&apos;s lifetime flows on f(x) across every event in its captured history.
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

const FX_DOC_URL = "https://fxprotocol.gitbook.io/fx-docs";

/** The tower's "?" FAQ for f(x). */
export function fxEconomicsContent(): LearnMoreContent {
  return {
    title: "About the Economics",
    intro:
      "This panel reads the position's current collateral and debt from f(x)'s pool contract, because funding charges collateral while tick rebalances and bad-debt write-offs move debt, none of which logs an event for the position. Its transactions give the lifetime borrowed and repaid fxUSD, and the difference between what they add up to and the pool's figure is drawn as a segment of its own.",
    stepsHeading: "How the tower is built:",
    steps: [
      "Current collateral and debt are the pool's own settled reading at a named block — funding and rebalances already applied.",
      "Borrowed and repaid fxUSD are summed from the position's transactions.",
      "The gap between what the transactions add up to and the pool's reading is drawn as one segment, moved by the pool: debt cleared by rebalances and redemptions, debt written off at liquidations, and other positions' bad debt added through the pool's debt index. None logs an event for the position.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "The tick tree",
        text: "positions are grouped by debt ratio into ticks; rebalances work on whole ticks, so every position in a rebalanced tick loses collateral and debt in proportion.",
      },
      {
        bold: "fxUSD",
        text: "the debt token positions mint; it is not pinned to $1, so amounts are shown in fxUSD tokens.",
      },
    ],
    links: [{ label: "f(x) docs", url: FX_DOC_URL }],
  };
}
