import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { loadSparkPositionTail } from "@/lib/spark/position-page-data";
import { servedFoldersFromParam } from "@/lib/shared/timeline-folder";
import SparkPositionDetail from "./position-view";

interface Props {
  params: Promise<{ wallet: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// The position's numbers are stated as current, so the route renders per request
// and every backend read is `no-store`. Serving a position page from a previous
// request's read is a separate decision — a charter one, about which values may
// render as current — not a side effect of this change.
export const dynamic = "force-dynamic";

// A wallet is not a position id: an address SparkLend has never seen is a
// legitimate empty answer for this page to render, not a 404. Only a string that
// cannot be an address is — nothing on chain answers to it, so there is nothing
// for the page to be about.
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

// Moved down from the layout: the page is the segment that fetches, so it is the
// segment that can describe what it fetched. Output is unchanged.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  // This route carries its own opengraph-image.tsx, rendering this account's
  // live card — the static per-explorer PNG stays only its fallback.
  return positionMetadata({
    session: "spark",
    subject: wallet,
    canonicalPath: `/ethereum/spark/${wallet}`,
    image: "dynamic",
  });
}

export default async function SparkPositionPage({ params, searchParams }: Props) {
  const { wallet: raw } = await params;
  if (!ADDRESS.test(raw)) notFound();
  // The client half lower-cased this off useParams; every read below is keyed on
  // it, so it is normalised once, here, before anything is fetched.
  const wallet = raw.toLowerCase();

  // The same history as ROWS (decision 0019) — the default since 2026-09-12,
  // `?folders=0` the way back. Decided here and not after hydration, because it
  // chooses which timeline read the tail makes: the Aave V3 twin's page carries
  // the argument in full.
  const sp = await searchParams;
  const grouped = servedFoldersFromParam(sp.folders);

  const tail = await loadSparkPositionTail(wallet, grouped);

  return (
    <SparkPositionDetail
      // Keyed on the wallet AND the shape of its history, so a client-side
      // navigation to either remounts with the new server tail as its initial
      // state, rather than holding the previous account's numbers — or the
      // previous partition — in state under new props.
      key={`${wallet}:${grouped ? "rows" : "events"}`}
      wallet={wallet}
      initialPosition={tail.position}
      initialEvents={tail.events}
      initialCutoffBlock={tail.cutoffBlock}
      initialOpening={tail.opening}
      initialGrouped={tail.grouped}
    />
  );
}
