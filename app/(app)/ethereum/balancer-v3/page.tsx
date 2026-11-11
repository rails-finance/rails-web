// Balancer V3 on Ethereum: the front door, a wallet field landing on that
// wallet's pool shares (components/protocol/balancer/balancer-front-door.tsx).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { BalancerFrontDoor } from "@/components/protocol/balancer/balancer-front-door";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { fetchIndexCount } from "@/lib/api/fetch-index";

// focus: the explorer's front door, a wallet look-up and the index's count; FocusChainGate gates the explorer when the focus hides it.

export const metadata = listingMetadata({
  title: "Balancer V3",
  canonicalPath: "/ethereum/balancer-v3",
});

export const dynamic = "force-dynamic";

export default async function Page() {
  const answer = await fetchIndexCount("balancer-v3", 1);
  const count = answer.kind === "ok" ? answer.data : null;
  return (
    <>
      <BalancerFrontDoor
        chainId={1}
        count={count && { through: count.through, positions: count.positions, holders: count.holders }}
      />
      <ProvInspectorLayer />
    </>
  );
}
