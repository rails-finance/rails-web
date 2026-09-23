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

const PWN_DOC_URL = "https://docs.pwn.xyz";

export function pwnPositionContent(opts: { status: "open" | "repaid" | "defaulted" }): LearnMoreContent {
  const { status } = opts;

  if (status === "defaulted") {
    return {
      title: "About This Position",
      intro:
        "This loan defaulted: its deadline passed unpaid, and the lender claimed the escrowed collateral in place of repayment. The panel above shows the terms as struck.",
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
      ],
      links: [{ label: "PWN docs", url: PWN_DOC_URL }],
    };
  }

  if (status === "repaid") {
    return {
      title: "About This Position",
      intro:
        "This loan was repaid in full before its deadline: the borrower paid the fixed total struck at origination, and the escrowed collateral was released back to them. The panel above shows the terms as struck.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Fixed by construction",
          text: "the repayment total — principal plus fixed interest — was set when the loan was struck and never floated; paying early didn't discount it.",
        },
        {
          bold: "The LOAN note",
          text: "the lender's claim was a transferable ERC-721; claiming the repayment burned the note, closing the loan.",
        },
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
        text: "once the deadline passes with the loan unpaid, it defaults by the clock alone: the lender can claim the collateral in place of repayment at any time after.",
      },
    ],
    links: [{ label: "PWN docs", url: PWN_DOC_URL }],
  };
}
