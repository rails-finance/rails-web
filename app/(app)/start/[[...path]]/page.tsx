// /start and every step under it (rails-ops ui-jobs 478). The question stack
// is the layout's (app/(app)/start/layout.tsx); this page names the step's
// title, answers an unknown path with a 404, and at a leaf (results, the
// explorer roster) draws its content under the stack.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ChainGlyph } from "@/components/shared/chain-toggle";
import { ExplorerPicker } from "@/components/start/explorer-picker";
import { CHAINS } from "@/lib/shared/chains";
import { withoutLiquidations } from "@/lib/start/liquidation-probe";
import { loadVaultIndex } from "@/lib/vaults/index-read";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { resultRows } from "@/lib/start/results";
import {
  TREE,
  groupPhrase,
  leavesStart,
  resolveStartPath,
  vaultsHref,
  type GroupKey,
  type Leaf,
  type ResultsKey,
} from "@/lib/start/tree";

// Static, rebuilt every ten minutes: the liquidation probe's cache window.
export const revalidate = 600;

/** Every path the tree holds, so each page is built ahead and revalidated. */
export function generateStaticParams(): { path: string[] }[] {
  const out: { path: string[] }[] = [{ path: [] }];
  const walk = (node: string, prefix: string[]) => {
    for (const o of TREE.nodes[node].options) {
      if (leavesStart(o)) continue;
      const path = [...prefix, o.slug];
      out.push({ path });
      if ("node" in o.to) walk(o.to.node, path);
    }
  };
  walk("start", []);
  return out;
}

type Params = { params: Promise<{ path?: string[] }> };

const QUESTION =
  "mb-2 font-sans font-semibold tracking-tight leading-tight text-foreground text-[clamp(28px,4.5vw,44px)]";

/** A link to another page resting on a card: NAV_BUTTON's blue border on hover
 *  (color-grammar.md §4a). */
const PAGE_ROW =
  "flex items-center gap-3 rounded-xl border border-rb-200 bg-raised px-4 py-3 transition-colors duration-150 hover:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-rb-600";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { path = [] } = await params;
  const r = resolveStartPath(path);
  if (!r) return {};
  return {
    // Absolute: the site template would print "Rails | Start here".
    title: { absolute: r.answers.length ? `Start here · ${r.answers.join(" › ")}` : "Start here" },
    description: r.leaf ? leafHeading(r.leaf) : r.levels[r.levels.length - 1].node.question,
    alternates: { canonical: `/start${path.length ? `/${path.join("/")}` : ""}` },
  };
}

function leafHeading(leaf: Leaf): string {
  if (leaf.kind === "roster") return TREE.rosters[leaf.roster].question;
  if (leaf.kind === "coins") return TREE.groups[leaf.group].coins?.question ?? TREE.groups[leaf.group].label;
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
  if (leaf.kind === "results") return <Results results={leaf.results} group={leaf.group} />;
  if (leaf.kind === "coins") return <Coins group={leaf.group} />;
  return (
    <>
      <h2 className={QUESTION}>{TREE.rosters[leaf.roster].question}</h2>
      <p className="mb-8 max-w-2xl text-lg text-rb-500">{TREE.rosters[leaf.roster].line}</p>
      <ExplorerPicker mode={leaf.roster} />
    </>
  );
}

async function Results({ results, group }: { results: ResultsKey; group?: GroupKey }) {
  let rows = resultRows(results, group);
  if (results === "liquidated") {
    // A row that opens on "0 Troves" is left off (ui-jobs 488).
    const empty = await withoutLiquidations(rows.map((r) => r.entry.id));
    rows = rows.filter((r) => !empty.has(r.entry.id));
  }
  return (
    <div data-anatomy="G5" data-start-results={results}>
      <h2 className={QUESTION}>{leafHeading({ kind: "results", results, group })}</h2>
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
              {/* The name and its line in a fixed column from sm, so the chain,
                  named in words for a newcomer, lines up down the list as a
                  column of its own (Miles, 6 Nov 2026). */}
              <span className="flex min-w-0 flex-1 flex-col sm:w-64 sm:flex-none">
                <span className="truncate text-base font-medium text-foreground">{row.entry.label}</span>
                {(row.detail || !row.applied) && (
                  <span className="truncate text-sm text-rb-500">
                    {[row.detail, row.applied ? null : "Opens the full list"].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-rb-500" data-start-chain="">
                <ChainGlyph chainId={row.entry.chainId} className="h-3.5 w-3.5" />
                {CHAINS[row.entry.chainId].name}
              </span>
              <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A group's coins (G6; ui-jobs 525): "All <group>" first, then each list
 *  under its heading, a row per coin opening the vaults that hold it. A coin
 *  no vault in the index holds is left off, so no row opens an empty list;
 *  the count is the index's, linked in the vault's own spelling. */
async function Coins({ group }: { group: GroupKey }) {
  const g = TREE.groups[group];
  const { vaults } = await loadVaultIndex();
  const held = new Map<string, { symbol: string; count: number }>();
  for (const v of vaults) {
    if (!v.asset.named) continue;
    const key = v.asset.symbol.toLowerCase();
    const h = held.get(key);
    if (h) h.count += 1;
    else held.set(key, { symbol: v.asset.symbol, count: 1 });
  }
  const lists = (g.coins?.lists ?? [])
    .map((l) => ({
      heading: l.heading,
      rows: l.symbols.flatMap((s) => {
        const h = held.get(s.toLowerCase());
        return h ? [{ label: s, ...h }] : [];
      }),
    }))
    .filter((l) => l.rows.length > 0);
  return (
    <div data-anatomy="G6" data-start-coins={group}>
      <h2 className={QUESTION}>{g.coins?.question ?? g.label}</h2>
      <p className="mb-8 max-w-2xl text-lg text-rb-500">Each opens the vaults that hold it.</p>
      <Link href={vaultsHref(group)} className={PAGE_ROW} data-start-coin="all">
        <span className="flex -space-x-1.5" aria-hidden="true">
          {(g.icons ?? []).map((sym) => (
            <span key={sym} className="rounded-full ring-2 ring-[var(--surface-raised)]">
              <TokenChipIcon symbol={sym} size={24} filterable={false} untitled />
            </span>
          ))}
        </span>
        <span className="text-base font-medium text-foreground">All {groupPhrase(group)}</span>
        <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
      </Link>
      {lists.map((l, i) => (
        <section key={l.heading ?? i} className="mt-8" aria-label={l.heading ?? g.label}>
          {l.heading && <h3 className="mb-2 text-sm font-medium text-rb-500">{l.heading}</h3>}
          <ul className={`grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 ${l.heading ? "" : "mt-2"}`}>
            {l.rows.map((c) => (
              <li key={c.symbol}>
                <Link
                  href={`/vaults?asset=${encodeURIComponent(c.symbol)}`}
                  className={PAGE_ROW}
                  data-start-coin={c.symbol}
                >
                  <TokenChipIcon symbol={c.label} size={24} filterable={false} untitled />
                  <span className="text-base font-medium text-foreground">{c.label}</span>
                  <span className="text-sm text-rb-500">
                    {c.count.toLocaleString("en-US")} {c.count === 1 ? "vault" : "vaults"}
                  </span>
                  <ArrowRight
                    className="ml-auto h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
