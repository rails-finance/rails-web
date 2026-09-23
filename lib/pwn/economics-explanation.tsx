// PWN economics Explanation — the plain-language narration under the
// chain-truth tower, mirroring the V2 benchmark (trove-economics.tsx). PWN
// loans never accrue and never flow — computePwnEconomics only ever populates
// `current`, so the bullets narrate the struck terms, not a lifetime replay.

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { ChainTruthTowerData } from "@/lib/shared/chain-truth-economics";
import { formatCompact } from "@/lib/utils/format";

// PWN is always token mode — collateral is frequently an ERC-721 with no price.
const fig = (amount: number, symbol: string): string => `${formatCompact(amount)} ${symbol}`;

/** Explanation body for the PWN tower — a lead sentence plus bullets derived
 *  from `data`. Returns null when there's nothing to narrate (a closed loan
 *  carries no current lines). */
export function pwnEconomicsExplanation(data: ChainTruthTowerData): ReactNode {
  const { collateral, debt } = data;
  const collNow = collateral.current[0];
  const debtNow = debt.current[0];
  const interest = debt.interest;

  if (!collNow && !debtNow) return null;

  const bullets: ReactNode[] = [];

  bullets.push(
    <span key="current">
      This loan holds {collNow ? fig(collNow.amount, collNow.symbol) : "no collateral"} in escrow against{" "}
      {debtNow ? fig(debtNow.amount, debtNow.symbol) : "no"} principal credit.
    </span>,
  );

  if (interest && interest.amount > 0) {
    bullets.push(
      <span key="interest">
        A further {fig(interest.amount, interest.symbol)} of fixed interest is owed on top of the principal, agreed at
        origination — it does not grow or shrink between now and repayment.
      </span>,
    );
  }

  bullets.push(
    <span key="mechanic">
      A PWN loan is peer-to-peer and fixed-term: the collateral, the credit and the repayment total are struck between
      lender and borrower at origination, and the loan settles only by repayment or by default at the deadline — nothing
      accrues in between.
    </span>,
  );

  bullets.push(
    <span key="unvalued">
      Amounts are shown in token units — collateral and credit are often different assets with no shared price, so the
      two sides aren&apos;t directly comparable.
    </span>,
  );

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">These figures state this loan&apos;s struck terms on PWN as they stand today.</p>
      {bullets.map((item, i) => (
        <div key={i} className="flex items-start gap-2 leading-relaxed">
          <span className="select-none text-rb-500">•</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

const PWN_DOC_URL = "https://docs.pwn.xyz";

/** The tower's "?" FAQ for PWN. */
export function pwnEconomicsContent(): LearnMoreContent {
  return {
    title: "About the Economics",
    intro:
      "This panel reads the loan's struck terms — collateral, credit principal and fixed interest — straight from the loan's own on-chain terms. A PWN loan is fixed by construction: no oracle, no health factor and no accrual, so there is no lifetime flow to replay.",
    stepsHeading: "How the tower is built:",
    steps: [
      "Collateral and credit principal are the amounts locked into the loan's terms at origination.",
      "Fixed interest is the repayment total agreed at origination minus the principal — it never changes.",
      "A closed loan (repaid or defaulted) has no live balance, so the tower shows nothing for it — the timeline carries the settled story instead.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Fixed by construction",
        text: "nothing accrues and nothing floats — the repayment owed on the last day is the number struck on the first.",
      },
      {
        bold: "Two outcomes",
        text: "a loan settles by repayment (the lender collects principal plus interest) or by default at the deadline (the lender claims the collateral instead).",
      },
    ],
    links: [{ label: "PWN docs", url: PWN_DOC_URL }],
  };
}
