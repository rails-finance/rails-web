import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { loadLiquityV1PositionTail } from "@/lib/liquity-v1/position-page-data";
import LiquityV1TroveView from "./position-view";

interface Props {
  params: Promise<{ wallet: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// The Trove's numbers are stated as current, so the route renders per request
// and every backend read is `no-store`.
export const dynamic = "force-dynamic";

// A wallet is not a Trove id: an address that never borrowed here is a
// legitimate empty answer for this page to render, not a 404. Only a string that
// cannot be an address is — nothing on chain answers to it.
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

// Moved down from the layout: the page is the segment that fetches, so it is the
// segment that can describe what it fetched.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  return positionMetadata({
    session: "liquity-v1",
    subject: wallet,
    canonicalPath: `/ethereum/liquity-v1/${wallet}`,
    // This route carries its own opengraph-image.tsx, rendering this wallet's
    // live card — the static per-explorer PNG stays only its fallback.
    image: "dynamic",
  });
}

export default async function LiquityV1TrovePage({ params, searchParams }: Props) {
  const { wallet: raw } = await params;
  if (!ADDRESS.test(raw)) notFound();
  const wallet = raw.toLowerCase();

  // Which Trove life the page shows. Decoded here rather than from
  // `useSearchParams` on the client, so the document that renders on the server
  // is about the life the URL names — a wallet that reopened would otherwise be
  // served its latest life and swap after hydration.
  const sp = await searchParams;
  const rawEpoch = Array.isArray(sp.epoch) ? sp.epoch[0] : sp.epoch;

  const tail = await loadLiquityV1PositionTail(wallet);

  return (
    <LiquityV1TroveView
      // Keyed on the wallet so a client-side navigation to another borrower
      // remounts with that wallet's server tail as its initial state.
      key={wallet}
      wallet={wallet}
      epochParam={rawEpoch ?? null}
      initialSummaries={tail.summaries}
      initialEvents={tail.events}
      initialCutoffBlock={tail.cutoffBlock}
      initialOpening={tail.opening}
    />
  );
}
