import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { normalizeAccountNumber } from "@/lib/dolomite/asset-catalog";
import { loadDolomitePositionTail } from "@/lib/dolomite/position-page-data";
import DolomitePositionView from "./position-view";

interface Props {
  params: Promise<{ owner: string; accountNumber: string }>;
}

// The position's numbers are stated as current, so the route renders per request
// and every backend read is `no-store`.
export const dynamic = "force-dynamic";

// The position grain is Account.Info — (owner, accountNumber). An account
// Dolomite has never seen is a legitimate empty answer for this page to render;
// an owner that is not an address, or a number that is not a uint256, names
// nothing the contract could answer to.
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

// Moved down from the layout: the page is the segment that fetches, so it is the
// segment that can describe what it fetched. Output is unchanged — the subject
// is a composite (owner + account number), so the helper's address-truncation
// does not fire and both halves are truncated here: "Dolomite Account
// 0x1a2b…c4d5 #0".
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { owner, accountNumber } = await params;
  const shortOwner = ADDRESS.test(owner) ? `${owner.slice(0, 6)}…${owner.slice(-4)}` : owner;
  const acct = accountNumber.length > 12 ? `${accountNumber.slice(0, 8)}…` : accountNumber;
  // This route carries its own opengraph-image.tsx, rendering this account's
  // live card — the static per-explorer PNG stays only its fallback.
  return positionMetadata({
    session: "dolomite",
    subject: `${shortOwner} #${acct}`,
    canonicalPath: `/ethereum/dolomite/${owner}/${accountNumber}`,
    image: "dynamic",
  });
}

export default async function DolomitePositionPage({ params }: Props) {
  const { owner: rawOwner, accountNumber: rawAccount } = await params;
  if (!ADDRESS.test(rawOwner)) notFound();
  // Canonical decimal form — the URL accepts decimal or 0x-hex; the API speaks
  // decimal strings. NEVER Number(): uint256, hash-derived past 2^53.
  const accountNumber = normalizeAccountNumber(rawAccount);
  if (accountNumber == null) notFound();
  const owner = rawOwner.toLowerCase();

  const tail = await loadDolomitePositionTail(owner, accountNumber);

  return (
    <DolomitePositionView
      // Keyed on the pair so a client-side navigation to another account
      // remounts with that account's server tail as its initial state.
      key={`${owner}:${accountNumber}`}
      owner={owner}
      accountNumber={accountNumber}
      initialPosition={tail.position}
      initialEvents={tail.events}
      initialCutoffBlock={tail.cutoffBlock}
      initialOpening={tail.opening}
    />
  );
}
