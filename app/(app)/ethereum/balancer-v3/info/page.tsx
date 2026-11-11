// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Balancer V3 on Ethereum (components/protocol/balancer/balancer-info.tsx).
// Unlaunched with the explorer: infoMetadata adds noindex and the root layout's
// strip covers this route.

import { BalancerInfo } from "@/components/protocol/balancer/balancer-info";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("balancer-v3");

export default function InfoPage() {
  return <BalancerInfo chainId={1} />;
}
