"use client";

// The card's line naming the loans on this page. The Controller keys a
// position by (market, borrower), so a borrower who repaid in full and later
// borrowed again writes both loans here: "Loan 2 of 2, open since 12 Jul 2025 ·
// earlier loan 25 Apr – 12 Jul 2025, repaid"; on a closed page "Loan 2 of 2,
// 12 Jul – 3 Sep 2025, liquidated · …". Each loan that ended in liquidation
// adds the owner's outcome. The Liquity V1 lives line is the model.

import { formatDate, formatDayMonth } from "@/lib/date";
import { fmtColl, type LlamalendLoan } from "@/lib/llamalend/event-figures";
import { formatNumber } from "@/lib/utils/format";

function span(l: LlamalendLoan): string {
  if (l.closedAt == null) return `from ${formatDate(l.openedAt)}`;
  const sameYear = new Date(l.openedAt * 1000).getUTCFullYear() === new Date(l.closedAt * 1000).getUTCFullYear();
  return `${sameYear ? formatDayMonth(l.openedAt) : formatDate(l.openedAt)} – ${formatDate(l.closedAt)}`;
}

export function LlamalendLoansLine({
  loans,
  borrowedSymbol,
  collateralSymbol,
}: {
  loans: LlamalendLoan[];
  borrowedSymbol: string;
  collateralSymbol: string;
}) {
  const at = loans.length - 1;
  if (loans.length < 2) return null;
  const last = loans[at];
  const liquidated = loans
    .map((l, i) => ({ l, n: i + 1 }))
    .filter(
      ({ l }) =>
        l.ending === "liquidated" && l.borrowed - l.repaid > 0 && l.collateralAdded - l.collateralWithdrawn > 0,
    );
  return (
    <>
      <p className="text-xs text-rb-500" data-llamalend-loans="">
        Loan {at + 1} of {loans.length}
        {last.closedAt == null ? `, open since ${formatDate(last.openedAt)}` : `, ${span(last)}, ${last.ending}`}
        {loans.slice(0, at).map((l, i) => (
          <span key={l.openedAt}>
            {" · "}
            {loans.length > 2 ? `loan ${i + 1}` : "earlier loan"} {span(l)}, {l.ending}
          </span>
        ))}
      </p>
      {liquidated.map(({ l, n }) => (
        <LlamalendOwnerOutcomeLine
          key={l.openedAt}
          loan={n}
          kept={l.borrowed - l.repaid}
          lost={l.collateralAdded - l.collateralWithdrawn}
          borrowedSymbol={borrowedSymbol}
          collateralSymbol={collateralSymbol}
          repaidAny={l.repaid > 0}
          withdrewAny={l.collateralWithdrawn > 0}
        />
      ))}
    </>
  );
}

/** A liquidated loan's outcome for its owner, in one line: the borrowed token
 *  they kept (borrowed − repaid) and the collateral they lost (deposited −
 *  withdrawn). A hard liquidation pays the owner nothing (Controller
 *  _liquidate). `loan` names the loan where the page holds several. */
export function LlamalendOwnerOutcomeLine({
  loan,
  kept,
  lost,
  borrowedSymbol,
  collateralSymbol,
  repaidAny,
  withdrewAny,
}: {
  loan?: number;
  kept: number;
  lost: number;
  borrowedSymbol: string;
  collateralSymbol: string;
  repaidAny: boolean;
  withdrewAny: boolean;
}) {
  return (
    <p className="text-xs text-rb-500" data-llamalend-owner-outcome="">
      For the owner{loan != null ? `, loan ${loan}` : ""}: kept the {formatNumber(kept)} {borrowedSymbol} borrowed
      {repaidAny ? " and not repaid" : ""}; lost the {fmtColl(lost)} {collateralSymbol}{" "}
      {withdrewAny ? "left in the position" : "deposited"}.
    </p>
  );
}
