"use client";

// A Liquity V2 fork's Stability Pool deposits — client half: the shared
// deposit listing (sp-deposit-listing.tsx) with the fork's Troves as the other
// kind and the fork's holder strip (lib/liquity-fork/holder-strip.ts).

import { useMemo } from "react";
import { HolderStrip } from "@/components/shared/holder-strip";
import type { HolderKindPage } from "@/components/shared/holder-kinds";
import { SpDepositListing, type SpDepositListingProps } from "./sp-deposit-listing";
import {
  FORK_HOLDERS,
  forkCollAddress,
  forkDepositListingCard,
  forkTroveKind,
  type ForkTroveRow,
} from "@/lib/liquity-fork/holder-kinds";
import { liquityForkHolderStrip } from "@/lib/liquity-fork/holder-strip";
import type { LiquityForkDeployment } from "@/lib/liquity-fork/explorer";

export function ForkSpListing({ fork, ...props }: SpDepositListingProps & { fork: LiquityForkDeployment }) {
  const dep = FORK_HOLDERS[fork].dep;
  const otherKinds = useMemo(() => [forkTroveKind(fork)], [fork]);
  const renderCard = useMemo(() => forkDepositListingCard(dep), [dep]);
  return (
    <SpDepositListing
      dep={dep}
      title={`${dep.name} Stability Pool deposits`}
      renderCard={renderCard}
      otherKinds={otherKinds}
      // The strip waits for the wallet's Troves; a failed read leaves it unsaid.
      strip={(items, total, f, reads) => {
        const troves = reads.trove;
        if (!troves || troves === "failed") return null;
        return (
          <HolderStrip
            {...liquityForkHolderStrip(
              (troves as HolderKindPage<ForkTroveRow>).rows,
              { rows: items, total },
              {
                protocol: dep.id,
                stable: dep.stable.symbol,
                wallet: f.q.trim(),
                collAddress: forkCollAddress(dep),
              },
            )}
          />
        );
      }}
      {...props}
    />
  );
}
