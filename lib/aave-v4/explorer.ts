// Aave V4's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts the
// shared units read, for the Ethereum and Base spokes. For now the event
// page's (ui-jobs 236): the spoke and the account, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isAaveV4Event, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { aaveV4Label } from "@/lib/aave-v4/event-label";

const WORDS = {
  paragraph: (spoke: string) => `This page is one transaction from this account's history on the ${spoke} spoke.`,
  timeline_link: "See the whole history in the timeline.",
  timeline_hint: "Open this event in the account's timeline",
  spoke: "Spoke",
  account: "Account",
  copy_account: "Copy the account's address",
  description: (spoke: string, account: string, day: string) =>
    `One transaction from the Aave V4 ${spoke} spoke account ${account}, on ${day}.`,
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export interface AaveV4EventPageInput extends EventPageSlot {
  spokeName: string;
  wallet: string;
  deployment: "ethereum" | "base";
}

/** The event's heading: T1's word. Also read on the server. */
export function aaveV4EventHeading(event: BaseActivityEvent): string {
  return isAaveV4Event(event) ? aaveV4Label(event.context.data) : event.actionLabel;
}

/** The page's metadata description, also read on the server. */
export function aaveV4EventPageDescription(spokeName: string, wallet: string, timestamp: number): string {
  return `${WORDS.description(spokeName, short(wallet), formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export const aaveV4Explorer: ExplorerAdapter<AaveV4EventPageInput> = {
  eventPage: ({ spokeName, wallet, deployment, event, ...slot }) => ({
    heading: aaveV4EventHeading(event),
    words: {
      paragraph: WORDS.paragraph(spokeName),
      timelineLink: WORDS.timeline_link,
      timelineHint: WORDS.timeline_hint,
    },
    facts: [
      { key: "spoke", label: WORDS.spoke, value: spokeName },
      {
        key: "account",
        label: WORDS.account,
        value: wallet,
        mono: true,
        copy: WORDS.copy_account,
        href: listingHrefForWallet(deployment === "base" ? "aave-v4-base" : "aave-v4", wallet) ?? undefined,
      },
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: aaveV4EventPageDescription(spokeName, wallet, event.timestamp),
  }),
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
