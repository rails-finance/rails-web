import type { Metadata } from "next";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { loadMorphoArbitrumTail } from "@/lib/morpho-arbitrum/position-page-data";
import { recordMorphoArbitrumVisit } from "@/lib/morpho-arbitrum/record-visit";
import MorphoArbitrumWalletView from "./position-view";

interface Props {
  params: Promise<{ wallet: string }>;
}

// Every figure is read at one block per request; nothing is cacheable across requests.
export const dynamic = "force-dynamic";

/** The chain reader calls viem's `getAddress`, which throws outside its try —
 *  a malformed wallet is turned away here. */
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  return positionMetadata({
    session: "morpho-arbitrum",
    subject: wallet,
    canonicalPath: `/arbitrum/morpho/${wallet}`,
    image: "dynamic",
  });
}

export default async function MorphoArbitrumWalletPage({ params }: Props) {
  const { wallet: raw } = await params;
  if (!ADDRESS.test(raw)) notFound();
  const wallet = raw.toLowerCase();

  // The singleton's slots at one block, and the history from rails-server's
  // store; either that misses its budget is left to the client half.
  const tail = await loadMorphoArbitrumTail(wallet);

  // One post of this render's slot read, once the response is sent; a stale
  // stub or a missed read posts nothing.
  if (tail.head) {
    const read = tail.head;
    const markets = tail.historyMarketIds;
    after(() => recordMorphoArbitrumVisit(read, markets));
  }

  return (
    <MorphoArbitrumWalletView key={wallet} wallet={wallet} initialSlots={tail.head} initialTimeline={tail.timeline} />
  );
}
