import type { Metadata } from "next";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { loadAaveV3ArbitrumTail } from "@/lib/aave-v3-arbitrum/position-page-data";
import { recordAaveV3ArbitrumVisit } from "@/lib/aave-v3-arbitrum/record-visit";
import AaveV3ArbitrumPositionView from "./position-view";

interface Props {
  params: Promise<{ wallet: string }>;
}

// Every figure is read at the head; nothing is cacheable across requests.
export const dynamic = "force-dynamic";

/** `loadAaveV3PositionFromChain` calls viem's `getAddress`, which throws outside
 *  its try — a malformed wallet is turned away here. */
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  return positionMetadata({
    session: "aave-v3-arbitrum",
    subject: wallet,
    canonicalPath: `/arbitrum/aave-v3/${wallet}`,
    image: "dynamic",
  });
}

export default async function AaveV3ArbitrumPositionPage({ params }: Props) {
  const { wallet: raw } = await params;
  if (!ADDRESS.test(raw)) notFound();
  const wallet = raw.toLowerCase();

  // The Pool read live, and the history from rails-server's store; either
  // that misses its budget is left to the client half.
  const tail = await loadAaveV3ArbitrumTail(wallet);

  // One post of this render's Pool read, once the response is sent; a stub
  // (`chainStale`) or a missed read posts nothing.
  if (tail.position) {
    const read = tail.position;
    after(() => recordAaveV3ArbitrumVisit(read));
  }

  return (
    <AaveV3ArbitrumPositionView
      key={wallet}
      wallet={wallet}
      initialPosition={tail.position}
      initialTimeline={tail.timeline}
    />
  );
}
