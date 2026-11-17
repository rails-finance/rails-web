// A Polaris stability-pool deposit's and a reserve loan's rows as the shared
// timeline's events (components/shared/chain-truth-timeline.tsx). The event
// carries what the timeline reads (coordinates, kind, label); the card reads
// the row, which the page looks up by the event's id. No context: the timeline
// draws each through the page's own card.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { PolarisDepositEventRow, PolarisLoanEventRow } from "@/lib/sources/api/polaris-sp-loans";
import { spEventLabel } from "./sp-event-prose";
import { loanEventLabel } from "./loan-event-prose";

/** Rows the deposit page's first read brings, newest first: every row of all
 *  but the vault-held deposits. */
export const DEPOSIT_FIRST_READ = 500;
/** The most rows one timeline read returns (the route's ceiling): a life up
 *  to it is read whole for the flows. */
export const WHOLE_LIFE_READ = 5000;

const txUrl = (tx: string) => `https://sepolia.etherscan.io/tx/${tx}`;

const kindOf = (label: string) => label.toLowerCase().replace(/\s+/g, "-");

function shell(
  r: { event_key: string; tx_hash: string; block_number: string; block_timestamp: string; tx_from: string | null },
  label: string,
): BaseActivityEvent {
  return {
    id: r.event_key,
    txHash: r.tx_hash,
    blockNumber: Number(r.block_number),
    timestamp: Number(r.block_timestamp),
    wallet: (r.tx_from ?? "").toLowerCase(),
    actionType: kindOf(label),
    actionLabel: label,
    flows: [],
    etherscanUrl: txUrl(r.tx_hash),
  };
}

export const depositTimelineEvent = (r: PolarisDepositEventRow): BaseActivityEvent => shell(r, spEventLabel(r));

export const loanTimelineEvent = (r: PolarisLoanEventRow): BaseActivityEvent => shell(r, loanEventLabel(r));
