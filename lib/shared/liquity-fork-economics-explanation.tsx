// Shared economics Explanation + FAQ for the Liquity V2 fork trio (Asymmetry,
// Ebisu, Basedollar) — one grammar parameterised by name + debt symbol, so the
// three explorers narrate their towers identically rather than carrying three
// near-copies. See lib/liquity-v1/economics-explanation.tsx for the V1 sibling
// and components/protocol/liquity/trove-economics.tsx for the V2 benchmark.

import type { ReactNode } from "react";
import type { LearnMoreContent, LearnMoreLink } from "@/components/shared/learn-more-modal";
import type { ChainTruthTowerData, TowerSideData } from "@/lib/shared/chain-truth-economics";
import { formatCompact } from "@/lib/utils/format";
import { formatCompactUsd } from "@/components/shared/economics-chart-primitives";

const DUST = 1e-9;

export interface LiquityForkEconomicsParams {
  /** Display name ("Asymmetry" | "Ebisu" | "Base Dollar"). */
  name: string;
  /** The fork's stablecoin symbol ("USDaf" | "ebUSD" | "BD"). */
  debtSymbol: string;
  /** One live-verified docs/site link for the FAQ. */
  docsLink?: LearnMoreLink;
}

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

/** Explanation body for a Liquity V2 fork tower — a lead sentence plus bullets
 *  derived from `data`. Returns null when there's nothing to narrate. */
export function liquityForkEconomicsExplanation(
  data: ChainTruthTowerData,
  { name, debtSymbol }: LiquityForkEconomicsParams,
): ReactNode {
  const { collateral, debt, valued } = data;
  const collSym = sideSymbol(collateral, "collateral");
  const debtSym = sideSymbol(debt, debtSymbol);
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
        {` over the trove's life, including interest and any upfront fees applied at each touch.`}
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
      {name} is a Liquity V2 fork: this trove carries an interest rate — set by its owner or delegated to a batch
      manager — that accrues into the debt, and redemptions sweep the branch&apos;s lowest rates first.
    </span>,
  );

  if (!valued) {
    bullets.push(
      <span key="unvalued">
        Amounts are shown in token units — the branch&apos;s own oracle price wasn&apos;t available on this load, so no
        dollar total is shown.
      </span>,
    );
  }

  if (bullets.length === 0) return null;

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures total this trove&apos;s lifetime flows on {name} across every event in its captured history.
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

/** The tower's "?" FAQ for a Liquity V2 fork. */
export function liquityForkEconomicsContent({
  name,
  debtSymbol,
  docsLink,
}: LiquityForkEconomicsParams): LearnMoreContent {
  return {
    title: "About the Economics",
    intro: `This panel replays the trove's own events into lifetime flows, and reads its current collateral and ${debtSymbol} debt from the chain at the head block — the Liquity V2 architecture ${name} runs.`,
    stepsHeading: "How the tower is built:",
    steps: [
      "Deposited, withdrawn, borrowed and repaid are summed from the trove's own signed balance deltas, event by event.",
      'Debt increases counted as "borrowed" include new draws, the one-time upfront fee, and interest applied whenever an operation touched the trove.',
      "Redemptions and liquidations are kept apart from voluntary flows — each is its own bar.",
      `USD values use the branch's own oracle price for collateral and ${debtSymbol}'s $1 redemption face for debt, and appear only once that on-chain price has loaded.`,
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "User-set (or delegated) interest",
        text: "each trove carries its own annual rate — set by the borrower or a batch manager they delegate to — accruing continuously into the debt.",
      },
      {
        bold: "Redemption queue",
        text: `${debtSymbol} holders can redeem at $1 face against the branch's lowest-rate troves first — a peg mechanism, not a penalty.`,
      },
    ],
    links: docsLink ? [docsLink] : undefined,
  };
}
