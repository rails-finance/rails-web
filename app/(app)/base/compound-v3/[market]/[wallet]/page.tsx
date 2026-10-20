// One Compound V3 position on Base: a Comet and a wallet. The Comet read and
// the history are the whole wallet's (every Comet asked in three batched
// calls, the history from the index or the sweep); the view draws the market
// this URL names, as Arbitrum's market page does
// (rails-ops reference/arbitrum-position-first-lane.md).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { servedFoldersFromParam } from "@/lib/shared/timeline-folder";
import { loadCompoundBaseGroupedTail, loadCompoundBaseTail } from "@/lib/compound-base/position-page-data";
import { compoundBaseMarketOf } from "@/lib/compound-base/asset-catalog";
import { compoundBaseMarketHref } from "@/lib/compound-base/routes";
import CompoundBaseMarketView from "./position-view";

interface Props {
  params: Promise<{ market: string; wallet: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Every figure here is read at the head: each Comet's verdict on this account.
// Nothing about it is cacheable across requests.
export const dynamic = "force-dynamic";

/** The route's own address gate. The chain reader calls viem's `getAddress`,
 *  which throws outside its try, so a malformed wallet is turned away here. */
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market, wallet } = await params;
  const m = compoundBaseMarketOf(market);
  return positionMetadata({
    session: "compound-base",
    subject: wallet,
    market: m?.label,
    canonicalPath: compoundBaseMarketHref(m?.key ?? market, wallet),
    // This route carries its own opengraph-image.tsx, rendering this
    // position's live card; the static per-explorer PNG stays its fallback.
    image: "dynamic",
  });
}

export default async function CompoundBaseMarketPage({ params, searchParams }: Props) {
  const { market: rawMarket, wallet: raw } = await params;
  const market = compoundBaseMarketOf(rawMarket);
  if (!market || !ADDRESS.test(raw)) notFound();
  const wallet = raw.toLowerCase();

  // The roster read, and the history when the index can vouch for the whole of
  // it. A history that has to be swept from the Comets' own logs measures in
  // seconds and stays in the client half (lib/shared/swept-position-page-data.ts).
  // As rows unless the reader asked for `?folders=0`: the newest rows up to
  // the row cap, the rest held by the route for a month read.
  const grouped = servedFoldersFromParam((await searchParams).folders);
  const tail = grouped ? await loadCompoundBaseGroupedTail(wallet) : await loadCompoundBaseTail(wallet);

  return (
    <CompoundBaseMarketView
      // Keyed on the pair so a client-side navigation to another position
      // remounts with that position's server read as its initial state.
      key={`${market.key}:${wallet}`}
      wallet={wallet}
      market={market.key}
      initialWallet={tail.head}
      initialTimeline={tail.timeline}
    />
  );
}
