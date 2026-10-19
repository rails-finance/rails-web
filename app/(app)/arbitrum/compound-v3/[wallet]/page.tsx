import type { Metadata } from "next";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { loadCompoundArbitrumTail } from "@/lib/compound-arbitrum/position-page-data";
import { recordCompoundArbitrumVisit } from "@/lib/compound-arbitrum/record-visit";
import CompoundArbitrumWalletView from "./position-view";

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
    session: "compound-v3-arbitrum",
    subject: wallet,
    canonicalPath: `/arbitrum/compound-v3/${wallet}`,
    image: "dynamic",
  });
}

export default async function CompoundArbitrumWalletPage({ params }: Props) {
  const { wallet: raw } = await params;
  if (!ADDRESS.test(raw)) notFound();
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
    <CompoundArbitrumWalletView
      key={wallet}
      wallet={wallet}
      initialWallet={tail.head}
      initialTimeline={tail.timeline}
    />
  );
}
