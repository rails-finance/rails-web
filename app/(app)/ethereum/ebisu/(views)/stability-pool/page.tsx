// Ebisu Stability Pool deposits (ethereum/ebisu/stability-pool) — server half: the
// shared fork listing (lib/liquity-fork/sp-pages.tsx) for Ebisu.

import { ForkSpListingPage, forkSpListingMetadata } from "@/lib/liquity-fork/sp-pages";
import type { RawSearchParams } from "@/lib/shared/listing-ssr";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const metadata = forkSpListingMetadata("ebisu");

export default function EbisuSpListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return <ForkSpListingPage fork="ebisu" searchParams={searchParams} />;
}
