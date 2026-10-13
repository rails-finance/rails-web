// Alchemix's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts the
// shared units read, for the three position types: Alchemist V3 positions on
// Ethereum and Base, Transmuter positions on both, and the closed V2 accounts
// on Ethereum. For now the event page's (ui-jobs 236): the line, the position
// and its holder, then the shared rows.

import type { EventPageFact, EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { transmuterListingPath, v2ListingPath, type AlchemixDeployment } from "@/lib/alchemix/lines";
import { alchemixPositionName, alchemixV2PositionName, type AlchemixPositionKind } from "@/lib/alchemix/naming";
import { alchemixEventHeading } from "@/lib/alchemix/event-label";

const WORDS = {
  paragraph: "This page is one transaction from this position's history.",
  timeline_link: "See the whole history in the timeline.",
  timeline_hint: "Open this event in the position's timeline",
  line: "Line",
  position: "Position",
  copy_position: "Copy the position's token id",
  owner: "Owner",
  claimed_by: "Claimed by",
  account: "Account",
  copy_account: "Copy the account's address",
  description: (name: string, chain: string, day: string) =>
    `One transaction from the Alchemix ${name} on ${chain}, on ${day}.`,
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const chainName = (d: AlchemixDeployment) => (d.chainId === 8453 ? "Base" : "Ethereum");

export interface AlchemixEventPageInput extends EventPageSlot {
  deployment: AlchemixDeployment;
  kind: AlchemixPositionKind;
  /** The line's name as the page states it ("alUSD"). */
  lineName: string;
  syntheticSymbol: string;
  /** The token id; a V2 account's address. */
  id: string;
  /** The holder now, or the address that claimed a Transmuter position; null
   *  where the read names none. Unused on V2, whose account is the holder. */
  owner: string | null;
  /** True where `owner` is a Transmuter position's claimer. */
  claimed?: boolean;
  /** The position's served rows, for the heading: a card's label reads the
   *  other legs of its transaction. */
  rows: readonly BaseActivityEvent[];
}

/** The event's heading: T1's word. Also read on the server. */
export { alchemixEventHeading };

/** The page's metadata description, also read on the server. */
export function alchemixEventPageDescription(
  deployment: AlchemixDeployment,
  syntheticSymbol: string,
  id: string,
  timestamp: number,
  kind: AlchemixPositionKind = "alchemist",
): string {
  const name =
    kind === "v2" ? alchemixV2PositionName(syntheticSymbol, id) : alchemixPositionName(syntheticSymbol, id, kind);
  return `${WORDS.description(name, chainName(deployment), formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

/** The holder's listing on this position type. */
function holderHref(deployment: AlchemixDeployment, kind: AlchemixPositionKind, wallet: string): string | undefined {
  const q = `?q=${encodeURIComponent(wallet.toLowerCase())}`;
  if (kind === "transmuter") return `${transmuterListingPath(deployment)}${q}`;
  if (kind === "v2") return `${v2ListingPath(deployment)}${q}`;
  return listingHrefForWallet(deployment.session, wallet) ?? undefined;
}

function facts({ deployment, kind, lineName, id, owner, claimed }: AlchemixEventPageInput): EventPageFact[] {
  const line: EventPageFact = { key: "line", label: WORDS.line, value: lineName };
  if (kind === "v2")
    return [
      line,
      {
        key: "account",
        label: WORDS.account,
        value: short(id),
        full: id,
        mono: true,
        copy: WORDS.copy_account,
        href: holderHref(deployment, kind, id),
      },
    ];
  return [
    line,
    { key: "position", label: WORDS.position, value: id, mono: true, copy: WORDS.copy_position },
    ...(owner
      ? [
          {
            key: "owner",
            label: claimed ? WORDS.claimed_by : WORDS.owner,
            value: short(owner),
            full: owner,
            mono: true,
            href: holderHref(deployment, kind, owner),
          },
        ]
      : []),
  ];
}

export const alchemixExplorer: ExplorerAdapter<AlchemixEventPageInput> = {
  eventPage: (input) => {
    const { deployment, kind, syntheticSymbol, id, rows, event, n, total, previousHref, nextHref, timelineHref } =
      input;
    return {
      heading: alchemixEventHeading(event, rows),
      words: {
        paragraph: WORDS.paragraph,
        timelineLink: WORDS.timeline_link,
        timelineHint: WORDS.timeline_hint,
      },
      facts: facts(input),
      n,
      total,
      previousHref,
      nextHref,
      timelineHref,
      blockNumber: event.blockNumber,
      txHash: event.txHash,
      eventId: event.id,
      description: alchemixEventPageDescription(deployment, syntheticSymbol, id, event.timestamp, kind),
    };
  },
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
