// Frankencoin economics Explanation — the plain-language narration under the
// chain-truth tower, mirroring the V2 benchmark (trove-economics.tsx): a
// status-lead sentence plus bullets built straight from the tower's own data
// (computeFrankencoinEconomics), never boilerplate.

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { ChainTruthTowerData, TowerSideData } from "@/lib/shared/chain-truth-economics";
import { formatCompact } from "@/lib/utils/format";

const DUST = 1e-9;

const sideSymbol = (side: TowerSideData, fallback: string): string =>
  side.current[0]?.symbol ?? side.exited[0]?.symbol ?? side.liquidated[0]?.symbol ?? fallback;

// Frankencoin runs no oracle — always token mode.
const fig = (amount: number, symbol: string): string => `${formatCompact(amount)} ${symbol}`;

const sideTotal = (lines: TowerSideData["exited"]): number => lines.reduce((sum, l) => sum + l.amount, 0);

/** Explanation body for the Frankencoin tower — a lead sentence plus bullets
 *  derived from `data`. Returns null when there's nothing to narrate. */
export function frankencoinEconomicsExplanation(data: ChainTruthTowerData): ReactNode {
  const { collateral, debt } = data;
  const collSym = sideSymbol(collateral, "collateral");
  const bullets: ReactNode[] = [];

  const collWithdrawn = sideTotal(collateral.exited);
  if (collateral.lifetimeInflow > DUST || collWithdrawn > DUST) {
    bullets.push(
      <span key="coll-flow">
        {collateral.lifetimeInflow > DUST && <>{fig(collateral.lifetimeInflow, collSym)} added</>}
        {collWithdrawn > DUST && (
          <>
            {collateral.lifetimeInflow > DUST ? ", " : ""}
            {fig(collWithdrawn, collSym)} withdrawn
          </>
        )}
        {" over the position's life."}
      </span>,
    );
  }

  const debtRepaid = sideTotal(debt.exited);
  if (debt.lifetimeInflow > DUST || debtRepaid > DUST) {
    bullets.push(
      <span key="debt-flow">
        {debt.lifetimeInflow > DUST && <>{fig(debt.lifetimeInflow, "ZCHF")} minted</>}
        {debtRepaid > DUST && (
          <>
            {debt.lifetimeInflow > DUST ? ", " : ""}
            {fig(debtRepaid, "ZCHF")} repaid
          </>
        )}
        {" over the position's life."}
      </span>,
    );
  }

  const collAuctioned = collateral.liquidated[0];
  const debtAuctioned = debt.liquidated[0];
  if (collAuctioned || debtAuctioned) {
    bullets.push(
      <span key="auction">
        A challenge auction has cleared {collAuctioned && <>{fig(collAuctioned.amount, collSym)} collateral</>}
        {collAuctioned && debtAuctioned && " and "}
        {debtAuctioned && <>{fig(debtAuctioned.amount, "ZCHF")} debt</>} from this position.
      </span>,
    );
  }

  bullets.push(
    <span key="mechanic">
      Frankencoin charges interest up front at minting — each mint deducts the fee for the remaining term — and holds
      back a fixed reserve contribution from every mint, returned on repayment.
    </span>,
  );

  const collNow = collateral.current[0];
  const debtNow = debt.current[0];
  if (collNow || debtNow) {
    bullets.push(
      <span key="current">
        The position currently holds {collNow ? fig(collNow.amount, collSym) : `no ${collSym}`}, backing{" "}
        {debtNow ? fig(debtNow.amount, "ZCHF") : "no"} minted ZCHF.
      </span>,
    );
  } else if (bullets.length > 1) {
    bullets.push(<span key="closed">The position is closed — no collateral or minted debt remain.</span>);
  }

  bullets.push(
    <span key="unvalued">
      Frankencoin runs no price oracle, so amounts are shown in native token units — collateral in {collSym}, debt in
      ZCHF — and the two towers are not directly comparable.
    </span>,
  );

  if (bullets.length === 0) return null;

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures total this position&apos;s lifetime flows on Frankencoin across every event in its captured
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

const FRANKENCOIN_DOC_URL = "https://docs.frankencoin.com";

/** The tower's "?" FAQ for Frankencoin. */
export function frankencoinEconomicsContent(): LearnMoreContent {
  return {
    title: "About the Economics",
    intro:
      "This panel replays the position's own MintingUpdate events into lifetime flows. Frankencoin runs no oracle, so amounts stay in native token units — collateral in the position's own token, debt in ZCHF — and never mix into a USD figure.",
    stepsHeading: "How the tower is built:",
    steps: [
      "Minted, repaid, added and withdrawn collateral are differences between two emitted absolute balances, summed event by event.",
      "Collateral or debt cleared by a challenge auction is bucketed separately, as involuntary.",
      "There is no accrued-interest segment: Frankencoin charges interest up front at minting, so no interest ever accrues on an open position.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Interest up front",
        text: "each mint deducts the fee for the remaining term immediately — the minted figure is already the whole debt.",
      },
      {
        bold: "Reserve contribution",
        text: "a fixed share of every mint is held back in the system reserve and returned on repayment.",
      },
      {
        bold: "Challenge auctions",
        text: "anyone can challenge a position's declared price with a two-phase auction; a successful challenge clears collateral and debt with no oracle involved.",
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}
