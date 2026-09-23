// Liquity V1 economics Explanation — the plain-language narration under the
// chain-truth tower, mirroring the V2 benchmark (trove-economics.tsx): a
// status-lead sentence plus bullets built straight from the tower's own data
// (computeLiquityV1Economics), never boilerplate.

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { ChainTruthTowerData, TowerSideData } from "@/lib/shared/chain-truth-economics";
import { formatCompact } from "@/lib/utils/format";
import { formatCompactUsd } from "@/components/shared/economics-chart-primitives";

const DUST = 1e-9;

const sideSymbol = (side: TowerSideData, fallback: string): string =>
  side.current[0]?.symbol ?? side.exited[0]?.symbol ?? side.liquidated[0]?.symbol ?? fallback;

const fig = (amount: number, usd: number | null, valued: boolean, symbol: string): string =>
  valued && usd != null ? formatCompactUsd(usd) : `${formatCompact(amount)} ${symbol}`;

const exitedTotal = (side: TowerSideData, valued: boolean): { amount: number; usd: number | null } => {
  const amount = side.exited.reduce((sum, l) => sum + l.amount, 0);
  const usd = valued ? side.exited.reduce((sum, l) => sum + (l.usd ?? 0), 0) : null;
  return { amount, usd };
};

const redeemedLine = (side: TowerSideData) => side.liquidated.find((l) => l.flowKind === "redeemed");
const liquidatedLine = (side: TowerSideData) => side.liquidated.find((l) => l.flowKind !== "redeemed");

/** Explanation body for the Liquity V1 tower — a lead sentence plus bullets
 *  derived from `data`. Returns null when there's nothing to narrate (no
 *  current state and no lifetime flows). */
export function liquityV1EconomicsExplanation(data: ChainTruthTowerData): ReactNode {
  const { collateral, debt, valued } = data;
  const collSym = sideSymbol(collateral, "ETH");
  const debtSym = sideSymbol(debt, "LUSD");
  const bullets: ReactNode[] = [];

  if (collateral.lifetimeInflow > DUST || exitedTotal(collateral, valued).amount > DUST) {
    const { amount: withdrawnAmt, usd: withdrawnUsd } = exitedTotal(collateral, valued);
    bullets.push(
      <span key="coll-flow">
        {collateral.lifetimeInflow > DUST && (
          <>{fig(collateral.lifetimeInflow, valued ? collateral.lifetimeInflow : null, valued, collSym)} deposited</>
        )}
        {withdrawnAmt > DUST && (
          <>
            {collateral.lifetimeInflow > DUST ? ", " : ""}
            {fig(withdrawnAmt, withdrawnUsd, valued, collSym)} withdrawn
          </>
        )}
        {" over the trove's life."}
      </span>,
    );
  }

  if (debt.lifetimeInflow > DUST || exitedTotal(debt, valued).amount > DUST) {
    const { amount: repaidAmt, usd: repaidUsd } = exitedTotal(debt, valued);
    bullets.push(
      <span key="debt-flow">
        {debt.lifetimeInflow > DUST && (
          <>{fig(debt.lifetimeInflow, valued ? debt.lifetimeInflow : null, valued, debtSym)} borrowed</>
        )}
        {repaidAmt > DUST && (
          <>
            {debt.lifetimeInflow > DUST ? ", " : ""}
            {fig(repaidAmt, repaidUsd, valued, debtSym)} repaid
          </>
        )}
        {" over the trove's life."}
      </span>,
    );
  }

  const redeemedDebt = redeemedLine(debt);
  const redeemedColl = redeemedLine(collateral);
  if (redeemedDebt) {
    bullets.push(
      <span key="redeemed">
        The trove has been redeemed against: {fig(redeemedDebt.amount, redeemedDebt.usd, valued, debtSym)} of debt was
        cleared this way
        {redeemedColl && <>, taking {fig(redeemedColl.amount, redeemedColl.usd, valued, collSym)} collateral</>}.
      </span>,
    );
  }

  const liquidatedDebt = liquidatedLine(debt);
  const liquidatedColl = liquidatedLine(collateral);
  if (liquidatedDebt) {
    bullets.push(
      <span key="liquidated">
        {fig(liquidatedDebt.amount, liquidatedDebt.usd, valued, debtSym)} of debt was cleared in liquidation
        {liquidatedColl && <>, seizing {fig(liquidatedColl.amount, liquidatedColl.usd, valued, collSym)} collateral</>}.
      </span>,
    );
  }

  const collNow = collateral.current[0];
  const debtNow = debt.current[0];
  if (collNow || debtNow) {
    bullets.push(
      <span key="current">
        The trove currently holds {collNow ? fig(collNow.amount, collNow.usd, valued, collSym) : `no ${collSym}`}{" "}
        backing {debtNow ? fig(debtNow.amount, debtNow.usd, valued, debtSym) : "no debt"}.
      </span>,
    );
  } else if (bullets.length > 0) {
    bullets.push(<span key="closed">The trove is closed — no collateral or debt remain.</span>);
  }

  bullets.push(
    <span key="mechanic">
      Liquity V1 charges no ongoing interest: the debt is the trove&apos;s exact obligation, and opening sets aside a
      200 LUSD gas-compensation reserve, refunded in full when the trove closes normally.
    </span>,
  );

  if (!valued) {
    bullets.push(
      <span key="unvalued">
        Amounts are shown in token units — the trove&apos;s own ETH oracle price wasn&apos;t available on this load, so
        no dollar total is shown.
      </span>,
    );
  }

  if (bullets.length === 0) return null;

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures total the trove&apos;s lifetime flows on Liquity V1 across every event in its captured history.
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

const LIQUITY_V1_FAQ = {
  BORROWING: "https://docs.liquity.org/liquity-v1/faq/borrowing",
  REDEMPTIONS: "https://docs.liquity.org/liquity-v1/faq/lusd-redemptions",
  LIQUIDATIONS: "https://docs.liquity.org/liquity-v1/faq/stability-pool-and-liquidations",
} as const;

/** The tower's "?" FAQ for Liquity V1. */
export function liquityV1EconomicsContent(): LearnMoreContent {
  return {
    title: "About the Economics",
    intro:
      "This panel replays the trove's own TroveUpdated events into lifetime flows, and reads its current ETH and LUSD balances from the chain at the head block. Liquity V1 charges no ongoing interest, so the LUSD figure is the trove's exact obligation.",
    stepsHeading: "How the tower is built:",
    steps: [
      "Deposited, withdrawn, borrowed and repaid are summed from the trove's own signed balance deltas, event by event.",
      "Redemptions and liquidations are kept apart from voluntary flows — each is its own bar.",
      "USD values use the protocol's own pricing (the PriceFeed's ETH price and LUSD's $1 redemption face) and appear only once that on-chain price has loaded.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "No ongoing interest",
        text: "the debt never grows on its own — only draws, repayments, redemptions and liquidations change it.",
      },
      {
        bold: "Gas-compensation reserve",
        text: "200 LUSD is set aside when the trove opens and refunded when it closes normally.",
      },
    ],
    links: [
      { label: "Borrowing FAQ", url: LIQUITY_V1_FAQ.BORROWING },
      { label: "Redemptions FAQ", url: LIQUITY_V1_FAQ.REDEMPTIONS },
      { label: "Stability Pool & liquidations FAQ", url: LIQUITY_V1_FAQ.LIQUIDATIONS },
    ],
  };
}
