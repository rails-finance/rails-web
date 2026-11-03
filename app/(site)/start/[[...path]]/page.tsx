// /start and every step under it (rails-ops ui-jobs 478). The question stack
// is the layout's (app/(site)/start/layout.tsx); this page names the step's
// title, answers an unknown path with a 404, and at a leaf (results, the
// explorer roster, the learn page) draws its content under the stack.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ChainGlyph } from "@/components/shared/chain-toggle";
import { ExplorerPicker } from "@/components/start/explorer-picker";
import { LearnContent } from "@/components/start/learn-content";
import { CHAINS } from "@/lib/shared/chains";
import { resultRows } from "@/lib/start/results";
import { TREE, groupPhrase, resolveStartPath, type GroupKey, type Leaf, type ResultsKey } from "@/lib/start/tree";

type Params = { params: Promise<{ path?: string[] }> };

const H1 = "mb-2 font-sans font-semibold tracking-tight leading-tight text-foreground text-[clamp(28px,4.5vw,44px)]";

/** A link to another page resting on a card: NAV_BUTTON's blue border on hover
 *  (color-grammar.md §4a). */
const PAGE_ROW =
  "flex items-center gap-3 rounded-xl border border-rb-200 bg-raised px-4 py-3 transition-colors duration-150 hover:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-rb-600";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { path = [] } = await params;
  const r = resolveStartPath(path);
  if (!r) return {};
  return {
    title: r.answers.join(" › ") || "Start here",
    description: r.leaf ? leafHeading(r.leaf) : r.levels[r.levels.length - 1].node.question,
    alternates: { canonical: `/start${path.length ? `/${path.join("/")}` : ""}` },
  };
}

function leafHeading(leaf: Leaf): string {
  if (leaf.kind === "roster") return TREE.rosters[leaf.roster].question;
  if (leaf.kind === "learn") return "New to DeFi?";
  return TREE.results[leaf.results].heading.replace("{group}", leaf.group ? groupPhrase(leaf.group) : "");
}

export default async function StartPage({ params }: Params) {
  const { path = [] } = await params;
  const r = resolveStartPath(path);
  if (!r) notFound();
  // The stack is the layout's; the page draws the leaf under it, if any.
  return r.leaf ? <LeafContent leaf={r.leaf} /> : null;
}

function LeafContent({ leaf }: { leaf: Leaf }) {
  if (leaf.kind === "learn") return <LearnContent />;
  if (leaf.kind === "results") return <Results results={leaf.results} group={leaf.group} />;
  return (
    <>
      <h1 className={H1}>{TREE.rosters[leaf.roster].question}</h1>
      <p className="mb-8 max-w-2xl text-lg text-rb-500">{TREE.rosters[leaf.roster].line}</p>
      <ExplorerPicker mode={leaf.roster} />
    </>
  );
}

function Results({ results, group }: { results: ResultsKey; group?: GroupKey }) {
  const rows = resultRows(results, group);
  return (
    <div data-anatomy="G5" data-start-results={results}>
      <h1 className={H1}>{leafHeading({ kind: "results", results, group })}</h1>
      <p className="mb-8 max-w-2xl text-lg text-rb-500">{TREE.results[results].line}</p>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.entry.id}>
            <Link
              href={row.href}
              data-start-result={row.entry.id}
              data-start-applied={row.applied ? "" : undefined}
              className={PAGE_ROW}
            >
              <ProtocolIcon id={row.entry.id} className="h-6 w-6 shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2 text-base font-medium text-foreground">
                  {row.entry.label}
                  <span className="inline-flex items-center gap-1 text-xs font-normal text-rb-500">
                    <ChainGlyph chainId={row.entry.chainId} className="h-3.5 w-3.5" />
                    {CHAINS[row.entry.chainId].name}
                  </span>
                </span>
                {(row.detail || !row.applied) && (
                  <span className="truncate text-sm text-rb-500">
                    {[row.detail, row.applied ? null : "Opens the full list"].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
