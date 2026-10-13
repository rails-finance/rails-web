// Compound V3's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts
// the shared units read, for the Ethereum and Base deployments. For now the
// event page's (ui-jobs 236): the market's base asset and the account, then
// the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isCompoundEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { COMPOUND_DEPLOYMENT, marketOf, type CometMarket } from "@/lib/compound/asset-catalog";
import { COMPOUND_BASE_DEPLOYMENT } from "@/lib/compound-base/asset-catalog";
import { compoundRowLabel } from "@/lib/compound/row-facts";

export type CompoundDeployment = "ethereum" | "base";

const WORDS = {
  paragraph: (base: string, deployment: CompoundDeployment) =>
    `This page is one transaction from this account's history in the Compound V3 ${base} market${deployment === "base" ? " on Base" : ""}.`,
  timeline_link: "See the whole history in the timeline.",
  timeline_hint: "Open this event in the account's timeline",
  market: "Market",
  account: "Account",
  copy_account: "Copy the account's address",
  description: (base: string, account: string, day: string) =>
    `One transaction from the Compound V3 ${base} market account ${account}, on ${day}.`,
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export interface CompoundEventPageInput extends EventPageSlot {
  wallet: string;
  deployment: CompoundDeployment;
}

/** The Comet an event belongs to, in the deployment's roster. */
function cometOf(key: string, deployment: CompoundDeployment): CometMarket {
  if (deployment === "base") {
    const m = COMPOUND_BASE_DEPLOYMENT.markets.find((c) => c.key === key);
    if (m) return m;
  }
  return COMPOUND_DEPLOYMENT.markets.find((c) => c.key === key) ?? marketOf(key);
}

/** The market's base asset, "USDC": the name the event's market goes by. */
export function compoundBaseSymbol(event: BaseActivityEvent, deployment: CompoundDeployment): string | null {
  return isCompoundEvent(event) ? cometOf(event.context.data.market, deployment).baseSymbol : null;
}

/** The event's heading: T1's word. Also read on the server. */
export function compoundEventHeading(event: BaseActivityEvent, deployment: CompoundDeployment): string {
  if (!isCompoundEvent(event)) return event.actionLabel;
  const ctx = event.context.data;
  return compoundRowLabel(ctx, event.actionLabel ?? "", cometOf(ctx.market, deployment).baseDecimals);
}

/** The page's metadata description, also read on the server. */
export function compoundEventPageDescription(
  event: BaseActivityEvent,
  wallet: string,
  deployment: CompoundDeployment,
): string {
  const base = compoundBaseSymbol(event, deployment) ?? "base";
  return `${WORDS.description(base, short(wallet), formatDateLong(event.timestamp))} ${WORDS.timeline_link}`;
}

export const compoundExplorer: ExplorerAdapter<CompoundEventPageInput> = {
  eventPage: ({ wallet, deployment, event, ...slot }) => {
    const base = compoundBaseSymbol(event, deployment);
    return {
      heading: compoundEventHeading(event, deployment),
      words: {
        paragraph: WORDS.paragraph(base ?? "base asset", deployment),
        timelineLink: WORDS.timeline_link,
        timelineHint: WORDS.timeline_hint,
      },
      facts: [
        ...(base ? [{ key: "market", label: WORDS.market, value: base }] : []),
        {
          key: "account",
          label: WORDS.account,
          value: wallet,
          mono: true,
          copy: WORDS.copy_account,
          href: listingHrefForWallet(deployment === "base" ? "compound-base" : "compound", wallet) ?? undefined,
        },
      ],
      ...slot,
      blockNumber: event.blockNumber,
      txHash: event.txHash,
      eventId: event.id,
      description: compoundEventPageDescription(event, wallet, deployment),
    };
  },
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
