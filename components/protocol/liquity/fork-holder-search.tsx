"use client";

// A Liquity V2 fork's Trove listing as the wallet's view (rails-ops
// TO-DO-stability-pool-deposits §1b, §3.3): a `?q=<wallet>` search draws the
// fork's holder strip above the Troves and the wallet's Stability Pool
// deposits under them. The Troves listing searches in memory, so the rows it
// hands the strip are the wallet's whole set.

import { HolderStrip } from "@/components/shared/holder-strip";
import { HolderKinds, useHolderKinds, type HolderKindPage } from "@/components/shared/holder-kinds";
import { parseListingSearch } from "@/lib/shared/listing-search";
import { formerHoldFor } from "@/lib/liquity-fork/former-holders";
import { FORK_HOLDERS, forkCollAddress, forkDepositKind, type ForkTroveRow } from "@/lib/liquity-fork/holder-kinds";
import { liquityForkHolderStrip } from "@/lib/liquity-fork/holder-strip";
import type { LiquityForkDeployment } from "@/lib/liquity-fork/explorer";
import type { LiquityV2DepositRow } from "@/lib/sources/api/liquity-v2-sp";

const KINDS: Record<LiquityForkDeployment, ReturnType<typeof forkDepositKind>[]> = {
  asymmetry: [forkDepositKind("asymmetry")],
  basedollar: [forkDepositKind("basedollar")],
  ebisu: [forkDepositKind("ebisu")],
};

/** The selection pills a fork listing narrows its rows with: any one set and
 *  the rows are a subset of the wallet, so the strip stays away. */
interface ForkFacets {
  q?: string;
  status?: string[];
  branches?: string[];
  debt?: string[];
  coll?: string[];
  tx?: string[];
}

export function useForkHolderView(fork: LiquityForkDeployment, q: string) {
  const kinds = KINDS[fork];
  const dep = FORK_HOLDERS[fork].dep;
  const { wallet, reads } = useHolderKinds(kinds, q);
  const deposits = reads.deposit;

  const renderAbove = ({ items, filters }: { items: ForkTroveRow[]; filters: ForkFacets }) => {
    const search = parseListingSearch(filters.q ?? "", false);
    if (search.kind !== "address" && search.kind !== "ens") return null;
    const narrowed = [filters.status, filters.branches, filters.debt, filters.coll, filters.tx].some(
      (v) => (v?.length ?? 0) > 0,
    );
    // The deposits' read has answered; a failed one leaves them unsaid.
    if (narrowed || deposits === undefined) return null;
    const w = search.kind === "address" ? search.address : "";
    const troves = items.map((t) => ({ ...t, formerHold: formerHoldFor(t, w) }));
    return (
      <HolderStrip
        {...liquityForkHolderStrip(
          troves,
          deposits === "failed" ? undefined : (deposits as HolderKindPage<LiquityV2DepositRow<string>>),
          {
            protocol: dep.id,
            stable: dep.stable.symbol,
            wallet: search.kind === "address" ? search.address : search.name,
            collAddress: forkCollAddress(dep),
          },
        )}
      />
    );
  };
  const renderBelow = () => <HolderKinds kinds={kinds} reads={reads} wallet={wallet} />;
  return { renderAbove, renderBelow };
}
