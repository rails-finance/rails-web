import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { isMorphoBaseMarketSegment } from "@/lib/morpho-base/routes";
import { loadMorphoBaseTail } from "@/lib/morpho-base/position-page-data";
import { morphoBaseVaultOwnerNote } from "@/lib/morpho-base/vault-owner-note";
import MorphoBasePositionView from "./position-view";

interface Props {
  params: Promise<{ wallet: string; market: string }>;
}

// Every figure here is read at the head — the singleton's own slots for this
// account. Nothing about it is cacheable across requests.
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

// Moved down from the layout: the page is the segment that fetches, so it is the
// segment that can describe what it fetched. Output is unchanged — the wallet
// titles the page (the helper truncates an address) and the market is named by
// its id's first bytes, there being no static id → symbol map here.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet, market } = await params;
  return positionMetadata({
    session: "morpho-base",
    subject: wallet,
    market: `${market.slice(0, 10)}…`,
    canonicalPath: `/base/morpho/${wallet}/${market}`,
    // This route carries its own opengraph-image.tsx, rendering this
    // position's live card — the static per-explorer PNG stays only its
    // fallback.
    image: "dynamic",
  });
}

export default async function MorphoBasePositionPage({ params }: Props) {
  const { wallet: rawWallet, market: rawMarket } = await params;
  if (!ADDRESS.test(rawWallet)) notFound();
  const market = rawMarket?.toLowerCase();
  // A market is named by its 32-byte id — the keccak of its parameters. A market
  // the singleton has not created is a legitimate empty answer for this page to
  // render; a segment that is not an id names nothing. The client half used to
  // say so under a 200.
  if (!isMorphoBaseMarketSegment(market)) notFound();
  const wallet = rawWallet.toLowerCase();

  // Both reads are the wallet's, because there is no per-market endpoint and
  // this position's history is a slice of the wallet's. The history is seeded
  // only when the index vouched for the whole life; otherwise the client
  // half fetches it and the route sweeps. See the loader.
  const tail = await loadMorphoBaseTail(wallet);

  // Some of these addresses are not accounts at all — they are MetaMorpho
  // vaults; see the wallet page above this one for the full note. Resolved
  // once on the server and threaded into every card this page draws for the
  // same address, so a vault's own position never falls back to bare hex here.
  const vaultOwner = morphoBaseVaultOwnerNote(wallet);

  return (
    <MorphoBasePositionView
      // Keyed on the pair so a client-side navigation to another market or
      // account remounts with that position's server read as its initial state.
      key={`${wallet}:${market}`}
      wallet={wallet}
      market={market}
      initialSlots={tail.head}
      initialTimeline={tail.timeline}
      vaultOwner={vaultOwner}
    />
  );
}
