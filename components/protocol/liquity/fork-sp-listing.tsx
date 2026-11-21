"use client";

// A Liquity V2 fork's Stability Pool deposits — client half: the shared
// deposit listing (sp-deposit-listing.tsx) with the fork's deposit card.

import { useMemo } from "react";
import { SpDepositListing, type SpDepositListingProps } from "./sp-deposit-listing";
import { forkDepositListingCard } from "@/lib/liquity-fork/deposit-card";
import { SP_DEPLOYMENTS } from "@/lib/liquity-v2/sp-deployment";
import type { LiquityForkDeployment } from "@/lib/liquity-fork/explorer";

export function ForkSpListing({ fork, ...props }: SpDepositListingProps & { fork: LiquityForkDeployment }) {
  const dep = SP_DEPLOYMENTS[fork];
  const renderCard = useMemo(() => forkDepositListingCard(dep), [dep]);
  return (
    <SpDepositListing dep={dep} title={`${dep.name} Stability Pool deposits`} renderCard={renderCard} {...props} />
  );
}
