// The Lifetime flows panel's Explanation lines for a Liquity V2 redeemer
// (lib/liquity-v2/redeemer-flows.ts): what the line is, where it is read
// from, what the events row marks, and the days the price store has not
// read yet.

import type { ReactNode } from "react";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";

const DAY_S = 86_400;
/** "18 Nov '26", as the chart writes a day. */
const dayStamp = (tsSec: number) => `${shortDate(tsSec)} ${shortDateYear(tsSec)}`;

export function RedeemerFlowsNote({
  days,
  firstDay,
  lastDay,
  unreadThrough,
  priceFailed,
  pool,
}: {
  /** Days with a redemption from this address. */
  days: number;
  firstDay: number;
  lastDay: number;
  /** The last day of the span the price store has not read yet, or null. */
  unreadThrough: number | null;
  /** The price read failed: no line, and the note says so. */
  priceFailed: boolean;
  /** The pool the line is read from. */
  pool: string | null;
}): ReactNode {
  const first = dayStamp(firstDay * DAY_S);
  const last = dayStamp(lastDay * DAY_S);
  const noneRead = unreadThrough != null && unreadThrough >= lastDay;
  return (
    <div className="space-y-2" data-liquity-v2-redeemer-flows-note="" data-anatomy="F14">
      {!priceFailed && !noneRead && (
        <p>
          The line is BOLD&apos;s market price in USD: 1 ÷ the Curve BOLD/USDC pool&apos;s last_price(0)
          {pool ? ` (${pool.slice(0, 6)}…${pool.slice(-4)})` : ""} at the end of the newest Liquity V2 event block
          stored each day, with USDC at $1.
        </p>
      )}
      <p>
        {days === 1
          ? `The events row marks the day this address redeemed on, ${first}.`
          : `The events row marks the ${days.toLocaleString("en-US")} days this address redeemed on, from ${first} to ${last}.`}
      </p>
      {priceFailed && <p data-redeemer-price-failed="">BOLD&apos;s price could not be read just now.</p>}
      {noneRead && <p data-redeemer-price-unread="all">BOLD&apos;s price is not read yet for these days.</p>}
      {unreadThrough != null && !noneRead && (
        <p data-redeemer-price-unread="">BOLD&apos;s price is not read yet up to {dayStamp(unreadThrough * DAY_S)}.</p>
      )}
    </div>
  );
}
