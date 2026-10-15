// The Liquity V2 forks' explorer adapter (rails-ops TO-DO-ui-jobs 307):
// Asymmetry, Basedollar and Ebisu share one view shape, so they share one
// adapter with a deployment field. For now the event page's contract (ui-jobs
// 236): the branch, the Trove id and its holder linked to the deployment's
// listing, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import {
  isAsymmetryEvent,
  isBasedollarEvent,
  isEbisuEvent,
  type BaseActivityEvent,
} from "@/lib/shared/types/event-shape";
import { eventTitleWords, makeEventTitle, type EventTitle, type EventTitleAmount } from "@/lib/shared/event-title";
import { COLL_VERB, DEBT_VERB, FORK_DEBT_DUST_FLOAT, forkCollMove, forkDebtMove } from "@/lib/shared/liquity-fork-ops";
import { DEBT_SYMBOL as ASYMMETRY_DEBT_SYMBOL } from "@/lib/asymmetry/asset-catalog";
import { DEBT_SYMBOL as BASEDOLLAR_DEBT_SYMBOL } from "@/lib/basedollar/asset-catalog";
import { DEBT_SYMBOL as EBISU_DEBT_SYMBOL } from "@/lib/ebisu/asset-catalog";

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

const DEBT_SYMBOL_OF: Record<LiquityForkDeployment, string> = {
  asymmetry: ASYMMETRY_DEBT_SYMBOL,
  basedollar: BASEDOLLAR_DEBT_SYMBOL,
  ebisu: EBISU_DEBT_SYMBOL,
};

/** The fork contexts are structural twins; any of them drives the title. */
function forkContext(event: BaseActivityEvent, deployment: LiquityForkDeployment) {
  if (deployment === "ebisu") return isEbisuEvent(event) ? event.context.data : null;
  if (deployment === "asymmetry") return isAsymmetryEvent(event) ? event.context.data : null;
  return isBasedollarEvent(event) ? event.context.data : null;
}

/** The event's title: T1's word and the amounts its head states (an open's
 *  and adjust's verbs on each axis, a redemption's cleared debt and reduced
 *  collateral, else what the Trove moved). Also read on the server. */
export function liquityForkEventTitle(event: BaseActivityEvent, deployment: LiquityForkDeployment): EventTitle {
  const ctx = forkContext(event, deployment);
  if (!ctx) return makeEventTitle(event, event.actionLabel, []);
  const debtSymbol = DEBT_SYMBOL_OF[deployment];
  const isOpen = ctx.eventType === "openTrove" || ctx.eventType === "openTroveAndJoinBatch";
  const isRedemption = ctx.eventType === "redeemCollateral";
  const isAdjust = ctx.eventType === "adjustTrove";
  const perAxis = isOpen || isAdjust;
  const coll = forkCollMove(ctx);
  const debt = forkDebtMove(ctx).value;
  const collAmount: EventTitleAmount | null =
    coll !== 0
      ? {
          value: coll,
          symbol: ctx.collateralSymbol,
          label: isRedemption ? "Reduced" : perAxis ? (coll > 0 ? COLL_VERB.add : COLL_VERB.withdraw) : undefined,
        }
      : null;
  const debtAmount: EventTitleAmount | null =
    Math.abs(debt) >= FORK_DEBT_DUST_FLOAT
      ? {
          value: debt,
          symbol: debtSymbol,
          label: isRedemption ? "Cleared" : perAxis ? (debt > 0 ? DEBT_VERB.borrow : DEBT_VERB.repay) : undefined,
        }
      : null;
  // A redemption states the debt first, as the head does.
  const kind = isOpen ? "Open" : ctx.eventType === "setBatchManagerAnnualInterestRate" ? "Adjusted" : event.actionLabel;
  const title = makeEventTitle(event, kind, isRedemption ? [debtAmount, collAmount] : [collAmount, debtAmount]);
  return isAdjust && title.amounts.length > 0 ? { ...title, kind: "" } : title;
}

/** The event's heading: the title in words. Also read on the server. */
export function liquityForkEventHeading(event: BaseActivityEvent, deployment: LiquityForkDeployment): string {
  return eventTitleWords(liquityForkEventTitle(event, deployment));
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
      heading: liquityForkEventHeading(event, deployment),
      title: liquityForkEventTitle(event, deployment),
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
