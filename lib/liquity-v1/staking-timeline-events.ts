// A Liquity V1 stake's touches as the shared timeline's events
// (components/shared/chain-truth-timeline.tsx), as the deposit's are
// (sp-timeline-events.ts). The card reads the row, which the page looks up by
// the event's id.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { LiquityV1StakeEventRow } from "@/lib/sources/api/liquity-v1-staking";
import { stEventLabel } from "./staking-event-prose";

/** Rows the stake page's first read brings, newest first. */
export const ST_FIRST_READ = 500;
/** The most rows one timeline read returns (the route's ceiling). */
export const ST_WHOLE_LIFE_READ = 5000;

export function stTimelineEvent(r: LiquityV1StakeEventRow): BaseActivityEvent {
  const label = stEventLabel(r);
  return {
    id: r.event_key,
    txHash: r.tx_hash,
    blockNumber: Number(r.block_number),
    timestamp: Number(r.block_timestamp),
    // The rows carry no sender: the touch is the staker's own call.
    wallet: r.staker.toLowerCase(),
    actionType: label.toLowerCase().replace(/\s+/g, "-"),
    actionLabel: label,
    flows: [],
    etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx", r.tx_hash),
  };
}
