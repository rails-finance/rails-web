import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { marketOf } from "@/lib/compound/asset-catalog";
import { loadCompoundPositionTail } from "@/lib/compound/position-page-data";
import CompoundPositionView from "./position-view";

interface Props {
  params: Promise<{ market: string; wallet: string }>;
}

// The position's numbers are stated as current, so the route renders per request
// and every backend read is `no-store`.
export const dynamic = "force-dynamic";

// A wallet is not a position id: an account this Comet has never seen is a
// legitimate empty answer for this page to render, not a 404. Only a string that
// cannot be an address is — nothing on chain answers to it.
//
// The MARKET segment is deliberately not gated the same way. `marketOf`
// synthesises an entry for a slug the catalog has not seen, so that a
// newly-captured market never crashes the UI; turning an unknown slug into a 404
// here would take that back.
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

// Moved down from the layout: the page is the segment that fetches, so it is the
// segment that can describe what it fetched. Output is unchanged — the market's
// base-asset symbol ("USDC"/"WETH"/"USDT") names the market segment, resolved
// from the static Comet catalog (no fetch), matching how the view itself
// resolves the market via marketOf().
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market, wallet } = await params;
  return positionMetadata({
    session: "compound",
    subject: wallet,
    market: marketOf(market).baseSymbol,
    canonicalPath: `/ethereum/compound-v3/${market}/${wallet}`,
    // This route carries its own opengraph-image.tsx, rendering this
    // account's live card — the static per-explorer PNG stays only its
    // fallback.
    image: "dynamic",
  });
}

export default async function CompoundPositionPage({ params }: Props) {
  const { market: rawMarket, wallet: rawWallet } = await params;
  if (!ADDRESS.test(rawWallet)) notFound();
  const wallet = rawWallet.toLowerCase();
  const market = rawMarket.toLowerCase();

  const tail = await loadCompoundPositionTail(wallet, market);

  return (
    <CompoundPositionView
      // Keyed on the pair so a client-side navigation to another Comet account
      // remounts with that account's server tail as its initial state.
      key={`${market}:${wallet}`}
      wallet={wallet}
      market={market}
      initialPosition={tail.position}
      initialEvents={tail.events}
      initialCutoffBlock={tail.cutoffBlock}
      initialOpening={tail.opening}
    />
  );
}
