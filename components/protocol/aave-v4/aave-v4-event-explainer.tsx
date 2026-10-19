"use client";

// The Explanation pane (zone Z2) of an Aave V4 event: the generator's
// sentences (lib/aave-v4/event-prose.ts, its strings in
// content/aave-v4/event-prose.yaml), one bullet each, under the three event
// headings when two of them hold two or more bullets. Each figure the header
// also prints echoes that receipt. The health factor and collateral sentences
// read the position state the open card reads, so the card passes this pane
// as its body with no teaser.

import type { AaveV4Context } from "@/lib/shared/types/protocols/aave-v4";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import { useExplainerLeadOnTitle } from "@/components/shared/explainer-lead-context";
import { formatExact } from "@/lib/utils/format";
import { ProseSentenceText, type ProseEcho } from "@/components/shared/prose-sentence-text";
import {
  aaveV4EventProse,
  aaveV4ExplanationRuns,
  coordsFor,
  type AaveV4EchoKey,
  type AaveV4Event,
} from "@/lib/aave-v4/event-prose";
import type { EventProvDetail } from "@/lib/aave-v4/position-provenance";
import { useHealthFactorAround, hfOf } from "@/lib/aave-v4/use-health-factor-around";
import { amountProv, repaidProv, seizedProv } from "./aave-v4-head";

export interface AaveV4EventExplainerProps {
  ctx: AaveV4Context;
  event: AaveV4Event;
  /** This transaction's events (defaults to just this one). */
  siblings?: AaveV4Event[];
  /** The previous event's borrow rate on this asset (decimal), to say when it moved. */
  previousRate?: number;
  /** For a repay that clears its debt: the interest that debt accrued over its life. */
  debtLifeInterest?: number;
}

/** The event's "?" modal: it depends on the event's kind only. */
export function aaveV4LearnMoreContent(ctx: AaveV4Context): LearnMoreContent {
  return aaveV4EventProse({ ctx }).L5.content;
}

/** The receipt each echoed figure registers against: the header's amount, or
 *  a liquidation's legs. */
function echoFor(key: AaveV4EchoKey, ctx: AaveV4Context, coord: EventProvDetail): ProseEcho | null {
  switch (key) {
    case "amount": {
      const p = amountProv(ctx, coord);
      return { info: p.info, value: p.value, symbol: ctx.reserveSymbol };
    }
    case "seized":
      return {
        info: seizedProv(ctx, coord),
        value: formatExact(Number(ctx.liquidatedCollateralAmount)),
        symbol: ctx.collateralSymbol,
      };
    case "cleared":
      return {
        info: repaidProv(ctx, coord),
        value: formatExact(Number(ctx.debtToCover)),
        symbol: ctx.reserveSymbol,
      };
  }
}

/** The event page's title: the explanation's first sentence, the event's own
 *  words, which read no position state. */
export function AaveV4PageSentence({
  ctx,
  event,
  siblings,
}: {
  ctx: AaveV4Context;
  event: AaveV4Event;
  siblings: AaveV4Event[];
}) {
  const lead = aaveV4EventProse({ ctx, siblings, self: event }).L4[0];
  const coord = coordsFor(event);
  return lead ? <ProseSentenceText s={lead} echo={(key) => echoFor(key, ctx, coord)} /> : null;
}

export function AaveV4EventExplainer({
  ctx,
  event,
  siblings,
  previousRate,
  debtLifeInterest,
}: AaveV4EventExplainerProps) {
  const coord = coordsFor(event);
  // The same read the opened grid's Health factor cell makes (one request,
  // shared, with the same arguments), so the prose can say where the factor
  // stands and whether a supply counted as collateral.
  const hfRead = useHealthFactorAround(
    ctx.eventType !== "collateral_toggle",
    ctx.spokeAddress,
    ctx.owner ?? event.wallet,
    event.blockNumber,
    ctx.reserveSymbol,
  );
  const hf =
    hfRead.status === "ok"
      ? { before: hfOf(hfRead.before.wad), after: hfOf(hfRead.after.wad), collateral: hfRead.collateral }
      : undefined;
  const prose = aaveV4EventProse({
    ctx,
    siblings: siblings ?? [event],
    self: event,
    hf,
    previousRate,
    debtLifeInterest,
  });
  const echo = (key: AaveV4EchoKey) => echoFor(key, ctx, coord);
  const items = aaveV4ExplanationRuns(prose).flatMap((run) =>
    run.sentences.map((s) => {
      const node = <ProseSentenceText key={s.sentence_id} s={s} echo={echo} />;
      return run.heading ? { group: run.heading, node } : node;
    }),
  );
  // On the event page the title states the first sentence: a grouped pane
  // leaves it out in ProseExplainer, a flat one here.
  const leadOnTitle = useExplainerLeadOnTitle();
  const grouped = items.some((i) => typeof i === "object" && i != null && "group" in i);
  return <ProseExplainer items={leadOnTitle && !grouped ? items.slice(1) : items} />;
}
