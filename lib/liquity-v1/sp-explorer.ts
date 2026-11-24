// The event page's contract (rails-ops reference/app-anatomy.md, P4) for a
// Liquity V1 stability-pool deposit, beside Liquity V2's
// (lib/liquity-v2/sp-explorer.ts): the pool, the depositor, then the shared
// rows. The page reads the row the timeline holds for the event; the title is
// the row's kind and what it moved.

import type { EventPageContract, EventPageSlot } from "@/lib/shared/explorer-adapter";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { makeEventTitle, type EventTitle } from "@/lib/shared/event-title";
import { formatDateLong } from "@/lib/date";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { NATIVE } from "@/lib/shared/asset-roster";
import type { LiquityV1DepositEventRow } from "@/lib/sources/api/liquity-v1-sp";
import { LIQUITY_V1_SP_PATH } from "./sp-routes";
import { big, units } from "./sp-math";
import { spEventLabel } from "./sp-event-prose";

const WORDS = {
  timeline_link: "See the whole history in the timeline.",
  pool: "Pool",
  depositor: "Depositor",
  description: (depositor: string, day: string) =>
    `One transaction from the Liquity V1 Stability Pool deposit of ${depositor}, on ${day}.`,
};

const ZERO = BigInt(0);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** A row's title: each amount the touch moved, with its verb, or the row's
 *  kind where it moved none. */
export function spEventTitle(event: BaseActivityEvent, row: LiquityV1DepositEventRow): EventTitle {
  const change = big(row.top_up_or_withdrawal);
  const title = makeEventTitle(event, spEventLabel(row), [
    change !== ZERO
      ? {
          value: units(change > ZERO ? change : -change),
          symbol: "LUSD",
          address: TOKEN_ADDRESSES.LUSD,
          label: change > ZERO ? "Deposit" : "Withdraw",
        }
      : null,
    {
      value: units(big(row.eth_gain)),
      symbol: "ETH",
      address: NATIVE,
      label: row.operation === "withdrawETHGainToTrove" ? "To Trove" : "Claim",
    },
    { value: units(big(row.lqty_gain)), symbol: "LQTY", address: TOKEN_ADDRESSES.LQTY, label: "Claim" },
  ]);
  return title.amounts.length > 0 ? { ...title, kind: "" } : title;
}

/** The page's metadata description, also read on the server. */
export function spEventPageDescription(depositor: string, timestamp: number): string {
  return `${WORDS.description(short(depositor), formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export interface LiquityV1DepositEventPageInput extends EventPageSlot {
  depositor: string;
  /** The pinned event's row; the timeline's events are built from the rows. */
  row: LiquityV1DepositEventRow | undefined;
}

export function liquityV1DepositEventPage({
  depositor,
  row,
  event,
  ...slot
}: LiquityV1DepositEventPageInput): EventPageContract {
  return {
    heading: row ? spEventLabel(row) : event.actionLabel,
    title: row ? spEventTitle(event, row) : makeEventTitle(event, event.actionLabel, []),
    facts: [
      { key: "pool", label: WORDS.pool, value: "Stability Pool" },
      {
        key: "depositor",
        label: WORDS.depositor,
        value: short(depositor),
        full: depositor,
        mono: true,
        href: `${LIQUITY_V1_SP_PATH}?q=${depositor}`,
      },
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: spEventPageDescription(depositor, event.timestamp),
  };
}
