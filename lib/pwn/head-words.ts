// PWN's timeline head as words (rails-ops decision 0045, TO-DO-ui-jobs 367): the
// past-participle kind, at most one clause for a state the spine cannot show
// ("Loan defaulted", an extension's new deadline), and the page holder's side
// of the loan as a label beside it. The figures are on the spine's flank, the
// Figures sheet and the Explanation.

import type { PwnContext } from "@/lib/shared/types/event-shape";

export const PWN_HEAD_WORDS = {
  sep: "·",
  created: "Created loan",
  minted: "Minted LOAN note",
  repaid: "Repaid",
  claimedRepayment: "Claimed repayment",
  claimedCollateral: "Claimed collateral",
  defaulted: "Loan defaulted",
  extended: "Extended loan",
  deadlineTo: "Deadline to",
  burned: "Burned LOAN note",
  lender: "Lender",
  borrower: "Borrower",
  /** The warning spine's leg on a default's claim. */
  legClaimed: "Claimed",
} as const;

export interface PwnT1Words {
  kind: string;
  /** "Loan defaulted"; an extension's deadline is drawn by the header with its
   *  receipt. */
  clause?: string;
  /** The page holder's side of the loan. */
  side?: string;
}

export function pwnT1Words(ctx: PwnContext): PwnT1Words {
  const W = PWN_HEAD_WORDS;
  const side = ctx.viewerRole === "lender" ? W.lender : ctx.viewerRole === "borrower" ? W.borrower : undefined;
  switch (ctx.eventType) {
    case "created":
      return { kind: W.created, side };
    case "minted":
      return { kind: W.minted, side };
    case "paid_back":
      return { kind: W.repaid, side };
    case "claimed":
      return ctx.defaulted === true
        ? { kind: W.claimedCollateral, clause: W.defaulted, side }
        : { kind: W.claimedRepayment, side };
    case "extended":
      return { kind: W.extended, side };
    case "burned":
      return { kind: W.burned, side };
  }
}

/** The words as one line: the phone caption, the accessible name, and the
 *  page's title where the card has no teaser. `deadline`: an extension's new
 *  deadline, as its clause reads. */
export function pwnT1Caption(w: PwnT1Words, deadline?: string | null): string {
  const clause = w.clause ?? (deadline ? `${PWN_HEAD_WORDS.deadlineTo} ${deadline}` : undefined);
  return [w.kind, clause, w.side].filter(Boolean).join(` ${PWN_HEAD_WORDS.sep} `);
}
