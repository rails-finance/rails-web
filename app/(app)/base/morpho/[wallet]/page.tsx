import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { loadMorphoBaseTail } from "@/lib/morpho-base/position-page-data";
import { morphoBaseVaultOwnerNote } from "@/lib/morpho-base/vault-owner-note";
import MorphoBaseWalletView from "./position-view";

interface Props {
  params: Promise<{ wallet: string }>;
}

// Every figure here is read at the head — the singleton's own slots for this
// account. Nothing about it is cacheable across requests.
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
    session: "morpho-base",
    subject: wallet,
    canonicalPath: `/base/morpho/${wallet}`,
    // This route carries its own opengraph-image.tsx, rendering this
    // account's live card — the static per-explorer PNG stays only its
    // fallback.
    image: "dynamic",
  });
}

export default async function MorphoBaseWalletPage({ params }: Props) {
  const { wallet: raw } = await params;
  if (!ADDRESS.test(raw)) notFound();
  const wallet = raw.toLowerCase();

  // The slot read, and the history when the index vouched for the whole life;
  // otherwise the client half fetches the history and the route sweeps the
  // singleton's logs. See the loader.
  const tail = await loadMorphoBaseTail(wallet);

  // Some of these addresses are not accounts at all — they are MetaMorpho
  // vaults, and the positions below are a pool's, not a person's. The census
  // (lib/morpho-base/vault-catalog.ts) is read on the SERVER and only a name and
  // an href cross to the client: it is 505 rows, and importing it into the
  // client view would put all of them in the browser bundle. The census is a
  // FLOOR, so silence here is "not in the census", never "not a vault". Every
  // catalogued vault has its own exposure page, so a catalogued address always
  // gets an href. Threaded to every position card below (not just the banner
  // above them), so the pill for this same address never falls back to hex.
  const vaultNote = morphoBaseVaultOwnerNote(wallet);

  return (
    <MorphoBaseWalletView
      // Keyed on the wallet so a client-side navigation to another account
      // remounts with that account's server read as its initial state.
      key={wallet}
      wallet={wallet}
      initialSlots={tail.head}
      initialTimeline={tail.timeline}
      vaultNote={vaultNote}
    />
  );
}
