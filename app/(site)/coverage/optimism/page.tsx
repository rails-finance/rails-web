// The Optimism coverage page — one of the per-chain routes behind the shared
// CoveragePage. Thin on purpose: content and metadata both come from
// components/coverage/coverage-page.tsx so the routes cannot drift apart.
// Until the chain has a launched explorer (isLaunchedChain), the page carries
// the work-in-progress strip and is noindex.

import { CoveragePage, coverageMetadata } from "@/components/coverage/coverage-page";
import { OPTIMISM_CHAIN_ID } from "@/lib/shared/chains";

// focus: Rails' coverage matrix, a page about Rails itself: what each explorer can show, not a list to act on.

export const metadata = coverageMetadata(OPTIMISM_CHAIN_ID);

export default function OptimismCoveragePage() {
  return <CoveragePage chainId={OPTIMISM_CHAIN_ID} />;
}
