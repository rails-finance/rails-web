"use client";

// The Explanation pane (L4) of a Liquity V2 trove event: the generator's
// sentences (lib/liquity/event-prose.ts), one bullet each. The card shows the
// first as its teaser and this pane the rest; a destructive liquidation's
// payout legs follow as a short list. A grouped explanation (ui-jobs 282) has
// no teaser: every bullet sits under its group's heading, the legs in theirs.
// Gas and the transaction sit in the card's footer.

import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import { explanationRuns, type LiquityEventProse } from "@/lib/liquity/event-prose";
import type { EventCoords } from "@/lib/liquity/event-provenance";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import { ProseSentenceText } from "./event-prose-render";

/** The explanation draws its groups' headings. */
export const isGroupedExplanation = (prose: LiquityEventProse) => prose.L4.some((s) => s.group);

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
  if (isGroupedExplanation(prose))
    return (
      <ProseExplainer
        items={explanationRuns(prose).flatMap((run) =>
          run.sentences.map((s) => ({
            group: run.heading ?? "",
            node: <ProseSentenceText key={s.sentence_id} s={s} ctx={ctx} coords={coords} />,
          })),
        )}
      />
    );
  const items = prose.L4.slice(1).map((s) => <ProseSentenceText key={s.sentence_id} s={s} ctx={ctx} coords={coords} />);
  const list = prose.list.map((s) => <ProseSentenceText key={s.sentence_id} s={s} ctx={ctx} coords={coords} />);
  return <ProseExplainer items={items} list={list} />;
}
