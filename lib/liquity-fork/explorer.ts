// The Liquity V2 forks' explorer adapter (rails-ops TO-DO-ui-jobs 307):
// Asymmetry, Basedollar and Ebisu share one view shape, so they share one
// adapter with a deployment field. For now the event page's contract (ui-jobs
// 236): the branch, the Trove id and its holder linked to the deployment's
// listing, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";

export type LiquityForkDeployment = "asymmetry" | "basedollar" | "ebisu";

const NAMES: Record<LiquityForkDeployment, string> = {
  asymmetry: "Asymmetry",
  basedollar: "Basedollar",
  ebisu: "Ebisu",
};

const BURN = "0x0000000000000000000000000000000000000000";

const WORDS = {
  paragraph: "This page is one transaction from this Trove's history.",
  timeline_link: "See the whole history in the timeline.",
  timeline_hint: "Open this event in the Trove's timeline",
  branch: "Branch",
  trove: "Trove",
  copy_trove: "Copy the Trove id",
  holder: "Holder",
  last_holder: "Last holder",
  held_by: (holder: string) => `held by ${holder}`,
  last_held_by: (holder: string) => `last held by ${holder}`,
  description: (protocol: string, branch: string, trove: string, holder: string, day: string) =>
    `One transaction from the ${protocol} ${branch} Trove ${trove}${holder ? `, ${holder}` : ""}, on ${day}.`,
};

const short = (hex: string) => (hex.length > 12 ? `${hex.slice(0, 6)}…${hex.slice(-4)}` : hex);

/** The Trove's holder: the owner, or the last owner once the Trove is closed
 *  (a closed Trove's owner is null or the burn address). */
export function liquityForkHolder(trove: { owner?: string | null; lastOwner?: string | null } | null): {
  address: string | null;
  last: boolean;
} {
  if (trove?.owner && trove.owner.toLowerCase() !== BURN) return { address: trove.owner, last: false };
  return { address: trove?.lastOwner ?? null, last: true };
}

export interface LiquityForkEventPageInput extends EventPageSlot {
  deployment: LiquityForkDeployment;
  /** The route's branch segment. */
  collateralType: string;
  troveId: string;
  owner: string | null;
  lastOwner: string | null;
  ownerEns?: string | null;
}

/** The event's heading: T1's word. Also read on the server. */
export function liquityForkEventHeading(event: BaseActivityEvent): string {
  return event.actionLabel;
}

/** The page's metadata description, also read on the server. */
export function liquityForkEventPageDescription(o: {
  deployment: LiquityForkDeployment;
  collateralType: string;
  troveId: string;
  owner: string | null;
  lastOwner: string | null;
  ownerEns?: string | null;
  timestamp: number;
}): string {
  const holder = liquityForkHolder(o);
  const name = o.ownerEns || (holder.address ? short(holder.address) : "");
  const held = name ? (holder.last ? WORDS.last_held_by(name) : WORDS.held_by(name)) : "";
  return `${WORDS.description(NAMES[o.deployment], o.collateralType, short(o.troveId), held, formatDateLong(o.timestamp))} ${WORDS.timeline_link}`;
}

export const liquityForkExplorer: ExplorerAdapter<LiquityForkEventPageInput> = {
  eventPage: ({ deployment, collateralType, troveId, owner, lastOwner, ownerEns, event, ...slot }) => {
    const holder = liquityForkHolder({ owner, lastOwner });
    return {
      heading: liquityForkEventHeading(event),
      words: {
        paragraph: WORDS.paragraph,
        timelineLink: WORDS.timeline_link,
        timelineHint: WORDS.timeline_hint,
      },
      facts: [
        { key: "branch", label: WORDS.branch, value: collateralType },
        { key: "trove", label: WORDS.trove, value: troveId, mono: true, copy: WORDS.copy_trove },
        {
          key: "holder",
          label: holder.last ? WORDS.last_holder : WORDS.holder,
          value: ownerEns || (holder.address ? short(holder.address) : "Unknown"),
          full: holder.address ?? undefined,
          href: (holder.address && listingHrefForWallet(deployment, holder.address)) || undefined,
        },
      ],
      ...slot,
      blockNumber: event.blockNumber,
      txHash: event.txHash,
      eventId: event.id,
      description: liquityForkEventPageDescription({
        deployment,
        collateralType,
        troveId,
        owner,
        lastOwner,
        ownerEns,
        timestamp: event.timestamp,
      }),
    };
  },
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
