// The event page's contract (rails-ops reference/app-anatomy.md, P4) for a
// Liquity V2 stability-pool deposit, beside Polaris's deposit
// (lib/polaris/sp-loan-explorer.ts): the pool, the depositor, then the shared
// rows. The page reads the row the timeline holds for the event; the title is
// the row's kind and what it moved.

import type { EventPageContract, EventPageSlot } from "@/lib/shared/explorer-adapter";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { makeEventTitle, type EventTitle } from "@/lib/shared/event-title";
import { formatDateLong } from "@/lib/date";
import type { LiquityV2DepositEventRow } from "@/lib/sources/api/liquity-v2-sp";
import { LIQUITY_V2_SP, spPoolOf, spWalletHref, type SpDeployment } from "./sp-deployment";
import { big, units } from "./sp-math";
import { spEventLabel } from "./sp-event-prose";

const WORDS = {
  timeline_link: "See the whole history in the timeline.",
  pool: "Pool",
  depositor: "Depositor",
  description: (name: string, branch: string, depositor: string, day: string) =>
    `One transaction from the ${name} ${branch} Stability Pool deposit of ${depositor}, on ${day}.`,
};

const ZERO = BigInt(0);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** A row's title: each amount the touch moved, with its verb, or the row's
 *  kind where it moved none. */
export function spEventTitle(
  event: BaseActivityEvent,
  row: LiquityV2DepositEventRow<string>,
  dep: SpDeployment = LIQUITY_V2_SP,
): EventTitle {
  const branch = spPoolOf(dep, row.collateral_type);
  const S = dep.stable;
  const change = big(row.top_up_or_withdrawal);
  const title = makeEventTitle(event, spEventLabel(row), [
    change !== ZERO
      ? {
          value: units(change > ZERO ? change : -change),
          symbol: S.symbol,
          address: S.address,
          label: change > ZERO ? "Deposit" : "Withdraw",
        }
      : null,
    { value: units(big(row.coll_gain_claimed)), symbol: branch.symbol, address: branch.collateralAddr, label: "Claim" },
    { value: units(big(row.yield_gain_claimed)), symbol: S.symbol, address: S.address, label: "Claim" },
  ]);
  return title.amounts.length > 0 ? { ...title, kind: "" } : title;
}

/** The page's metadata description, also read on the server. */
export function spEventPageDescription(
  branch: string,
  depositor: string,
  timestamp: number,
  dep: SpDeployment = LIQUITY_V2_SP,
): string {
  return `${WORDS.description(dep.name, branch, short(depositor), formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export interface LiquityV2DepositEventPageInput extends EventPageSlot {
  branch: string;
  depositor: string;
  /** The pinned event's row; the timeline's events are built from the rows. */
  row: LiquityV2DepositEventRow<string> | undefined;
  dep?: SpDeployment;
}

export function liquityV2DepositEventPage({
  branch,
  depositor,
  row,
  dep = LIQUITY_V2_SP,
  event,
  ...slot
}: LiquityV2DepositEventPageInput): EventPageContract {
  return {
    heading: row ? spEventLabel(row) : event.actionLabel,
    title: row ? spEventTitle(event, row, dep) : makeEventTitle(event, event.actionLabel, []),
    facts: [
      { key: "pool", label: WORDS.pool, value: `${branch} Stability Pool` },
      {
        key: "depositor",
        label: WORDS.depositor,
        value: short(depositor),
        full: depositor,
        mono: true,
        href: spWalletHref(dep, depositor),
      },
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: spEventPageDescription(branch, depositor, event.timestamp, dep),
  };
}
