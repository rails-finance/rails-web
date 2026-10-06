"use client";

// The Explanation pane (L4) of a Liquity V2 trove event: the generator's
// sentences (lib/liquity/event-prose.ts), one bullet each. The card shows the
// first as its teaser and this pane the rest; a destructive liquidation's
// payout legs follow as a short list. Gas and the transaction sit in the
// card's footer.

import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import type { LiquityEventProse } from "@/lib/liquity/event-prose";
import type { EventCoords } from "@/lib/liquity/event-provenance";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import { ProseSentenceText } from "./event-prose-render";

/** The card's teaser: the first sentence. */
export function LiquityExplainerTeaser({
  prose,
  ctx,
  coords,
}: {
  prose: LiquityEventProse;
  ctx: LiquityContext;
  coords: EventCoords;
}) {
  const lead = prose.L4[0];
  return lead ? <ProseSentenceText s={lead} ctx={ctx} coords={coords} /> : null;
}

export function LiquityEventExplainer({
  prose,
  ctx,
  coords,
}: {
  prose: LiquityEventProse;
  ctx: LiquityContext;
  coords: EventCoords;
}) {
  const items = prose.L4.slice(1).map((s) => <ProseSentenceText key={s.sentence_id} s={s} ctx={ctx} coords={coords} />);
  const list = prose.list.map((s) => <ProseSentenceText key={s.sentence_id} s={s} ctx={ctx} coords={coords} />);
  return <ProseExplainer items={items} list={list} />;
}
