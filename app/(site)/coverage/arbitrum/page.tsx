// The Arbitrum coverage page — one of the per-chain routes behind the shared
// CoveragePage. Thin on purpose: content and metadata both come from
// components/coverage/coverage-page.tsx so the routes cannot drift apart.

import { CoveragePage, coverageMetadata } from "@/components/coverage/coverage-page";
import { ARBITRUM_CHAIN_ID } from "@/lib/shared/chains";

export const metadata = coverageMetadata(ARBITRUM_CHAIN_ID);

export default function ArbitrumCoveragePage() {
  return <CoveragePage chainId={ARBITRUM_CHAIN_ID} />;
}
