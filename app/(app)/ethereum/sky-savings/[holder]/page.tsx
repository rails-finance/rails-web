// ONE SKY SAVINGS POSITION — /ethereum/sky-savings/<holder>.
// ----------------------------------------------------------------------------
// A position is a holder address of sUSDS. Four reads of rails-server's
// /api/sky-savings, in parallel, all at the sealed block the api names: the
// position row, the newest events (up to TIMELINE_ROWS), the day rows the
// Lifetime flows scrubber draws, and the rate history with the daily share
// price and the PSM price.
//
// THE GATE. Every answer carries the latest verifier run. Unless `gate.ok` is
// true the page states that and draws no figure (rails-ops
// reference/sky-savings-pipeline.md, "The gate").
//
// An ENS name in the segment resolves here and redirects to the address, so a
// position has one URL.

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { resolveEnsAddress } from "@/lib/ens/resolve-ens";
import { readSkyFlowsDaily, readSkyPosition, readSkyRates, readSkyTimeline } from "@/lib/sources/api/sky-savings";
import { skyPositionHref } from "@/lib/sky-savings/constants";
import { skyDaysFromEvents } from "@/lib/sky-savings/flows";
import { gateRefusal } from "@/lib/sky-savings/types";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import SkySavingsPositionView from "./position-view";
import { SkyGateRefusal } from "@/components/protocol/sky-savings/sky-savings-gate-refusal";

export const dynamic = "force-dynamic";

/** The newest events the page draws. The whole life's figures (the card, the
 *  flows) come from the position row and the day rows, so a longer history is
 *  stated as a count and drawn to this many rows. */
const TIMELINE_ROWS = 1000;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

interface Props {
  params: Promise<{ holder: string }>;
}

const load = cache(async (holder: string) => {
  const readerIp = await readerIpFromHeaders();
  const position = await readSkyPosition(holder, readerIp);
  if (!position) return null;
  const [timeline, days, rates] = await Promise.all([
    readSkyTimeline(holder, { limit: TIMELINE_ROWS }, readerIp),
    readSkyFlowsDaily(holder, readerIp),
    readSkyRates(readerIp).catch(() => null),
  ]);
  // A history longer than the drawn window: the first event's time, for the
  // timeline header's tenure, from one oldest-first row.
  const first =
    timeline.total > timeline.events.length && position.data.activity.firstTimestamp == null
      ? await readSkyTimeline(holder, { limit: 1, order: "asc" }, readerIp).catch(() => null)
      : null;
  return { position, timeline, days, rates, firstAt: first?.events[0]?.timestamp ?? null };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { holder } = await params;
  const h = decodeURIComponent(holder).toLowerCase();
  return positionMetadata({
    session: "sky-savings",
    subject: ADDRESS.test(h) ? shortAddress(h) : h,
    canonicalPath: skyPositionHref(h),
  });
}

export default async function SkySavingsPositionPage({ params }: Props) {
  const { holder: raw } = await params;
  const typed = decodeURIComponent(raw).trim();
  if (!ADDRESS.test(typed)) {
    if (typed.toLowerCase().endsWith(".eth")) {
      const address = await resolveEnsAddress(typed);
      if (address) redirect(skyPositionHref(address));
    }
    notFound();
  }
  const holder = typed.toLowerCase();
  // One URL per position: the lowercase address.
  if (typed !== holder) redirect(skyPositionHref(holder));
  const data = await load(holder);
  if (!data) notFound();

  const refusal = gateRefusal(data.position);
  if (refusal) return <SkyGateRefusal reason={refusal} gate={data.position.gate} holder={holder} />;

  return (
    <SkySavingsPositionView
      key={holder}
      position={data.position.data}
      asOf={data.position.asOf}
      gate={data.position.gate!}
      events={data.timeline.events}
      totalEvents={data.timeline.total}
      rateNotes={data.timeline.marketNotes}
      days={data.days ?? skyDaysFromEvents(data.timeline.events, data.timeline.total)}
      rates={data.rates}
      firstAt={data.position.data.activity.firstTimestamp ?? data.firstAt}
      todayDay={Math.floor(Date.now() / 86_400_000)}
    />
  );
}
