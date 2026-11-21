"use client";

// Liquity V2 Stability Pool deposits — client half: the shared deposit listing
// (components/protocol/liquity/sp-deposit-listing.tsx) with Liquity V2's Troves
// as the other kind and its holder strip.

import { useMemo } from "react";
import { HolderStrip } from "@/components/shared/holder-strip";
import type { HolderKindPage } from "@/components/shared/holder-kinds";
import { SpDepositListing, type SpDepositListingProps } from "@/components/protocol/liquity/sp-deposit-listing";
import { useLiquityV2Prices } from "@/hooks/useLiquityV2Prices";
import { liquityV2HolderStrip } from "@/lib/liquity-v2/holder-strip";
import { LIQUITY_V2_ITEMS_PER_PAGE } from "@/lib/liquity-v2/list-filter-dimensions";
import { liquityV2DepositListingCard, liquityV2TroveKind } from "@/lib/liquity-v2/holder-kinds";
import { LIQUITY_V2_SP } from "@/lib/liquity-v2/sp-deployment";
import type { TroveSummary } from "@/types/api/trove";
import type { LiquityV2DepositRow } from "@/lib/sources/api/liquity-v2-sp";

export function SpListing(props: SpDepositListingProps) {
  // The wallet's Troves, under the rows and counted in the strip (rails-ops
  // TO-DO-stability-pool-deposits §1b). Their cards and totals carry USD at
  // the branch prices.
  const prices = useLiquityV2Prices();
  const otherKinds = useMemo(() => [liquityV2TroveKind(prices)], [prices]);
  return (
    <SpDepositListing
      dep={LIQUITY_V2_SP}
      title="Liquity V2 Stability Pool deposits"
      renderCard={(r) => liquityV2DepositListingCard(r as LiquityV2DepositRow)}
      otherKinds={otherKinds}
      // The strip waits for the Troves and the prices.
      strip={(items, total, f, reads) => {
        const troves = reads.trove;
        if (!prices || !troves || troves === "failed") return null;
        const t = troves as HolderKindPage<TroveSummary>;
        return (
          <HolderStrip
            {...liquityV2HolderStrip(t.rows, t.total, prices, LIQUITY_V2_ITEMS_PER_PAGE, t.passedOn ?? 0, f.q.trim(), {
              rows: items as LiquityV2DepositRow[],
              total,
            })}
          />
        );
      }}
      {...props}
    />
  );
}
