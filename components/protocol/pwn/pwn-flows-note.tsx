// The Lifetime flows panel's Explanation lines and "?" for a PWN loan
// (lib/pwn/flows.ts; rails-ops reference/lifetime-flows-scrubber.md, "PWN").

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { PwnFlowFacts } from "@/lib/pwn/flows";
import { aprText } from "@/lib/pwn/economics";
import { formatNumber } from "@/lib/utils/format";

const DOCS = "https://docs.pwn.xyz";

export interface PwnFlowsNoteProps {
  facts: PwnFlowFacts | null;
  collSymbol: string;
  /** "#58", where the collateral is one NFT or bundle. */
  collLabel: string | null;
  creditSymbol: string;
  apr: number | null;
  /** Which party the viewed wallet is, where it is one. */
  role: "lender" | "borrower" | null;
}

export function PwnFlowsNote({ facts, collSymbol, collLabel, creditSymbol, apr, role }: PwnFlowsNoteProps): ReactNode {
  const f = facts;
  const coll = collLabel ? `${collSymbol} ${collLabel}` : collSymbol;
  return (
    <div className="space-y-2" data-pwn-flows-note="" data-anatomy="F14·pwn">
      <p>
        The bars are the loan&apos;s two sides: the collateral the borrower locked ({coll}) and the debt the borrower
        owes the lender.
        {role === "lender"
          ? " This wallet is the lender: the debt is what it is owed."
          : role === "borrower"
            ? " This wallet is the borrower: the debt is what it owes."
            : ""}{" "}
        PWN has no price oracle, so nothing states what the {collSymbol} is worth in {creditSymbol}: the collateral bar
        is in {collSymbol} and the debt bar in {creditSymbol}, each on its own scale, and the two lengths do not
        compare. The line draws each side on its own scale too.
      </p>
      <p>
        Only three rows move a token: the creation locks the collateral and pays out the principal, and the loan ends
        with a repayment (the collateral goes back to the borrower) or, after the deadline, the lender&apos;s claim on
        the collateral in place of the repayment (Claimed by the lender, Cleared by the default claim). Extensions, the
        LOAN note&apos;s mint and burn, and the note holder&apos;s collection of a repayment move nothing on either
        side.
      </p>
      {f && !f.accrues && (
        <p>
          Interest (dashed) is fixed in the terms: the repay total less the principal
          {f.interest > 0 ? `, ${formatNumber(f.interest)} ${creditSymbol}` : ""}. The contract asks for the whole total
          whenever the borrower repays, so it is owed from the creation and the debt stays flat until the loan ends.
        </p>
      )}
      {f && f.accrues && (
        <p>
          Interest (dashed) accrues by the minute at the terms&apos; rate{apr != null ? ` (${aprText(apr)})` : ""}: the
          principal × the rate × the whole minutes since the creation, as the contract sums it, so each figure is exact
          to the token&apos;s base unit. The line grows by that sum to the end of each day. A repayment is refused once
          the deadline passes, so the debt stops growing there.
          {f.interest > 0 ? ` The rows booked ${formatNumber(f.interest)} ${creditSymbol} of it.` : ""}
          {f.pendingInterest > 0
            ? ` ${formatNumber(f.pendingInterest)} ${creditSymbol} has built up since the creation with no row recording it; at today it is on the Interest line.`
            : ""}
        </p>
      )}
      {f?.lapsed && (
        <p>
          The deadline has passed with no repayment and no claim. Nothing is written when a deadline passes, so the
          collateral is still in escrow and the debt stands at what was owed at the deadline until the lender claims.
        </p>
      )}
      <p>
        PWN is not in the shared daily price store and needs no price here: between events each side stays in its token,
        the debt growing only where the terms accrue.
      </p>
    </div>
  );
}

export function pwnFlowsContent(): LearnMoreContent {
  return {
    title: "About the Lifetime flows",
    intro:
      "The bars add up the loan's rows, the collateral in its token and the debt in the credit token, and the line under them draws what the loan held and owed at the end of each day.",
    stepsHeading: "How it's built:",
    steps: [
      "Collateral: locked in escrow, less returned at repayment, less claimed by the lender, is what the loan holds.",
      "Debt: the principal, plus the interest, less repaid, less cleared by the default claim, is what the borrower owes.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Peer to peer",
        text: "one lender and one borrower strike the loan's collateral, credit, interest and deadline between them; the same wallet can lend on one loan and borrow on another.",
        sources: [{ label: "PWN docs", url: DOCS }],
      },
      {
        bold: "Interest",
        text: "v1.1 loans fix a repay total at creation; later loans state a yearly rate that accrues on the principal for each whole minute until repayment.",
      },
      {
        bold: "Default",
        text: "a repayment is refused once the deadline passes; the lender may then claim the collateral in place of the repayment. Nothing is written until the claim.",
      },
    ],
    links: [{ label: "PWN docs", url: DOCS }],
  };
}
