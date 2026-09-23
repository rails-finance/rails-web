import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { getCcipEscrow } from "@/lib/shared/known-infrastructure";
import { loadMaplePositionTail } from "@/lib/maple/position-page-data";
import MaplePositionView from "./position-view";

interface Props {
  params: Promise<{ wallet: string }>;
}

// The position's numbers are stated as current, so the route renders per request
// and every backend read is `no-store`.
export const dynamic = "force-dynamic";

// A wallet is not a position id: an address Maple has never lent to is a
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
    session: "maple",
    subject: wallet,
    canonicalPath: `/ethereum/maple/${wallet}`,
    image: "dynamic",
  });
}

export default async function MaplePositionPage({ params }: Props) {
  const { wallet: raw } = await params;
  if (!ADDRESS.test(raw)) notFound();
  const wallet = raw.toLowerCase();

  // The CCIP bridge escrows are not lenders — the backend holds no roster row
  // and no timeline for them, and the page renders a custody view off its own
  // chain read. Asking for a tail they cannot have would spend two reads to
  // learn nothing.
  const tail = getCcipEscrow(wallet) ? null : await loadMaplePositionTail(wallet);

  return (
    <MaplePositionView
      // Keyed on the wallet so a client-side navigation to another lender
      // remounts with that lender's server tail as its initial state.
      key={wallet}
      wallet={wallet}
      initialPosition={tail?.position ?? null}
      initialPoolState={tail?.poolState ?? null}
      initialEvents={tail?.events ?? null}
      initialCutoffBlock={tail?.cutoffBlock ?? null}
      initialOpening={tail?.opening ?? null}
    />
  );
}
