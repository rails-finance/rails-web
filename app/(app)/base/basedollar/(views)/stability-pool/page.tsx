// Basedollar Stability Pool deposits (base/basedollar/stability-pool) — server half: the
// shared fork listing (lib/liquity-fork/sp-pages.tsx) for Basedollar.

import { ForkSpListingPage, forkSpListingMetadata } from "@/lib/liquity-fork/sp-pages";
import type { RawSearchParams } from "@/lib/shared/listing-ssr";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const metadata = forkSpListingMetadata("basedollar");

export default function BasedollarSpListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return <ForkSpListingPage fork="basedollar" searchParams={searchParams} />;
}
