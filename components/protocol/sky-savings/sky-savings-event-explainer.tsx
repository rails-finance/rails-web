// T3 pane for a Sky Savings event — the bullets from lib/sky-savings/explainer-clauses.tsx.
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import type { SkySavingsContext } from "@/lib/shared/types/event-shape";
import { skyEventBullets, type SkyPreviousEvent } from "@/lib/sky-savings/explainer-clauses";

export function SkySavingsEventExplainer({
  ctx,
  previous,
}: {
  ctx: SkySavingsContext;
  previous?: SkyPreviousEvent | null;
}) {
  return <ProseExplainer items={skyEventBullets(ctx, previous)} />;
}
