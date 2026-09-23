import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { loadMakerVaultTail } from "@/lib/makerdao/position-page-data";
import MakerVaultDetailView from "./position-view";

interface Props {
  params: Promise<{ vault: string }>;
}

// The vault's numbers are stated as current, so the route renders per request
// and every backend read is `no-store`.
export const dynamic = "force-dynamic";

// The [vault] param is a cdp id — a decimal integer — or a urn ADDRESS, for the
// LockStake engine urns that have no cdp (decision 0013). A vault id the index
// has never seen is a legitimate empty answer for this page to render; a string
// that is neither of those two forms names nothing.
const CDP_ID = /^\d{1,20}$/;
const URN_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

// Moved down from the layout: the page is the segment that fetches, so it is the
// segment that can describe what it fetched.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { vault } = await params;
  return positionMetadata({
    session: "makerdao",
    subject: vault,
    canonicalPath: `/ethereum/makerdao/${vault}`,
    // This route carries its own opengraph-image.tsx, rendering this vault's
    // live card — the static per-explorer PNG stays only its fallback.
    image: "dynamic",
  });
}

export default async function MakerVaultPage({ params }: Props) {
  const { vault } = await params;
  if (!CDP_ID.test(vault) && !URN_ADDRESS.test(vault)) notFound();

  const tail = await loadMakerVaultTail(vault);

  return (
    <MakerVaultDetailView
      // Keyed on the vault so a client-side navigation to another one remounts
      // with that vault's server tail as its initial state.
      key={vault}
      vault={vault}
      initialSummary={tail.summary}
      initialChain={tail.chain}
      initialEvents={tail.events}
      initialCutoffBlock={tail.cutoffBlock}
      initialOpening={tail.opening}
    />
  );
}
