"use client";

// Liquity V2 Stability Pool deposits — client half: the shared deposit listing
// (components/protocol/liquity/sp-deposit-listing.tsx) with Liquity V2's
// deposit card.

import { SpDepositListing, type SpDepositListingProps } from "@/components/protocol/liquity/sp-deposit-listing";
import { liquityV2DepositListingCard } from "@/lib/liquity-v2/listing-cards";
import { LIQUITY_V2_SP } from "@/lib/liquity-v2/sp-deployment";
import type { LiquityV2DepositRow } from "@/lib/sources/api/liquity-v2-sp";

export function SpListing(props: SpDepositListingProps) {
  return (
    <SpDepositListing
      dep={LIQUITY_V2_SP}
      title="Liquity V2 Stability Pool deposits"
      renderCard={(r) => liquityV2DepositListingCard(r as LiquityV2DepositRow)}
      {...props}
    />
  );
}
