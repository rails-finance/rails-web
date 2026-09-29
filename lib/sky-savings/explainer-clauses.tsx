// T3 for a Sky Savings event: this event's figures, in plain words. Figures are
// stated to six decimals (the opened card's tooltips hold every digit), so a
// change the card's compact figures round away still shows. Each event states
// the interest earned since the previous one and adds the parts up to the
// running total; the lesson that holds for any holder is T4
// (lib/sky-savings/learn-more.ts).

import type { ReactNode } from "react";
import { H } from "@/lib/shared/explainer-prose";
import type { SkySavingsContext } from "@/lib/shared/types/event-shape";
import { formatDate } from "@/lib/date";
import { annualRate, exact, fixed6, pct, pctString, rayNumber, skyTransition } from "@/lib/sky-savings/math";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const abs = (v: bigint) => (v < BigInt(0) ? -v : v);

/** The event before this one on the holder's timeline: its figures and time.
 *  `null` when this is the holder's first event; `undefined` when it is older
 *  than the rows the page holds. */
export interface SkyPreviousEvent {
  ctx: SkySavingsContext;
  timestamp: number;
  blockNumber: number;
  /** The Savings Rate changes after the previous event and up to this one:
   *  how many, the rate before the first ("0.040000") and after the last. */
  rateChanges?: { count: number; from: string; to: string };
}

/** Interest the balance earned between the previous event and this one: the
 *  worth just before this event less the worth just after the previous one.
 *  Null where the previous event is not on the page. */
export function skyInterestSince(c: SkySavingsContext, prev: SkyPreviousEvent | null | undefined): bigint | null {
  if (prev === undefined) return null;
  if (prev === null) return BigInt(0);
  return skyTransition(c).earnedBefore - BigInt(prev.ctx.earnedAfter);
}

