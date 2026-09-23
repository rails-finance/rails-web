import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { loadAaveV3BaseTail } from "@/lib/aave-v3-base/position-page-data";
import AaveV3BasePositionView from "./position-view";

interface Props {
  params: Promise<{ wallet: string }>;
}

// Every figure on this page is read at the head — the Pool's verdict on this
// account, priced by the oracle it liquidates with. Nothing about it is
// cacheable across requests.
export const dynamic = "force-dynamic";

/** The route's own address gate. `loadAaveV3PositionFromChain` calls viem's
 *  `getAddress`, which throws outside its try — so a malformed wallet has to be
 *  turned away here rather than allowed to throw through the render. */
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

// On the page rather than the layout now: the page is the segment that reads
// the account, so it is the segment that can describe what it read. The layout
// above keeps only the shell mark.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  // This route carries its own opengraph-image.tsx, rendering this account's
  // live card — the static per-explorer PNG stays only its fallback.
  return positionMetadata({
    session: "aave-v3-base",
    subject: wallet,
    canonicalPath: `/base/aave-v3/${wallet}`,
    image: "dynamic",
  });
}

export default async function AaveV3BasePositionPage({ params }: Props) {
  const { wallet: raw } = await params;
  if (!ADDRESS.test(raw)) notFound();
  const wallet = raw.toLowerCase();

  // The Pool, and the history when the index can vouch for the whole of it. A
  // history that has to be swept from the Pool's own logs measures in seconds
  // and stays in the client half — see lib/shared/swept-position-page-data.ts.
  const tail = await loadAaveV3BaseTail(wallet);

  return (
    <AaveV3BasePositionView
      // Keyed on the wallet so a client-side navigation to another account
      // remounts with that account's server read as its initial state, rather
      // than holding the previous account's numbers in state under new props.
      key={wallet}
      wallet={wallet}
      initialPosition={tail.position}
      initialTimeline={tail.timeline}
    />
  );
}
