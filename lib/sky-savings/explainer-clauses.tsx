// T3 for a Sky Savings event: this event's figures, in plain words. Every
// figure a sentence states is one the opened card shows (foreground, <H>) at
// the precision the card shows it; the lesson that holds for any holder is T4
// (lib/sky-savings/learn-more.ts).

import type { ReactNode } from "react";
import { H } from "@/lib/shared/explainer-prose";
import type { SkySavingsContext } from "@/lib/shared/types/event-shape";
import { formatCompact } from "@/lib/utils/format";
import { annualRate, pct, rayNumber, skyTransition, units } from "@/lib/sky-savings/math";

const amt = (v: bigint) => formatCompact(units(v < BigInt(0) ? -v : v));
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function skyEventBullets(c: SkySavingsContext): ReactNode[] {
  const t = skyTransition(c);
  const price = rayNumber(c.chi).toFixed(6);
  const rate = pct(annualRate(c.ssr));
  const holder = c.holder.toLowerCase();
  const other = c.counterparty?.toLowerCase() ?? null;
  const moved = amt(t.sharesDelta);
  const usds = amt(t.usds);
  const out: ReactNode[] = [];

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
          and <H>{moved} sUSDS</H> were minted to it, at <H>{price} USDS</H> per sUSDS.
        </>,
      );
      if (c.referral != null)
        out.push(
          <>
            The deposit carried referral code <H>{c.referral}</H>, the number a front end attaches to deposits it sends.
          </>,
        );
      break;
    case "withdrawal":
      out.push(
        <>
          <H>{moved} sUSDS</H> were burned and paid out <H>{usds} USDS</H>, at <H>{price} USDS</H> per sUSDS.
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
          {usds} USDS at <H>{price} USDS</H> per sUSDS.
        </>,
        <>
          That worth is what these shares cost this position. Interest they earned before the transfer stays with the
          sender.
        </>,
      );
      break;
    case "sent":
      out.push(
        <>
          This address transferred <H>{moved} sUSDS</H> to the recipient {other ? short(other) : "another address"},
          worth {usds} USDS at <H>{price} USDS</H> per sUSDS.
        </>,
        <>The interest those shares earned while this address held them stays counted here.</>,
      );
      break;
    case "self":
      out.push(<>This address transferred sUSDS to the same address, so the balance stayed where it was.</>);
      break;
  }

  if (c.eventType !== "self")
    out.push(
      <>
        The balance went from <H>{amt(t.sharesBefore)}</H> to <H>{amt(t.sharesAfter)} sUSDS</H>, worth{" "}
        <H>{amt(t.valueAfter)} USDS</H>.
      </>,
    );
  out.push(
    <>
      Interest earned to date stood at <H>{formatCompact(units(t.earnedAfter))} USDS</H>, with the Savings Rate at{" "}
      <H>{rate}</H> a year.
    </>,
  );
  return out;
}
