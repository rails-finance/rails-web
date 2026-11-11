import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { fetchIndexProgress, fetchIndexStatus } from "@/lib/api/fetch-index";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { CHAINS } from "@/lib/shared/chains";
import { isLaunchedChain } from "@/lib/shared/protocols";
import { StatusBoard, type StatusSource, type StatusView } from "@/components/status/status-board";

// focus: Rails' own indexing status, a page about Rails itself.

// The public status page (rails-ops ui-jobs 583, decision 0064 point 4), one
// route per chain as /coverage has, and /status/prices for the oracle feeds:
// how far each protocol's index has read and whether its data is arriving,
// from rails-server's stored rows. A visit reads no chain. The bare /status
// redirects to Ethereum's (next.config.ts).

export const revalidate = 60;

const chainBySlug = (slug: string) => Object.values(CHAINS).find((c) => c.slug === slug);

function viewOf(slug: string): StatusView | null {
  if (slug === "prices") return { kind: "prices" };
  const chain = chainBySlug(slug);
  return chain ? { kind: "chain", chain: chain.id } : null;
}

export function generateStaticParams() {
  return [...Object.values(CHAINS).map((c) => ({ view: c.slug })), { view: "prices" }];
}

export async function generateMetadata({ params }: { params: Promise<{ view: string }> }): Promise<Metadata> {
  const { view } = await params;
  const v = viewOf(view);
  const name = v?.kind === "chain" ? CHAINS[v.chain].name : "Prices";
  const meta = listingMetadata({
    title: `Status: ${name}`,
    canonicalPath: `/status/${view}`,
    description:
      v?.kind === "prices"
        ? "Whether the prices behind Rails' dollar figures are arriving: each Chainlink feed and rate update, and the price fillers."
        : `How far Rails has read each protocol's history on ${name}, and whether its data is arriving now.`,
  });
  // A chain with no launched explorer keeps its page out of search, as /coverage does.
  return v?.kind === "chain" && !isLaunchedChain(v.chain) ? { ...meta, robots: { index: false, follow: false } } : meta;
}

export default async function StatusPage({ params }: { params: Promise<{ view: string }> }) {
  const { view: slug } = await params;
  const view = viewOf(slug);
  if (!view) notFound();
  // /status covers every explorer; a server without it answers 404, and the
  // page falls back to /progress (the fill only).
  const status = await fetchIndexStatus();
  const progress = status.kind === "ok" ? null : await fetchIndexProgress();
  const source: StatusSource | null =
    status.kind === "ok"
      ? { route: "status", data: status.data }
      : progress?.kind === "ok"
        ? { route: "progress", data: progress.data }
        : null;
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-32 md:px-6">
      <h1 className="font-sans font-semibold tracking-tight text-foreground text-[clamp(28px,4vw,40px)]">Status</h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-rb-500">
        Rails reads every protocol&apos;s history from its deployment block. This page shows how far each index has
        read, chain by chain, and whether its data is arriving now.
      </p>
      {source ? (
        <StatusBoard source={source} view={view} />
      ) : (
        <p className="mt-10 rounded-xl bg-raised p-4 text-sm text-rb-500">
          The index server did not answer. Its figures show here when it does.
        </p>
      )}
    </div>
  );
}
