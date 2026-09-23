import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { loadCompoundBaseTail } from "@/lib/compound-base/position-page-data";
import CompoundBaseWalletView from "./position-view";

interface Props {
  params: Promise<{ wallet: string }>;
}

// Every figure here is read at the head — each Comet's verdict on this account.
// Nothing about it is cacheable across requests.
export const dynamic = "force-dynamic";

/** The route's own address gate. The chain reader calls viem's `getAddress`,
 *  which throws outside its try — so a malformed wallet has to be turned away
 *  here rather than allowed to throw through the render. */
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

// Moved down from the layout: the page is the segment that fetches, so it is the
// segment that can describe what it fetched.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  return positionMetadata({
    session: "compound-base",
    subject: wallet,
    canonicalPath: `/base/compound-v3/${wallet}`,
    // This route carries its own opengraph-image.tsx, rendering this
    // account's live card — the static per-explorer PNG stays only its
    // fallback.
    image: "dynamic",
  });
}

export default async function CompoundBaseWalletPage({ params }: Props) {
  const { wallet: raw } = await params;
  if (!ADDRESS.test(raw)) notFound();
  const wallet = raw.toLowerCase();

  // The roster read, and the history when the index can vouch for the whole of
  // it. A history that has to be swept from the Comets' own logs measures in
  // seconds and stays in the client half — see
  // lib/shared/swept-position-page-data.ts.
  const tail = await loadCompoundBaseTail(wallet);

  return (
    <CompoundBaseWalletView
      // Keyed on the wallet so a client-side navigation to another account
      // remounts with that account's server read as its initial state.
      key={wallet}
      wallet={wallet}
      initialWallet={tail.head}
      initialTimeline={tail.timeline}
    />
  );
}
