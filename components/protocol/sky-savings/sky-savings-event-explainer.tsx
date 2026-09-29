// T3 pane for a Sky Savings event — the bullets from lib/sky-savings/explainer-clauses.tsx.
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import type { SkySavingsContext } from "@/lib/shared/types/event-shape";
import { skyEventBullets } from "@/lib/sky-savings/explainer-clauses";

export function SkySavingsEventExplainer({ ctx }: { ctx: SkySavingsContext }) {
  return <ProseExplainer items={skyEventBullets(ctx)} />;
}