export function skyEventBullets(c: SkySavingsContext, prev?: SkyPreviousEvent | null): ReactNode[] {
  const t = skyTransition(c);
  const price = rayNumber(c.chi).toFixed(6);
  const rate = pct(annualRate(c.ssr));
  const holder = c.holder.toLowerCase();
  const other = c.counterparty?.toLowerCase() ?? null;
  const moved = fixed6(abs(t.sharesDelta));
  const usds = fixed6(t.usds);
  const from = fixed6(t.sharesBefore);
  const to = fixed6(t.sharesAfter);
  const since = skyInterestSince(c, prev);
  const rounding = t.earnedAfter - t.earnedBefore;
  const out: ReactNode[] = [];

  // 1. What the balance earned since the previous event.
  if (prev === null) out.push(<>This is the address&rsquo;s first event, so no interest had built up before it.</>);
  else if (prev && t.sharesBefore === BigInt(0))
    out.push(
      <>
        The address held no sUSDS between the previous event ({formatDate(prev.timestamp)}) and this one, so it earned
        no interest in between.
      </>,
    );
  else if (prev && since != null)
    out.push(
      <>
        Since the previous event ({formatDate(prev.timestamp)}), the <H>{from} sUSDS</H> held earned{" "}
        <H>{fixed6(since)} USDS</H> of interest: their worth rose from <H>{fixed6(prev.ctx.valueAfter)}</H> to{" "}
        <H>{fixed6(t.valueBefore)} USDS</H> as the share price rose to <H>{price} USDS</H>
        {prev.rateChanges && prev.rateChanges.count > 0 ? (
          <>
            , across {prev.rateChanges.count} Savings Rate change{prev.rateChanges.count === 1 ? "" : "s"},{" "}
            <H>{pctString(prev.rateChanges.from)}</H> &rarr; <H>{pctString(prev.rateChanges.to)}</H>
          </>
        ) : null}
        .
      </>,
    );
  else
    out.push(
      <>
        The previous event is older than the rows this page draws. Just before this event the position had earned{" "}
        <H>{fixed6(t.earnedBefore)} USDS</H> of interest.
      </>,
    );

  // 2. What the event did, with the balance before and after.
  switch (c.eventType) {
    case "deposit":
      out.push(
        <>
          {other && other !== holder ? (
            <>
              The sender {short(other)} deposited <H>{usds} USDS</H> for this address
            </>
          ) : (
            <>
              This address deposited <H>{usds} USDS</H>
            </>
          )}{" "}
          and <H>{moved} sUSDS</H> were minted to it at <H>{price} USDS</H> per sUSDS. The balance grew from{" "}
          <H>{from}</H> to <H>{to} sUSDS</H>, worth <H>{fixed6(t.valueAfter)} USDS</H>.
        </>,
      );
      if (other && other !== holder)
        out.push(<>Any address can deposit into any other, and this address did not have to act.</>);
      if (c.referral != null)
        out.push(
          <>
            The deposit carried referral code <H>{c.referral}</H>, a number the front end that sent it chose
            {c.referral === 0 ? "; 0 is a code like any other, and a deposit sent without a code shows none" : ""}. The
            code changes no figure and pays the depositor nothing on chain.
          </>,
        );
      break;
    case "withdrawal":
      out.push(
        <>
          <H>{moved} sUSDS</H> were burned and paid out <H>{usds} USDS</H> at <H>{price} USDS</H> per sUSDS. The balance
          fell from <H>{from}</H> to <H>{to} sUSDS</H>.
        </>,
      );
      if (other && other !== holder)
        out.push(<>The USDS went to the recipient {short(other)}, the address the withdrawal named.</>);
      if (c.actor && c.actor.toLowerCase() !== holder)
        out.push(
          <>
            Another address, {short(c.actor)}, made the withdrawal on the holder&rsquo;s behalf, with an allowance the
            holder had granted.
          </>,
        );
      break;
    case "received":
      out.push(
        <>
          The sender {other ? short(other) : "another address"} transferred <H>{moved} sUSDS</H> to this address, worth{" "}
          <H>{usds} USDS</H> at <H>{price} USDS</H> per sUSDS. The balance grew from <H>{from}</H> to <H>{to} sUSDS</H>.
        </>,
      );
      break;
    case "sent":
      out.push(
        <>
          This address transferred <H>{moved} sUSDS</H> to the recipient {other ? short(other) : "another address"},
          worth <H>{usds} USDS</H> at <H>{price} USDS</H> per sUSDS. The balance fell from <H>{from}</H> to{" "}
          <H>{to} sUSDS</H>.
        </>,
      );
      break;
    case "self":
      out.push(<>This address transferred sUSDS to the same address, so the balance stayed where it was.</>);
      break;
  }

  // 3. Why the event itself moved no interest.
  const still =
    c.eventType === "deposit"
      ? "The deposit counts its USDS as money that came in and adds the same worth to the balance, so it moved no interest."
      : c.eventType === "withdrawal"
        ? "The withdrawal paid out what the shares were worth at this block, and that payout counts as money that left, so it moved no interest."
        : c.eventType === "received"
          ? "The shares count as money that came in at their worth on arrival, so the transfer moved no interest. What they earned before it stays with the sender."
          : c.eventType === "sent"
            ? "The shares count as money that left at their worth at this block, so the transfer moved no interest. What they earned while this address held them stays counted here."
            : null;
  if (still || rounding !== BigInt(0))
    out.push(
      <>
        {still}
        {rounding !== BigInt(0) && (
          <>
            {still ? " " : ""}The one exception is rounding: the contract rounds in its own favour, by at most one wei
            (0.000000000000000001 USDS) a step, and here that moved interest earned by{" "}
            <H>{rounding < BigInt(0) ? `−${exact(-rounding)}` : exact(rounding)} USDS</H>.
          </>
        )}
      </>,
    );

  // 4. The running total, added up.
  const total = <H>{fixed6(t.earnedAfter)} USDS</H>;
  const exactTotal =
    t.earnedAfter > BigInt(-1_000_000_000_000) &&
    t.earnedAfter < BigInt(1_000_000_000_000) &&
    t.earnedAfter !== BigInt(0)
      ? ` (${t.earnedAfter < BigInt(0) ? "−" : ""}${exact(abs(t.earnedAfter))} exactly)`
      : "";
  out.push(
    since != null && prev ? (
      <>
        Interest earned to date: <H>{fixed6(prev.ctx.earnedAfter)}</H> before, plus <H>{fixed6(since)}</H> since
        {rounding !== BigInt(0) ? ", with the rounding," : ""} makes {total}
        {exactTotal}. The Savings Rate was <H>{rate}</H> a year.
      </>
    ) : (
      <>
        Interest earned to date stood at {total}
        {exactTotal}, with the Savings Rate at <H>{rate}</H> a year.
      </>
    ),
  );
  return out;
}
