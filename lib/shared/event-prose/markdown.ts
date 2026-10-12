// An event's prose as Markdown, the parts every family's Copy for LLM block
// shares: the "?" modal in the modal's order, the L4 runs under their
// headings, the L5 heading. A family's block adds its context header, L1
// to L3 and footer around these (Liquity V2: lib/liquity/event-markdown.ts).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { ProseSentence } from "./types";

/** The "?" modal as Markdown, in the modal's order. `linksWord` heads the
 *  Quick Links line (the family's `copy_words.links`). */
export function learnMoreMarkdown(c: LearnMoreContent, linksWord: string): string[] {
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
  if (c.links?.length) out.push(`${linksWord} ${c.links.map((l) => l.label).join(" · ")}`);
  return out;
}

/** A group's heading in L4: "**L4 · What happened**". */
export const l4Heading = (heading: string) => `**L4 · ${heading}**`;

/** The L5 heading: "**L5 · How adjusting a trove works**". */
export const l5Heading = (title: string) => `**L5 · ${title}**`;

/** L4 as Markdown lines: each run under its heading, or under "**L4**" when
 *  the explanation is flat. */
export function l4Markdown(runs: { heading: string | null; sentences: ProseSentence[] }[]): string[] {
  const out: string[] = [];
  for (const run of runs)
    out.push("", run.heading ? l4Heading(run.heading) : "**L4**", ...run.sentences.map((s) => `- ${s.text}`));
  return out;
}
