// Liquity V2's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts
// the shared units read. For now the event page's (ui-jobs 236): the branch,
// the Trove id and its holder, the event's place and the neighbours' links.
// The words are the strings file's `page_words` and `action_words`
// (content/liquity-v2/event-prose.yaml).

import type { TroveSummary } from "@/types/api/trove";
import type { ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { ACTION_WORDS, PAGE_WORDS } from "@/lib/liquity/event-templates";
import { eventPageDescription, holderName, troveHolder, type EventPagePlace } from "@/lib/liquity/event-page";
import { liquityEventPath } from "@/lib/liquity/event-page-markdown";

export interface LiquityEventPageInput {
  /** The route's branch segment. */
  collateralType: string;
  troveId: string;
  trove: TroveSummary;
  /** `eventPagePlace` for an event the history holds. */
  place: EventPagePlace & { event: NonNullable<EventPagePlace["event"]> };
}

export const liquityV2Explorer: ExplorerAdapter<LiquityEventPageInput> = {
  eventPage: ({ collateralType, troveId, trove, place }) => {
    const holder = troveHolder(trove);
    const ownerEns = trove.ownerEns ?? null;
    const path = (id: string) => liquityEventPath(collateralType, troveId, id);
    const timelineHref = `/ethereum/liquity-v2/trove/${collateralType}/${troveId}?at=${encodeURIComponent(place.event.id)}`;
    return {
      words: {
        paragraph: PAGE_WORDS.paragraph,
        timelineLink: PAGE_WORDS.timeline_link,
        timelineHint: ACTION_WORDS.in_timeline_hint,
      },
      facts: [
        { key: "branch", label: PAGE_WORDS.branch, value: trove.collateralType },
        { key: "trove", label: PAGE_WORDS.trove, value: troveId, mono: true, copy: PAGE_WORDS.copy_trove },
        {
          key: "holder",
          label: holder.last ? PAGE_WORDS.last_holder : PAGE_WORDS.holder,
          value: holderName(holder.address, ownerEns),
          full: holder.address ?? undefined,
          href: (holder.address && listingHrefForWallet("liquity-v2", holder.address)) || undefined,
        },
      ],
      n: place.n,
      total: place.total,
      blockNumber: place.event.blockNumber,
      txHash: place.event.txHash,
      eventId: place.event.id,
      previousHref: place.previous ? path(place.previous.id) : null,
      nextHref: place.next ? path(place.next.id) : null,
      timelineHref,
      description: eventPageDescription({
        collSymbol: trove.collateralType,
        troveId,
        owner: holder.address,
        ownerEns,
        lastOwner: holder.last,
        n: place.n,
        total: place.total,
        timestamp: place.event.timestamp,
      }),
    };
  },
};
