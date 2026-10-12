// A Liquity V2 event as Markdown: the Copy for LLM block on the event page and
// the event blocks of the test exports (BRIEF §3, §4). The context header,
// then L1 to L5 and the footer, each level the generator's text
// (lib/liquity/event-prose.ts) and the ledgers' rows (event-ledgers.ts), so a
// string on the page comes out here character for character. Facts only. The
// modal, L4 and heading forms are every family's (lib/shared/event-prose/markdown.ts).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import {
  contextHeader,
  explanationRuns,
  footerLine,
  type LiquityEventContext,
  type LiquityEventProse,
} from "@/lib/liquity/event-prose";
import { ledgerMarkdown, type LiquityEventLedger } from "@/lib/liquity/event-ledgers";
import { COPY_WORDS, L2_WORDS } from "@/lib/liquity/event-templates";
import { l4Markdown, l5Heading, learnMoreMarkdown as sharedLearnMore } from "@/lib/shared/event-prose/markdown";

export interface LiquityEventLedgers {
  collateral: LiquityEventLedger | null;
  debt: LiquityEventLedger | null;
}

/** The "?" modal as Markdown, in the modal's order. */
export const learnMoreMarkdown = (c: LearnMoreContent): string[] => sharedLearnMore(c, COPY_WORDS.links);

export { l5Heading };

/** One event's block. `l5: "full"` prints the modal (a single-event copy);
 *  "ref" names it (a position export prints each once, at the end). */
export function liquityEventMarkdown(
  p: LiquityEventProse,
  c: LiquityEventContext,
  ledgers: LiquityEventLedgers | null,
  l5: "full" | "ref" = "full",
): string {
  const out: string[] = [...contextHeader(p, c), "", `**L1** ${p.L1}`];
  if (p.L2 && p.L2.lines.length) out.push("", "**L2**", ...p.L2.lines.map((l) => `- ${l}`));
  const tables: string[][] = [];
  if (ledgers?.collateral) tables.push(ledgerMarkdown(ledgers.collateral, L2_WORDS.collateral, c.timestamp));
  if (ledgers?.debt) tables.push(ledgerMarkdown(ledgers.debt, L2_WORDS.debt, c.timestamp));
  if (tables.length) {
    out.push("", "**L3**");
    tables.forEach((t, i) => out.push(...(i > 0 ? ["", ...t] : t)));
  }
  // A grouped explanation heads each group's bullets "**L4 · What happened**",
  // the pane's heading (ui-jobs 282).
  out.push(...l4Markdown(explanationRuns(p)));
  if (l5 === "full") out.push("", l5Heading(p.L5.content.title), ...learnMoreMarkdown(p.L5.content));
  else out.push("", `**L5** ${p.L5.content.title} ${COPY_WORDS.below}`);
  out.push("", `**${COPY_WORDS.footer}** ${footerLine(p)}`);
  return out.join("\n");
}
