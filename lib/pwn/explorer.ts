// PWN's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts the
// shared units read. For now the event page's (ui-jobs 236): the loan, the
// wallet's side of it and the wallet, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";

const WORDS = {
  paragraph: "This page is one transaction from this loan's history.",
  timeline_link: "See the whole history in the timeline.",
  timeline_hint: "Open this event in the loan's timeline",
  loan: "Loan",
  copy_loan: "Copy the loan's number",
  role: "Role",
  lender: "Lender",
  borrower: "Borrower",
  account: "Account",
  copy_account: "Copy the account's address",
  description: (loanId: string, wallet: string, day: string) =>
    `One transaction from PWN loan #${loanId} of ${wallet}, on ${day}.`,
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export interface PwnEventPageInput extends EventPageSlot {
  loanId: string;
  wallet: string;
  /** The loan's two parties; the wallet's side is named from them. */
  lender: string | null;
  borrower: string | null;
}

/** The event's heading: T1's word. Also read on the server. */
export function pwnEventHeading(event: BaseActivityEvent): string {
  return event.actionLabel;
}

/** The page's metadata description, also read on the server. */
export function pwnEventPageDescription(loanId: string, wallet: string, timestamp: number): string {
  return `${WORDS.description(loanId, short(wallet), formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export const pwnExplorer: ExplorerAdapter<PwnEventPageInput> = {
  eventPage: ({ loanId, wallet, lender, borrower, event, ...slot }) => ({
    heading: pwnEventHeading(event),
    words: {
      paragraph: WORDS.paragraph,
      timelineLink: WORDS.timeline_link,
      timelineHint: WORDS.timeline_hint,
    },
    facts: [
      { key: "loan", label: WORDS.loan, value: loanId, mono: true, copy: WORDS.copy_loan },
      ...(wallet === lender || wallet === borrower
        ? [{ key: "role", label: WORDS.role, value: wallet === lender ? WORDS.lender : WORDS.borrower }]
        : []),
      {
        key: "account",
        label: WORDS.account,
        value: short(wallet),
        full: wallet,
        mono: true,
        copy: WORDS.copy_account,
        href: listingHrefForWallet("pwn", wallet) ?? undefined,
      },
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: pwnEventPageDescription(loanId, wallet, event.timestamp),
  }),
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
