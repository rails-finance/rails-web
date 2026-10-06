// A Liquity V2 event as Markdown: the Copy for LLM block on the event page and
// the event blocks of the test exports (BRIEF §3, §4). The context header,
// then L1 to L5 and the footer, each level the generator's text
// (lib/liquity/event-prose.ts) and the ledgers' rows (event-ledgers.ts), so a
// string on the page comes out here character for character. Facts only.

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { contextHeader, footerLine, type LiquityEventContext, type LiquityEventProse } from "@/lib/liquity/event-prose";
import { ledgerMarkdown, type LiquityEventLedger } from "@/lib/liquity/event-ledgers";

export interface LiquityEventLedgers {
  collateral: LiquityEventLedger | null;
  debt: LiquityEventLedger | null;
}

/** The "?" modal as Markdown, in the modal's order. */
export function learnMoreMarkdown(c: LearnMoreContent): string[] {
  const paras: string[] = [c.intro];
  if (c.stepsHeading && c.steps) paras.push([c.stepsHeading, ...c.steps.map((s, i) => `${i + 1}. ${s}`)].join("\n"));
  for (const p of c.extraParagraphs ?? []) paras.push(p);
  if (c.detailsHeading && c.details)
    paras.push(
      [
        c.detailsHeading,
        ...c.details.map(
          (d) =>
            `- **${d.bold}** — ${
              d.sources?.length ? `${d.text.replace(/\.$/, "")} (${d.sources.map((s) => s.label).join("; ")}).` : d.text
            }`,
        ),
      ].join("\n"),
    );
  if (c.video) paras.push(`${c.video.description} ${c.video.label}`);
  const out = paras.join("\n\n").split("\n");
  if (c.links?.length) out.push(`Links: ${c.links.map((l) => l.label).join(" · ")}`);
  return out;
}

/** The L5 heading: "**L5 · How adjusting a trove works**". */
export const l5Heading = (title: string) => `**L5 · ${title}**`;

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
  if (ledgers?.collateral) tables.push(ledgerMarkdown(ledgers.collateral, "Collateral", c.timestamp));
  if (ledgers?.debt) tables.push(ledgerMarkdown(ledgers.debt, "Debt", c.timestamp));
  if (tables.length) {
    out.push("", "**L3**");
    tables.forEach((t, i) => out.push(...(i > 0 ? ["", ...t] : t)));
  }
  const bullets = [...p.L4, ...p.list];
  if (bullets.length) out.push("", "**L4**", ...bullets.map((s) => `- ${s.text}`));
  if (l5 === "full") out.push("", l5Heading(p.L5.content.title), ...learnMoreMarkdown(p.L5.content));
  else out.push("", `**L5** ${p.L5.content.title} (below)`);
  out.push("", `**Footer** ${footerLine(p)}`);
  return out.join("\n");
}
