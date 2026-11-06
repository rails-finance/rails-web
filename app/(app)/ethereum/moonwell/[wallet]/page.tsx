import { indexReadAt } from "@/lib/shared/position-read-server";
import { PositionReadProvider } from "@/components/shared/position-read";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { loadMoonwellPositionTail } from "@/lib/moonwell/position-page-data";
import MoonwellPositionView from "./position-view";

interface Props {
  params: Promise<{ wallet: string }>;
}

// The position's numbers are stated as current, so the route renders per request
// and every backend read is `no-store`.
export const dynamic = "force-dynamic";

// A wallet is not a position id: an address Moonwell has never seen is a
// legitimate empty answer for this page to render, not a 404. Only a string that
// cannot be an address is — nothing on chain answers to it.
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

// Moved down from the layout: the page is the segment that fetches, so it is the
// segment that can describe what it fetched.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  // This route carries its own opengraph-image.tsx, rendering this account's
  // live card — the static per-explorer PNG stays only its fallback.
  return positionMetadata({
    session: "moonwell",
    subject: wallet,
    canonicalPath: `/ethereum/moonwell/${wallet}`,
    image: "dynamic",
  });
}

export default async function MoonwellPositionPage({ params }: Props) {
  const { wallet: raw } = await params;
  if (!ADDRESS.test(raw)) notFound();
  const wallet = raw.toLowerCase();

  // The index head beside the tail: the block the card states (ui-jobs 512).
  const [tail, read] = await Promise.all([loadMoonwellPositionTail(wallet), indexReadAt(MAINNET_CHAIN_ID)]);

  return (
    <PositionReadProvider key={wallet} read={tail.position ? read : null}>
      <MoonwellPositionView
        // Keyed on the wallet so a client-side navigation to another account
        // remounts with that account's server tail as its initial state.
        key={wallet}
        wallet={wallet}
        initialPosition={tail.position}
        initialEvents={tail.events}
        initialCutoffBlock={tail.cutoffBlock}
        initialOpening={tail.opening}
      />
    </PositionReadProvider>
  );
}
