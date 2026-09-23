// Maple protocol view (/maple/pools) — the two permissionless syrup pools'
// own state, read live from their contracts at one head block. This is the
// `views` cell of Maple's row.
//
// It sits ALONGSIDE the lender explorer, the same shape as /fluid/vaults,
// /morpho/markets and /compound-v2/markets: the explorer answers "what
// happened to this lender", this answers "what is the pool". Same contract
// roster (lib/maple/asset-catalog.ts), same reader the lender pages already
// ride (resolveMaplePoolState) — extended with the per-LoanManager split, not
// duplicated. This page reads no index.
//
// The claim it makes is the lender band's claim lifted to pool level: of
// everything each pool says it is worth, only the funds asset sitting in the
// pool contract is reachable this block — the rest is on-chain bookkeeping of
// a loan book whose collateral sits with custodians off-chain, split across a
// fixed-term and an open-term LoanManager, with a FIFO queue between lenders
// and the cash.
//
// Server-rendered: a read-only aggregate with no interactivity to hydrate
// for, so the first paint carries the real figures (the posture every
// chain-lane view here takes).

import { MaplePoolsView, MaplePoolsStamp } from "@/components/protocol/maple/maple-pools-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { resolveMaplePoolState, type MaplePoolState } from "@/lib/sources/chain/maple-pool-state";
import { MAPLE_POOLS } from "@/lib/maple/asset-catalog";
import { protocolForHref } from "@/lib/shared/protocols";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

// ISR, ten minutes. This is a protocol aggregate, not a wallet's page: the
// same render serves every visitor, so re-reading the contracts per request
// bought nothing but RPC. Ten minutes is roughly fifty blocks of interest
// accrual on figures quoted to the nearest percent. The header stamp names the
// block the read happened at, so a cached page states its own age.
export const revalidate = 600;

export const metadata = {
  title: "Maple Pools",
  description:
    "The two permissionless syrup pools — what each claims to be worth, what lenders can actually reach right now, and the loan book behind the rest.",
};

const PROTOCOL = protocolForHref("/ethereum/maple")!;

export default async function MaplePoolsPage() {
  // Straight to the reader rather than through this deployment's own
  // /api/chain/maple/pools route — same code, one less hop on the server.
  const state = await resolveMaplePoolState();
  const pools = MAPLE_POOLS.flatMap((p): MaplePoolState[] => {
    const s = state.get(p.key);
    return s ? [s] : [];
  });

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={PROTOCOL}
          title="Pools & what lenders can actually reach"
          stamp={<MaplePoolsStamp pools={pools} />}
        />

        <div data-skel-section="page-table">
          <MaplePoolsView pools={pools} />
        </div>
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
