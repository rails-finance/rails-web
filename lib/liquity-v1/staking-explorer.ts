// The event page's contract (rails-ops reference/app-anatomy.md, P4) for a
// Liquity V1 LQTY stake, beside the deposit's (sp-explorer.ts): LQTYStaking,
// the staker, then the shared rows. The title is the row's kind and what it
// moved.

import type { EventPageContract, EventPageSlot } from "@/lib/shared/explorer-adapter";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { makeEventTitle, type EventTitle } from "@/lib/shared/event-title";
import { formatDateLong } from "@/lib/date";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { NATIVE } from "@/lib/shared/asset-roster";
import type { LiquityV1StakeEventRow } from "@/lib/sources/api/liquity-v1-staking";
import { LIQUITY_V1_STAKING_PATH } from "./staking-routes";
import { big, units } from "./staking-math";
import { stEventLabel } from "./staking-event-prose";

const WORDS = {
  timeline_link: "See the whole history in the timeline.",
  contract: "Contract",
  staker: "Staker",
  description: (staker: string, day: string) =>
    `One transaction from the Liquity V1 LQTY stake of ${staker}, on ${day}.`,
};

const ZERO = BigInt(0);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** A row's title: each amount the touch moved, with its verb, or the row's
 *  kind where it moved none. */
export function stEventTitle(event: BaseActivityEvent, row: LiquityV1StakeEventRow): EventTitle {
  const change = big(row.stake_change);
  const title = makeEventTitle(event, stEventLabel(row), [
    change !== ZERO
      ? {
          value: units(change > ZERO ? change : -change),
          symbol: "LQTY",
          address: TOKEN_ADDRESSES.LQTY,
          label: change > ZERO ? "Stake" : "Unstake",
        }
      : null,
    { value: units(big(row.lusd_gain)), symbol: "LUSD", address: TOKEN_ADDRESSES.LUSD, label: "Claim" },
    { value: units(big(row.eth_gain)), symbol: "ETH", address: NATIVE, label: "Claim" },
  ]);
  return title.amounts.length > 0 ? { ...title, kind: "" } : title;
}

/** The page's metadata description, also read on the server. */
export function stEventPageDescription(staker: string, timestamp: number): string {
  return `${WORDS.description(short(staker), formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export interface LiquityV1StakeEventPageInput extends EventPageSlot {
  staker: string;
  /** The pinned event's row; the timeline's events are built from the rows. */
  row: LiquityV1StakeEventRow | undefined;
}

export function liquityV1StakeEventPage({
  staker,
  row,
  event,
  ...slot
}: LiquityV1StakeEventPageInput): EventPageContract {
  return {
    heading: row ? stEventLabel(row) : event.actionLabel,
    title: row ? stEventTitle(event, row) : makeEventTitle(event, event.actionLabel, []),
    facts: [
      { key: "contract", label: WORDS.contract, value: "LQTYStaking" },
      {
        key: "staker",
        label: WORDS.staker,
        value: short(staker),
        full: staker,
        mono: true,
        href: `${LIQUITY_V1_STAKING_PATH}?q=${staker}`,
      },
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: stEventPageDescription(staker, event.timestamp),
  };
}
