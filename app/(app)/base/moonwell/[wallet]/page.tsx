import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { loadMoonwellBaseHead } from "@/lib/moonwell-base/position-page-data";
import MoonwellBaseView from "./moonwell-base-view";

interface Props {
  params: Promise<{ wallet: string }>;
}

// Every figure here is read at the head — the Comptroller's verdict on this
// account, and how far the index has walked. Nothing about it is cacheable
// across requests.
export const dynamic = "force-dynamic";

/** The route's own address gate. `loadMoonwellPositionFromChain` calls viem's
 *  `getAddress`, which throws outside its try — so a malformed wallet has to be
 *  turned away here rather than allowed to throw through the render. */
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  // This route carries its own opengraph-image.tsx, rendering this account's
  // live card — the static per-explorer PNG stays only its fallback.
  return positionMetadata({
    session: "moonwell-base",
    subject: wallet,
    canonicalPath: `/base/moonwell/${wallet}`,
    image: "dynamic",
  });
}

export default async function MoonwellBasePositionPage({ params }: Props) {
  const { wallet: raw } = await params;
  if (!ADDRESS.test(raw)) notFound();
  const wallet = raw.toLowerCase();

  // Both legs measure well under a second, so they are awaited here; the
  // history sweep is not, and stays in the client half. See the loader.
  const { position, coverage } = await loadMoonwellBaseHead(wallet);

  return (
    <MoonwellBaseView
      // Keyed on the wallet so a client-side navigation to another account
      // remounts with that account's server read as its initial state.
      key={wallet}
      wallet={wallet}
      initialPosition={position}
      initialCoverage={coverage}
    />
  );
}
