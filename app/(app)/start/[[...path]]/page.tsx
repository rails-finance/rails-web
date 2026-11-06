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
import { shownOnArrival } from "@/lib/vaults/roster-preset";
import type { VaultSummary } from "@/lib/vaults/summary";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { resultRows, type ResultRow } from "@/lib/start/results";
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
/** A row whose listing cannot take the answer's filter or sort: the link opens
 *  the whole list, and the line says why (was "Opens the full list"; Miles,
 *  6 Nov 2026). */
const UNFILTERED: Record<ResultsKey, string> = {
  borrow: "Every position: this list can't filter by collateral",
  "near-liquidation": "Every position: this list can't sort by risk",
  liquidated: "Every position: this list can't filter to liquidations",
};

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
              {/* Columns from sm (Miles, 6 Nov 2026): the name, the chain named
                  in words for a newcomer, then what the row matched (the
                  collateral as tokens) or why the list opens whole. Below sm
                  the line sits under the name and the chain at the right. */}
              <span className="flex min-w-0 flex-1 flex-col sm:w-48 sm:flex-none">
                <span className="truncate text-base font-medium text-foreground">{row.entry.label}</span>
                <span className="sm:hidden">
                  <ResultLine row={row} results={results} />
                </span>
              </span>
              <span
                className="inline-flex shrink-0 items-center gap-1.5 text-sm text-rb-500 sm:w-28"
                data-start-chain=""
              >
                <ChainGlyph chainId={row.entry.chainId} className="h-3.5 w-3.5" />
                {CHAINS[row.entry.chainId].name}
              </span>
              <span className="hidden min-w-0 flex-1 sm:block">
                <ResultLine row={row} results={results} />
              </span>
              <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A result row's line: the collateral it matched, as tokens, or the sort's
 *  label; and, where its listing cannot take the answer, why it opens whole. */
function ResultLine({ row, results }: { row: ResultRow; results: ResultsKey }) {
  const whole = row.applied ? null : UNFILTERED[results];
  if (row.symbols && row.symbols.length > 0)
    return (
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-rb-500">
        {row.symbols.map((sym) => (
          <span key={sym} className="inline-flex items-center gap-1">
            <TokenChipIcon symbol={sym} size={14} filterable={false} untitled />
            {sym}
          </span>
        ))}
        {whole && <span className="basis-full">{whole}</span>}
      </span>
    );
  const text = [row.detail, whole].filter(Boolean).join(" · ");
  return text ? <span className="block text-sm text-rb-500">{text}</span> : null;
}

/** A group's coins (G8; ui-jobs 525): "All <group>" first, then a row per
 *  coin opening the vaults that hold it, most held first. The count is the
 *  rows the link opens on (shownOnArrival), so it matches the roster; a coin
 *  with none is left off. Linked in the vault's own spelling. */
async function Coins({ group }: { group: GroupKey }) {
  const g = TREE.groups[group];
  const { vaults } = await loadVaultIndex();
  // Counted as the roster counts the rows the link opens on: funded vaults,
  // under its preset unless that leaves none (lib/vaults/roster-preset.ts).
  const bySymbol = new Map<string, VaultSummary[]>();
  for (const v of vaults) {
    if (!v.asset.named) continue;
    const key = v.asset.symbol.toLowerCase();
    bySymbol.set(key, [...(bySymbol.get(key) ?? []), v]);
  }
  const held = new Map<string, { symbol: string; count: number }>();
  for (const [key, list] of bySymbol) {
    const count = shownOnArrival(list).length;
    if (count > 0) held.set(key, { symbol: list[0].asset.symbol, count });
  }
  const rows = (g.coins?.symbols ?? [])
    .flatMap((s) => {
      const h = held.get(s.toLowerCase());
      return h ? [{ label: s, ...h }] : [];
    })
    .sort((x, y) => y.count - x.count);
  return (
    <div data-anatomy="G8" data-start-coins={group}>
      <h2 className={QUESTION}>{g.coins?.question ?? g.label}</h2>
      <p className="mb-8 max-w-2xl text-lg text-rb-500">Each link opens the vaults that hold it.</p>
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
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((c) => (
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
              <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
