"use client";

// A Liquity V2 fork's Stability Pool deposits — client half: the shared
// deposit listing (sp-deposit-listing.tsx) with the fork's Troves as the other
// kind and the fork's holder strip (lib/liquity-fork/holder-strip.ts).

import { useMemo } from "react";
import { HolderStrip } from "@/components/shared/holder-strip";
import { SpDepositListing, type SpDepositListingProps } from "./sp-deposit-listing";
import {
  FORK_HOLDERS,
  forkCollAddress,
  forkDepositListingCard,
  forkTroveKind,
  FORK_TROVE_READ,
  type ForkTrovesPage,
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
      // The strip waits for the wallet's Troves; a failed read leaves it out.
      strip={(items, total, f, reads) => {
        const troves = reads.trove;
        if (!troves || troves === "failed") return null;
        const t = troves as ForkTrovesPage;
        return (
          <HolderStrip
            {...liquityForkHolderStrip(
              t.rows,
              { rows: items, total },
              {
                protocol: dep.id,
                stable: dep.stable.symbol,
                wallet: f.q.trim(),
                collAddress: forkCollAddress(dep),
                ...(t.partial ? { trovesPartial: { read: FORK_TROVE_READ } } : {}),
              },
            )}
          />
        );
      }}
      {...props}
    />
  );
}
