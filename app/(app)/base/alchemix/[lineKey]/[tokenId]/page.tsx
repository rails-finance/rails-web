import type { Metadata } from "next";
import { ALCHEMIX_BASE } from "@/lib/alchemix/lines";
import {
  AlchemixPositionPage,
  alchemixPositionMetadata,
  type AlchemixPositionParams,
} from "@/lib/alchemix/position-route";

// One Alchemist position on Base. Both explorers run the same route body
// (lib/alchemix/position-route.tsx); this file is the deployment it is given,
// which is what carries the chain — and the chain is half of the position's
// identity.
//
// `robots: { index: false }` is not written here: the roster entry carries
// `unlaunched: true` and `positionMetadata` reads it.
//
// force-dynamic because the page states current figures and every backend read
// is `no-store`. Serving a position page from a previous request's read would
// be a different decision, and on this protocol a sharper one: the amount set
// aside for repayment grows every block.

interface Props {
  params: Promise<AlchemixPositionParams>;
}

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return alchemixPositionMetadata(ALCHEMIX_BASE, await params);
}

export default async function BaseAlchemixPositionPage({ params }: Props) {
  return <AlchemixPositionPage deployment={ALCHEMIX_BASE} params={await params} />;
}
