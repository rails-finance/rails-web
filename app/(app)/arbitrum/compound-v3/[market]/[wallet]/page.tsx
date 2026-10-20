// One Compound V3 position on Arbitrum: a Comet and a wallet. The Comet read
// and the history are the whole wallet's (one batched call answers every
// Comet); the view draws the market this URL names
// (rails-ops reference/arbitrum-position-first-lane.md).

import type { Metadata } from "next";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { compoundArbitrumMarketOf } from "@/lib/compound-arbitrum/asset-catalog";
import { compoundArbitrumMarketHref } from "@/lib/compound-arbitrum/routes";
import { loadCompoundArbitrumTail } from "@/lib/compound-arbitrum/position-page-data";
import { recordCompoundArbitrumVisit } from "@/lib/compound-arbitrum/record-visit";
import CompoundArbitrumMarketView from "./position-view";

interface Props {
  params: Promise<{ market: string; wallet: string }>;
}

// Every figure is read at one block per request; nothing is cacheable across requests.
export const dynamic = "force-dynamic";

/** The chain reader calls viem's `getAddress`, which throws outside its try —
 *  a malformed wallet is turned away here. */
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market, wallet } = await params;
  const m = compoundArbitrumMarketOf(market);
  return positionMetadata({
    session: "compound-v3-arbitrum",
    subject: wallet,
    market: m?.label,
    canonicalPath: compoundArbitrumMarketHref(m?.key ?? market, wallet),
    image: "dynamic",
  });
}

export default async function CompoundArbitrumMarketPage({ params }: Props) {
  const { market: rawMarket, wallet: raw } = await params;
  const market = compoundArbitrumMarketOf(rawMarket);
  if (!market || !ADDRESS.test(raw)) notFound();
  const wallet = raw.toLowerCase();

  // The four Comets at one block, and the history from rails-server's store;
  // either that misses its budget is left to the client half.
  const tail = await loadCompoundArbitrumTail(wallet);

  // One post of this render's Comet read, once the response is sent; a stale
  // stub or a missed read posts nothing.
  if (tail.head) {
    const read = tail.head;
    const markets = tail.historyMarketKeys;
    after(() => recordCompoundArbitrumVisit(read, markets));
  }

  return (
    <CompoundArbitrumMarketView
      key={`${market.key}:${wallet}`}
      wallet={wallet}
      market={market.key}
      initialWallet={tail.head}
      initialTimeline={tail.timeline}
    />
  );
}
