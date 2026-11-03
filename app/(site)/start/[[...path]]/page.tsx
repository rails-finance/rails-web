// /start and every step under it (rails-ops ui-jobs 478): one question per
// screen, drawn from lib/start/start-tree.json by the path the URL names
// (`/start/browse/borrowing/eth`). An unknown path is a 404. The learn page is
// its own route (`/start/learn`).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ChainGlyph } from "@/components/shared/chain-toggle";
import { StartCard, StartCardGrid } from "@/components/start/start-card";
import { SkipToSearch, StartCrumbs } from "@/components/start/start-chrome";
import { ExplorerPicker } from "@/components/start/explorer-picker";
import { FirstQuestion } from "@/components/start/first-question";
import { CHAINS } from "@/lib/shared/chains";
import Link from "next/link";
import { resultRows } from "@/lib/start/results";
import { TREE, groupPhrase, optionHref, resolveStartPath, type Resolved } from "@/lib/start/tree";

type Params = { params: Promise<{ path?: string[] }> };

function headingOf(r: Resolved): string {
  const { step } = r;
  if (step.kind === "node") return step.node.question;
  if (step.kind === "roster") return TREE.rosters[step.roster].question;
  const spec = TREE.results[step.results];
  return spec.heading.replace("{group}", step.group ? groupPhrase(step.group) : "");
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { path = [] } = await params;
  const r = resolveStartPath(path);
  if (!r) return {};
  const trail = r.crumbs.map((c) => c.label).join(" › ");
  return {
    title: trail || "Start here",
    description: headingOf(r),
    alternates: { canonical: `/start${path.length ? `/${path.join("/")}` : ""}` },
  };
}

export default async function StartPage({ params }: Params) {
  const { path = [] } = await params;
  const r = resolveStartPath(path);
  if (!r) notFound();
  const base = `/start${path.length ? `/${path.join("/")}` : ""}`;
  const { step } = r;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-28 pb-16 md:px-6" data-anatomy="G1" data-start-step={base}>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <StartCrumbs crumbs={r.crumbs} />
        <SkipToSearch />
      </div>
      <h1 className="mb-2 font-sans font-semibold tracking-tight leading-tight text-foreground text-[clamp(28px,4.5vw,44px)]">
        {headingOf(r)}
      </h1>

      {step.kind === "node" && path.length === 0 && (
        <div className="mt-8">
          <FirstQuestion heading={false} />
        </div>
      )}

      {step.kind === "node" && path.length > 0 && (
        <StartCardGrid
          columns={step.node.options.length === 4 ? 4 : step.node.options.length === 2 ? 2 : 3}
          className="mt-8"
        >
          {step.node.options.map((o) => (
            <StartCard key={o.slug} href={optionHref(base, o)} title={o.label} line={o.line} />
          ))}
        </StartCardGrid>
      )}

      {step.kind === "roster" && (
        <>
          <p className="mb-8 max-w-2xl text-lg text-rb-500">{TREE.rosters[step.roster].line}</p>
          <ExplorerPicker mode={step.roster} />
        </>
      )}

      {step.kind === "results" && <Results results={step.results} group={step.group} />}
    </div>
  );
}

function Results({
  results,
  group,
}: {
  results: "borrow" | "near-liquidation" | "liquidated";
  group?: "eth" | "btc" | "stablecoins";
}) {
  const rows = resultRows(results, group);
  return (
    <div data-anatomy="G5" data-start-results={results}>
      <p className="mb-8 max-w-2xl text-lg text-rb-500">{TREE.results[results].line}</p>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.entry.id}>
            <Link
              href={row.href}
              data-start-result={row.entry.id}
              data-start-applied={row.applied ? "" : undefined}
              className="flex items-center gap-3 rounded-xl border border-rb-200 bg-raised px-4 py-3 transition-colors duration-150 hover:border-[var(--marketing)] dark:border-rb-600"
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
