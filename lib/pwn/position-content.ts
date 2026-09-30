// Position-panel "?" content for the PWN loan card — the state explainer for
// the panel that reads the loan's struck terms (or, on a repaid/defaulted
// loan, how it settled). Distinct from the event-level modals in
// lib/shared/learn-more-content.ts (pwnLoanCreatedContent,
// pwnDefaultContent), which explain individual actions.
//
// A PWN "position" is a discrete fixed-term loan, not a pooled account: there
// is no collateral ratio and no oracle. What is fixed at origination depends
// on the terms: a v1.1 loan's repayment total, or a v1.2/v1.3 loan's rate,
// whose interest accrues by the minute until repayment. Each claim below keys
// on that shape, and the extension concept appears only where the loan was
// extended or, still running, could be.

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { formatDate } from "@/lib/date";

const PWN_DOC_URL = "https://docs.pwn.xyz";

/** The extension rule per contract version (pwn_contracts tags v1.1 and v1.3). */
const extensionsConcept = (version: string | null | undefined, accruing: boolean) =>
  version === "v12" || version === "v13"
    ? {
        bold: "Extensions",
        text: `one party proposes a later deadline (1 to 90 days) and the other accepts it; the proposal can carry a compensation the borrower pays the note holder.${accruing ? " Interest keeps accruing through the extra days." : ""}`,
      }
    : {
        bold: "Extensions",
        text: "the LOAN note's holder can move the deadline later, to at most 30 days after the day it acts, and can do so again. Nothing is paid for it and the repayment total stays as struck; each move is a row on the timeline.",
      };

export function pwnPositionContent(opts: {
  status: "open" | "repaid" | "defaulted";
  /** Open on the index, past its deadline, not yet claimed. */
  unclaimed?: boolean;
  /** The deadline the terms struck, and the one the latest extension set
   *  (unix seconds), where the parties moved it. */
  struckDueAt?: number | null;
  extendedDueAt?: number | null;
  extensionCount?: number;
  version?: string | null;
  /** The terms accrue interest at an APR (v1.2/v1.3). */
  accruing?: boolean;
}): LearnMoreContent {
  const { status } = opts;
  const accruing = opts.accruing === true;
  const extended =
    opts.extendedDueAt != null && opts.struckDueAt != null && opts.extendedDueAt !== opts.struckDueAt
      ? { from: formatDate(opts.struckDueAt), to: formatDate(opts.extendedDueAt) }
      : null;
  const wasExtended = extended != null || (opts.extensionCount ?? 0) > 0;
  const ext = extensionsConcept(opts.version, accruing);

  const cost = accruing
    ? {
        bold: "Interest by the minute",
        text: "the terms fix a yearly rate, and the interest is the principal times that rate for each whole minute from origination to repayment. Repaying early costs less; the deadline caps it, because the contract refuses a repayment after it.",
      }
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
        accruing
          ? {
              bold: "What went unpaid",
              text: "the terms fixed a yearly rate; what the borrower missed is the principal plus that rate's interest from origination to the deadline, the most the loan could ever owe.",
            }
          : {
              bold: "Fixed by construction",
              text: "the repayment total the borrower missed was fixed at origination — principal plus fixed interest, in the credit token — and never floated.",
            },
        ...(wasExtended ? [ext] : []),
      ],
      links: [{ label: "PWN docs", url: PWN_DOC_URL }],
    };
  }

  if (status === "repaid") {
    return {
      title: "About This Position",
      intro:
        (accruing
          ? "This loan was repaid before its deadline: the borrower paid the principal plus the interest accrued to that minute, and the escrowed collateral was released back to them."
          : extended
            ? `This loan was repaid in full before its extended deadline of ${extended.to} (struck as ${extended.from}): the borrower paid the fixed total struck at origination, and the escrowed collateral was released back to them.`
            : "This loan was repaid in full before its deadline: the borrower paid the fixed total struck at origination, and the escrowed collateral was released back to them.") +
        " The panel above shows the terms as struck.",
      detailsHeading: "Key concepts:",
      details: [
        cost ?? {
          bold: "Fixed by construction",
          text: "the repayment total — principal plus fixed interest — was set when the loan was struck and does not change with the day it is paid.",
        },
        {
          bold: "The LOAN note",
          text: "the lender's claim was a transferable ERC-721; claiming the repayment burned the note, closing the loan.",
        },
        ...(wasExtended ? [ext] : []),
      ],
      links: [{ label: "PWN docs", url: PWN_DOC_URL }],
    };
  }

  if (opts.unclaimed) {
    return {
      title: "About This Position",
      intro:
        "This loan has defaulted and no one has claimed it yet: its deadline passed unpaid, so the contract no longer accepts a repayment. The collateral stays in escrow until the lender claims it.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "A clock event, not a price event",
          text: "nothing watched the collateral's value; the deadline passing is the whole of the default.",
        },
        {
          bold: "What the lender can do",
          text:
            opts.version === "v12" || opts.version === "v13"
              ? "claim the collateral at any time, or agree an extension with the borrower that moves the deadline back into the future."
              : "claim the collateral at any time, or, holding the LOAN note, move the deadline to a date up to 30 days ahead, which lets the borrower repay again.",
        },
        {
          bold: "The LOAN note",
          text: "the lender's claim is a transferable ERC-721 whose token id is the loan id — the loan settles to whoever holds it.",
        },
        ...(wasExtended ? [ext] : []),
      ],
      links: [{ label: "PWN docs", url: PWN_DOC_URL }],
    };
  }

  // A running loan.
  return {
    title: "About This Position",
    intro:
      "This panel explains the loan's struck terms in plain language — what the borrower posted, what the lender advanced, and what happens if the deadline passes unpaid.",
    detailsHeading: "Key concepts:",
    details: [
      cost ?? {
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
        text: "once the deadline — the latest one, where it was extended — passes with the loan unpaid, it defaults by the clock alone: the borrower can no longer repay, and the lender can claim the collateral at any time after.",
      },
      ext,
    ],
    links: [{ label: "PWN docs", url: PWN_DOC_URL }],
  };
}
