"use client";

// The terminal Explanation's surplus bullet, shared by Liquity V2 and its
// forks: a liquidation's leftover collateral, claimable or claimed.

import { Prov } from "@/components/shared/provenance";
import { formatNum } from "@/lib/shared/format-event";
import { formatDate } from "@/lib/date";
import { collSurplusClaimableProv, collSurplusClaimedProv } from "@/lib/shared/liquity-coll-surplus-provenance";
import type { LiquityTroveSurplus } from "./types";

/** The liquidation's surplus: claimable (the card's lead figure) or claimed. */
export function SurplusBullet({ surplus, symbol }: { surplus: LiquityTroveSurplus; symbol: string }) {
  if (surplus.claimed) {
    return (
      <span className="text-rb-500">
        The liquidation left{" "}
        <Prov info={collSurplusClaimedProv(surplus, symbol)}>
          {formatNum(surplus.surplus, 4)} {symbol}
        </Prov>{" "}
        of surplus collateral, which the owner claimed
        {surplus.claimed.timestamp != null && <> on {formatDate(surplus.claimed.timestamp)}</>}
      </span>
    );
  }
  return (
    <span className="text-rb-500">
      The liquidation left{" "}
      <Prov info={collSurplusClaimableProv(surplus, symbol)}>
        <span className="font-semibold text-foreground">
          {formatNum(surplus.claimable, 4)} {symbol}
        </span>
      </Prov>{" "}
      of surplus collateral in the branch&apos;s CollSurplusPool. The owner&apos;s wallet claims it by calling
      claimCollateral() on BorrowerOperations, which pays out the whole balance
    </span>
  );
}
