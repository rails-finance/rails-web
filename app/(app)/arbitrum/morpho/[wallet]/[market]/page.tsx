import type { Metadata } from "next";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { isMorphoArbitrumMarketSegment } from "@/lib/morpho-arbitrum/routes";
import { loadMorphoArbitrumTail } from "@/lib/morpho-arbitrum/position-page-data";
import { recordMorphoArbitrumVisit } from "@/lib/morpho-arbitrum/record-visit";
import MorphoArbitrumPositionView from "./position-view";

interface Props {
  params: Promise<{ wallet: string; market: string }>;
}

// Every figure is read at one block per request; nothing is cacheable across requests.
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet, market } = await params;
  return positionMetadata({
    session: "morpho-arbitrum",
    subject: wallet,
    market: `${market.slice(0, 10)}…`,
    canonicalPath: `/arbitrum/morpho/${wallet}/${market}`,
    image: "dynamic",
  });
}

export default async function MorphoArbitrumPositionPage({ params }: Props) {
  const { wallet: rawWallet, market: rawMarket } = await params;
  if (!ADDRESS.test(rawWallet)) notFound();
  const market = rawMarket?.toLowerCase();
  // A market is named by its 32-byte id; a segment that is not one names nothing.
  if (!isMorphoArbitrumMarketSegment(market)) notFound();
  const wallet = rawWallet.toLowerCase();

  // Both reads are the wallet's: this position's history is a slice of the
  // wallet's, served flat.
  const tail = await loadMorphoArbitrumTail(wallet);

  if (tail.head) {
    const read = tail.head;
    const markets = tail.historyMarketIds;
    after(() => recordMorphoArbitrumVisit(read, markets));
  }

  return (
    <MorphoArbitrumPositionView
      key={`${wallet}:${market}`}
      wallet={wallet}
      market={market}
      initialSlots={tail.head}
      initialTimeline={tail.timeline}
    />
  );
}
