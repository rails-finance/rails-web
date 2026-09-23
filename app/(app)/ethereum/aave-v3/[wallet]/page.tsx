import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { asV3Market } from "@/lib/aave-v3/asset-catalog";
import { loadAaveV3PositionTail } from "@/lib/aave-v3/position-page-data";
import { servedFoldersFromParam } from "@/lib/shared/timeline-folder";
import AaveV3PositionDetail from "./position-view";

interface Props {
  params: Promise<{ wallet: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// The position's numbers are stated as current, so the route renders per request
// and every backend read is `no-store`. Serving a position page from a previous
// request's read is a separate decision — a charter one, about which values may
// render as current — not a side effect of this change.
export const dynamic = "force-dynamic";

// A wallet is not a position id: an address Aave V3 has never seen is a
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
    session: "aave-v3",
    subject: wallet,
    canonicalPath: `/ethereum/aave-v3/${wallet}`,
    image: "dynamic",
  });
}

export default async function AaveV3PositionPage({ params, searchParams }: Props) {
  const { wallet: raw } = await params;
  if (!ADDRESS.test(raw)) notFound();
  // The client half lower-cased this off useParams; every read below is keyed on
  // it, so it is normalised once, here, before anything is fetched.
  const wallet = raw.toLowerCase();

  // V3 is one cross-collateralised account per (wallet, market), and each market
  // is a separate Pool — so the market has to be decoded before the read, not
  // after hydration, or the first document would state the Core position for a
  // link that asked for Prime. `asV3Market` falls back to Core, which is the
  // behaviour the client had: an unrecognised market is not a 404.
  const sp = await searchParams;
  const rawMarket = Array.isArray(sp.market) ? sp.market[0] : sp.market;
  const market = asV3Market(rawMarket ?? null);

  // The same history as ROWS (decision 0019's evening amendment) — the default
  // since 2026-09-12, with `?folders=0` the way back to a flat window. It is
  // decided HERE and not after hydration, because it chooses which timeline
  // read the tail makes; asking the client to decide would mean the server
  // fetching one shape of the history and the client fetching the other.
  // `servedFoldersFromParam` is the same test the browser half applies.
  const grouped = servedFoldersFromParam(sp.folders);

  const tail = await loadAaveV3PositionTail(wallet, market, grouped);

  return (
    <AaveV3PositionDetail
      // Keyed on the account, its market AND the shape of its history: all
      // three change what this page is about, so a client-side navigation to
      // any of them remounts with the new server tail rather than holding the
      // previous numbers — or the previous partition — under new props.
      key={`${wallet}:${market}:${grouped ? "rows" : "events"}`}
      wallet={wallet}
      market={market}
      initialPosition={tail.position}
      initialEvents={tail.events}
      initialCutoffBlock={tail.cutoffBlock}
      initialOpening={tail.opening}
      initialGrouped={tail.grouped}
    />
  );
}
