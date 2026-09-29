// One event from a Sky Savings position, pinned: the position page renders it
// alone (ChainTruthTimeline's pinned mode), so a copied event link lands.
import type { Metadata } from "next";
import { decodeEventId, eventMetadata } from "@/lib/shared/page-metadata";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import { skyPositionHref } from "@/lib/sky-savings/constants";
import SkySavingsPositionPage from "../../page";

interface Props {
  params: Promise<{ holder: string; eventId: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { holder, eventId } = await params;
  const h = decodeURIComponent(holder).toLowerCase();
  return eventMetadata({
    session: "sky-savings",
    subject: /^0x[0-9a-f]{40}$/.test(h) ? shortAddress(h) : h,
    canonicalPath: `${skyPositionHref(h)}/event/${encodeURIComponent(decodeEventId(eventId))}`,
    event: null,
    image: "explorer",
  });
}

export default async function SkySavingsEventPage({ params }: Props) {
  const { holder } = await params;
  return SkySavingsPositionPage({ params: Promise.resolve({ holder }) });
}
