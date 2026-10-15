// MakerDAO's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts
// the shared units read. For now the event page's (ui-jobs 236): the
// collateral type, the vault and its owner, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isMakerDAOEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { eventTitleWords, makeEventTitle, type EventTitle } from "@/lib/shared/event-title";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";

const WORDS = {
  paragraph: "This page is one transaction from this vault's history.",
  timeline_link: "See the whole history in the timeline.",
  timeline_hint: "Open this event in the vault's timeline",
  ilk: "Collateral type",
  vault: "Vault",
  copy_vault: "Copy the vault's identifier",
  owner: "Owner",
  description: (ilk: string, vault: string, day: string) =>
    `One transaction from the MakerDAO ${ilk} vault ${vault}, on ${day}.`,
};

const short = (a: string) => (a.startsWith("0x") ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

export interface MakerdaoEventPageInput extends EventPageSlot {
  /** The route's vault: a cdp id, or a LockStake urn's address. */
  vault: string;
  ilk: string;
  /** Null where the read has no owner. */
  owner: string | null;
}

/** The event's title: T1's word and the amounts its head states. An open
 *  keeps the word beside the per-axis verbs; an adjust states only the verbs
 *  ("Deposit 1 ETH Generate 100 DAI"). Also read on the server. */
export function makerdaoEventTitle(event: BaseActivityEvent): EventTitle {
  if (!isMakerDAOEvent(event)) return makeEventTitle(event, event.actionLabel, []);
  const ctx = event.context.data;
  const dink = Number(ctx.dink) || 0;
  const dart = Number(ctx.dart) || 0;
  const isOpen = !!ctx.isOpen;
  const isAdjust = ctx.eventType === "frob" && !isOpen;
  const perAxis = isOpen || isAdjust;
  const debtSymbol = ilkDebtSymbol(ctx.ilk);
  const debt = ctx.debtChange != null ? Number(ctx.debtChange) || 0 : dart;
  const title = makeEventTitle(event, isOpen ? "Open" : event.actionLabel, [
    dink !== 0
      ? { value: dink, symbol: ctx.collateralSymbol, label: perAxis ? (dink > 0 ? "Deposit" : "Withdraw") : undefined }
      : null,
    dart !== 0
      ? { value: debt, symbol: debtSymbol, label: perAxis ? (dart > 0 ? "Generate" : "Repay") : undefined }
      : null,
  ]);
  return isAdjust && title.amounts.length > 0 ? { ...title, kind: "" } : title;
}

/** The event's heading: the title in words. Also read on the server. */
export function makerdaoEventHeading(event: BaseActivityEvent): string {
  return eventTitleWords(makerdaoEventTitle(event));
}

/** The page's metadata description, also read on the server. */
export function makerdaoEventPageDescription(ilk: string, vault: string, timestamp: number): string {
  return `${WORDS.description(ilk, short(vault), formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export const makerdaoExplorer: ExplorerAdapter<MakerdaoEventPageInput> = {
  eventPage: ({ vault, ilk, owner, event, ...slot }) => ({
    heading: makerdaoEventHeading(event),
    title: makerdaoEventTitle(event),
    words: {
      paragraph: WORDS.paragraph,
      timelineLink: WORDS.timeline_link,
      timelineHint: WORDS.timeline_hint,
    },
    facts: [
      { key: "ilk", label: WORDS.ilk, value: ilk },
      { key: "vault", label: WORDS.vault, value: short(vault), full: vault, mono: true, copy: WORDS.copy_vault },
      ...(owner
        ? [
            {
              key: "owner",
              label: WORDS.owner,
              value: short(owner),
              full: owner,
              href: listingHrefForWallet("makerdao", owner) ?? undefined,
            },
          ]
        : []),
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: makerdaoEventPageDescription(ilk, vault, event.timestamp),
  }),
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
