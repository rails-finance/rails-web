// Dolomite's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts the
// shared units read. For now the event page's (ui-jobs 236): the account's
// number and its owner, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";

const WORDS = {
  paragraph: "This page is one transaction from this account's history on Dolomite.",
  timeline_link: "See the whole history in the timeline.",
  timeline_hint: "Open this event in the account's timeline",
  account_number: "Account number",
  copy_account_number: "Copy the account number",
  owner: "Owner",
  copy_owner: "Copy the owner's address",
  description: (owner: string, accountNumber: string, day: string) =>
    `One transaction from the Dolomite account ${accountNumber} of ${owner}, on ${day}.`,
};

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const shortNumber = (n: string) => (n.length > 12 ? `${n.slice(0, 8)}…` : n);

export interface DolomiteEventPageInput extends EventPageSlot {
  owner: string;
  accountNumber: string;
}

/** The event's heading: T1's word. Also read on the server. */
export function dolomiteEventHeading(event: BaseActivityEvent): string {
  return event.actionLabel;
}

/** The page's metadata description, also read on the server. */
export function dolomiteEventPageDescription(owner: string, accountNumber: string, timestamp: number): string {
  return `${WORDS.description(shortAddress(owner), shortNumber(accountNumber), formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export const dolomiteExplorer: ExplorerAdapter<DolomiteEventPageInput> = {
  eventPage: ({ owner, accountNumber, event, ...slot }) => ({
    heading: dolomiteEventHeading(event),
    words: {
      paragraph: WORDS.paragraph,
      timelineLink: WORDS.timeline_link,
      timelineHint: WORDS.timeline_hint,
    },
    facts: [
      {
        key: "account-number",
        label: WORDS.account_number,
        value: accountNumber,
        mono: true,
        copy: WORDS.copy_account_number,
      },
      {
        key: "owner",
        label: WORDS.owner,
        value: owner,
        mono: true,
        copy: WORDS.copy_owner,
        href: listingHrefForWallet("dolomite", owner) ?? undefined,
      },
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: dolomiteEventPageDescription(owner, accountNumber, event.timestamp),
  }),
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
