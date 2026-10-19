// Aave V4's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts the
// shared units read, for the Ethereum and Base spokes. For now the event
// page's (ui-jobs 236): the spoke and the account, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isAaveV4Event, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { eventTitleWords, makeEventTitle, type EventTitle } from "@/lib/shared/event-title";
import { aaveV4Label } from "@/lib/aave-v4/event-label";
import { aaveV4EventProse, type AaveV4Event } from "@/lib/aave-v4/event-prose";

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

/** The event's title: T1's word and the amounts its head states (a
 *  liquidation's seized collateral and repaid debt, else the amount moved; a
 *  collateral toggle moves none). Also read on the server. */
export function aaveV4EventTitle(event: BaseActivityEvent): EventTitle {
  if (!isAaveV4Event(event)) return makeEventTitle(event, event.actionLabel, []);
  const ctx = event.context.data;
  const kind = aaveV4Label(ctx);
  if (ctx.eventType === "liquidation")
    return makeEventTitle(event, kind, [
      {
        value: Number(ctx.liquidatedCollateralAmount ?? "0") || 0,
        symbol: ctx.collateralSymbol ?? "",
        label: "Seized",
      },
      { value: Number(ctx.debtToCover ?? "0") || 0, symbol: ctx.reserveSymbol ?? "", label: "Repaid" },
    ]);
  return makeEventTitle(event, kind, [{ value: parseFloat(ctx.amount ?? "0") || 0, symbol: ctx.reserveSymbol ?? "" }]);
}

/** The event's heading: the title in words. Also read on the server. */
export function aaveV4EventHeading(event: BaseActivityEvent): string {
  return eventTitleWords(aaveV4EventTitle(event));
}

/** The browser title's last words (rails-ops decision 0045, "Ruled since"):
 *  the Explanation's first sentence, which the page's h1 states, else the
 *  heading. `events`: the timeline's events, for the same-transaction seam.
 *  Read on the server. */
export function aaveV4EventTabWords(event: BaseActivityEvent, events: readonly BaseActivityEvent[]): string {
  if (!isAaveV4Event(event)) return aaveV4EventHeading(event);
  const self = event as AaveV4Event;
  const siblings = events.filter((e): e is AaveV4Event => e.txHash === event.txHash && isAaveV4Event(e));
  const { L4 } = aaveV4EventProse({
    ctx: event.context.data,
    siblings: siblings.length > 0 ? siblings : [self],
    self,
  });
  return L4[0]?.text ?? aaveV4EventHeading(event);
}

/** The page's metadata description, also read on the server. */
export function aaveV4EventPageDescription(spokeName: string, wallet: string, timestamp: number): string {
  return `${WORDS.description(spokeName, short(wallet), formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export const aaveV4Explorer: ExplorerAdapter<AaveV4EventPageInput> = {
  eventPage: ({ spokeName, wallet, deployment, event, ...slot }) => ({
    heading: aaveV4EventHeading(event),
    title: aaveV4EventTitle(event),
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
