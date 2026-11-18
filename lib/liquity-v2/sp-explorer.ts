// The event page's contract (rails-ops reference/app-anatomy.md, P4) for a
// Liquity V2 stability-pool deposit, beside Polaris's deposit
// (lib/polaris/sp-loan-explorer.ts): the pool, the depositor, then the shared
// rows. The page reads the row the timeline holds for the event; the title is
// the row's kind and what it moved.

import type { EventPageContract, EventPageSlot } from "@/lib/shared/explorer-adapter";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { makeEventTitle, type EventTitle } from "@/lib/shared/event-title";
import { formatDateLong } from "@/lib/date";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import type { LiquityV2DepositEventRow } from "@/lib/sources/api/liquity-v2-sp";
import { LIQUITY_V2_SP_PATH, type SpBranch } from "./sp-routes";
import { big, units } from "./sp-math";
import { spEventLabel } from "./sp-event-prose";

const WORDS = {
  timeline_link: "See the whole history in the timeline.",
  pool: "Pool",
  depositor: "Depositor",
  description: (branch: string, depositor: string, day: string) =>
    `One transaction from the Liquity V2 ${branch} Stability Pool deposit of ${depositor}, on ${day}.`,
};

const ZERO = BigInt(0);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** A row's title: each amount the touch moved, with its verb, or the row's
 *  kind where it moved none. */
export function spEventTitle(event: BaseActivityEvent, row: LiquityV2DepositEventRow): EventTitle {
  const branch = LIQUITY_V2_BRANCHES[row.collateral_type.toLowerCase()];
  const change = big(row.top_up_or_withdrawal);
  const title = makeEventTitle(event, spEventLabel(row), [
    change !== ZERO
      ? {
          value: units(change > ZERO ? change : -change),
          symbol: "BOLD",
          address: TOKEN_ADDRESSES.BOLD,
          label: change > ZERO ? "Deposit" : "Withdraw",
        }
      : null,
    { value: units(big(row.coll_gain_claimed)), symbol: branch.symbol, address: branch.collateralAddr, label: "Claim" },
    { value: units(big(row.yield_gain_claimed)), symbol: "BOLD", address: TOKEN_ADDRESSES.BOLD, label: "Claim" },
  ]);
  return title.amounts.length > 0 ? { ...title, kind: "" } : title;
}

/** The page's metadata description, also read on the server. */
export function spEventPageDescription(branch: SpBranch, depositor: string, timestamp: number): string {
  return `${WORDS.description(branch, short(depositor), formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export interface LiquityV2DepositEventPageInput extends EventPageSlot {
  branch: SpBranch;
  depositor: string;
  /** The pinned event's row; the timeline's events are built from the rows. */
  row: LiquityV2DepositEventRow | undefined;
}

export function liquityV2DepositEventPage({
  branch,
  depositor,
  row,
  event,
  ...slot
}: LiquityV2DepositEventPageInput): EventPageContract {
  return {
    heading: row ? spEventLabel(row) : event.actionLabel,
    title: row ? spEventTitle(event, row) : makeEventTitle(event, event.actionLabel, []),
    facts: [
      { key: "pool", label: WORDS.pool, value: `${branch} Stability Pool` },
      {
        key: "depositor",
        label: WORDS.depositor,
        value: short(depositor),
        full: depositor,
        mono: true,
        href: `${LIQUITY_V2_SP_PATH}?q=${depositor}`,
      },
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: spEventPageDescription(branch, depositor, event.timestamp),
  };
}
