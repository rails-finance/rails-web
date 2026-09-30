// Position-panel "?" content for the PWN loan card — the state explainer for
// the panel that reads the loan's struck terms (or, on a repaid/defaulted
// loan, how it settled). Distinct from the event-level modals in
// lib/shared/learn-more-content.ts (pwnLoanCreatedContent,
// pwnDefaultContent), which explain individual actions.
//
// A PWN "position" is a discrete fixed-term loan, not a pooled account:
// there is no collateral ratio and no oracle — everything is struck once at
// origination. URL matches the one already verified in
// lib/shared/learn-more-content.ts's PWN_DOC_URL (docs.pwn.xyz).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { formatDate } from "@/lib/date";

const PWN_DOC_URL = "https://docs.pwn.xyz";

/** v1.1's extension rule (pwn_contracts tag v1.1, extendLOANExpirationDate). */
const EXTENSIONS = {
  bold: "Extensions",
  text: "the LOAN note's holder can move the deadline later, to at most 30 days after the day it acts, and can do so again. Nothing is paid for it and the repayment total stays as struck; each move is a row on the timeline.",
};

export function pwnPositionContent(opts: {
  status: "open" | "repaid" | "defaulted";
  /** The deadline the terms struck, and the one the latest extension set
   *  (unix seconds), where the parties moved it. */
  struckDueAt?: number | null;
  extendedDueAt?: number | null;
}): LearnMoreContent {
  const { status } = opts;
  const extended =
    opts.extendedDueAt != null && opts.struckDueAt != null && opts.extendedDueAt !== opts.struckDueAt
      ? { from: formatDate(opts.struckDueAt), to: formatDate(opts.extendedDueAt) }
      : null;

  if (status === "defaulted") {
    return {
      title: "About This Position",
      intro:
        (extended
          ? `This loan defaulted: its deadline, extended from ${extended.from} to ${extended.to}, passed unpaid, and the lender claimed the escrowed collateral in place of repayment.`
          : "This loan defaulted: its deadline passed unpaid, and the lender claimed the escrowed collateral in place of repayment.") +
        " The panel above shows the terms as struck.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "A clock event, not a price event",
          text: "no oracle watched the collateral's value and no liquidator was involved — the loan simply expired, and the escrow changed hands as the terms always said it would.",
        },
        {
          bold: "Fixed by construction",
          text: "the repayment total the borrower missed was fixed at origination — principal plus fixed interest, in the credit token — and never floated.",
        },
        EXTENSIONS,
      ],
      links: [{ label: "PWN docs", url: PWN_DOC_URL }],
    };
  }

  if (status === "repaid") {
    return {
      title: "About This Position",
      intro:
        (extended
          ? `This loan was repaid in full before its extended deadline of ${extended.to} (struck as ${extended.from}): the borrower paid the fixed total struck at origination, and the escrowed collateral was released back to them.`
          : "This loan was repaid in full before its deadline: the borrower paid the fixed total struck at origination, and the escrowed collateral was released back to them.") +
        " The panel above shows the terms as struck.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Fixed by construction",
          text: "the repayment total — principal plus fixed interest — was set when the loan was struck and does not change with the day it is paid.",
        },
        {
          bold: "The LOAN note",
          text: "the lender's claim was a transferable ERC-721; claiming the repayment burned the note, closing the loan.",
        },
        EXTENSIONS,
      ],
      links: [{ label: "PWN docs", url: PWN_DOC_URL }],
    };
  }

  // Open (running or past-due) loan — the live, interactive case.
  return {
    title: "About This Position",
    intro:
      "This panel explains the loan's struck terms in plain language — what the borrower posted, what the lender advanced, and what happens if the deadline passes unpaid.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Fixed by construction",
        text: "nothing here accrues and nothing floats — the repayment owed on the deadline is the number struck at origination. There is no oracle and no health factor; the parties priced the risk themselves.",
      },
      {
        bold: "Escrowed collateral",
        text: "the borrower's collateral sits with the loan contract for the loan's life — released on repayment, claimed by the lender on default.",
      },
      {
        bold: "The LOAN note",
        text: "the lender's claim is a transferable ERC-721 whose token id is the loan id — the loan settles to whoever holds it, not necessarily the original lender.",
      },
      {
        bold: "Past due",
        text: "once the deadline — the latest one, where it was extended — passes with the loan unpaid, it defaults by the clock alone: the borrower can no longer repay, and the lender can claim the collateral in place of repayment at any time after, or extend the deadline again.",
      },
      EXTENSIONS,
    ],
    links: [{ label: "PWN docs", url: PWN_DOC_URL }],
  };
}
