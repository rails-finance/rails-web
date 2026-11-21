// Asymmetry Stability Pool deposits (ethereum/asymmetry/stability-pool) — server half: the
// shared fork listing (lib/liquity-fork/sp-pages.tsx) for Asymmetry.

import { ForkSpListingPage, forkSpListingMetadata } from "@/lib/liquity-fork/sp-pages";
import type { RawSearchParams } from "@/lib/shared/listing-ssr";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const metadata = forkSpListingMetadata("asymmetry");

export default function AsymmetrySpListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return <ForkSpListingPage fork="asymmetry" searchParams={searchParams} />;
}
