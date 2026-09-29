// T3 for the Sky Savings position card: this position's figures, in plain
// words. A figure the card shows is foreground (<H>) at the card's precision.

import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { formatDate } from "@/lib/date";
import { formatCompact, formatNumber } from "@/lib/utils/format";
import { pctString, rayNumber, skyYearlyEarnings, units, yearlyText } from "@/lib/sky-savings/math";
import type { SkyLifetimeTotals } from "@/lib/sky-savings/flows";
import type { SkyAsOf, SkyPosition } from "@/lib/sky-savings/types";

export function SkySavingsPositionExplanation({
  position: p,
  asOf,
  totals,
  firstAt,
}: {
  position: SkyPosition;
  asOf: SkyAsOf;
  totals: SkyLifetimeTotals | null;
  firstAt: number | null;
}) {
  const shares = units(p.shares.raw);
  const value = p.value ? units(p.value.raw) : 0;
  const earned = p.earned ? units(p.earned.raw) : null;
  const zero = BigInt(0);
  const items = [];

  items.push(
    p.status === "open" ? (
      <>
        This address holds <H>{formatCompact(shares)} sUSDS</H>, worth <H>{formatNumber(value)} USDS</H> at{" "}
        {asOf.chi ? <H>{rayNumber(asOf.chi).toFixed(6)} USDS</H> : "the share price"} per sUSDS.
      </>
    ) : (
      <>This address holds no sUSDS now. Every share it held has been withdrawn or sent.</>
    ),
  );

  if (totals) {
    const parts: string[] = [];
    if (totals.deposited > zero) parts.push(`deposited ${formatCompact(units(totals.deposited))} USDS`);
    if (totals.received > zero) parts.push(`received sUSDS worth ${formatCompact(units(totals.received))} USDS`);
    if (totals.withdrawn > zero) parts.push(`withdrew ${formatCompact(units(totals.withdrawn))} USDS`);
    if (totals.sent > zero) parts.push(`sent sUSDS worth ${formatCompact(units(totals.sent))} USDS`);
    if (parts.length > 0)
      items.push(
        <>
          {firstAt ? `Since ${formatDate(firstAt)} it` : "It"} {parts.slice(0, -1).join(", ")}
          {parts.length > 1 ? " and " : ""}
          {parts[parts.length - 1]}.
        </>,
      );
  }

  if (earned != null)
    items.push(
      <>
        That leaves <H>{formatCompact(Math.abs(earned))} USDS</H> of interest earned
        {earned < 0 ? " below zero, a rounding remainder" : ""}: what the position is worth now, plus what left, less
        what came in.
      </>,
    );

  const yearly = skyYearlyEarnings(p, asOf);
  items.push(
    yearly != null ? (
      <>
        At <H>{pctString(asOf.ssrAnnual)}</H> a year this balance earns about <H>{yearlyText(yearly)} USDS</H> a year.
        Sky governance sets the rate and can change it at any block; a change applies to every holder from that block.
      </>
    ) : (
      <>
        The Savings Rate is <H>{pctString(asOf.ssrAnnual)}</H> a year. Sky governance sets it and can change it at any
        block; a change applies to every holder from that block.
      </>
    ),
  );
  items.push(
    <>
      Sky mints the interest as new USDS when the share price is brought up to date, and books the same amount as debt
      at its surplus buffer, where borrowers&rsquo; stability fees on Sky vaults are paid in.
    </>,
  );

  return <ProseExplainer items={items} />;
}
