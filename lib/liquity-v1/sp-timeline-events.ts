// A Liquity V1 deposit's touches as the shared timeline's events
// (components/shared/chain-truth-timeline.tsx). The event carries what the
// timeline reads (coordinates, kind, label); the card reads the row, which the
// page looks up by the event's id.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { LiquityV1DepositEventRow } from "@/lib/sources/api/liquity-v1-sp";
import { spEventLabel } from "./sp-event-prose";

/** Rows the deposit page's first read brings, newest first. */
export const SP_FIRST_READ = 500;
/** The most rows one timeline read returns (the route's ceiling): a life up
 *  to it is read whole for the flows. */
export const SP_WHOLE_LIFE_READ = 5000;

export function spTimelineEvent(r: LiquityV1DepositEventRow): BaseActivityEvent {
  const label = spEventLabel(r);
  return {
    id: r.event_key,
    txHash: r.tx_hash,
    blockNumber: Number(r.block_number),
    timestamp: Number(r.block_timestamp),
    // The rows carry no sender: the touch is the depositor's own call.
    wallet: r.depositor.toLowerCase(),
    actionType: label.toLowerCase().replace(/\s+/g, "-"),
    actionLabel: label,
    flows: [],
    etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx", r.tx_hash),
  };
}
