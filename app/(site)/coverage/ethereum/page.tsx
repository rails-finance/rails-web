// The Ethereum coverage page — one of the two per-chain routes behind the
// shared CoveragePage (its toggle links to the other). Thin on purpose:
// content and metadata both come from components/coverage/coverage-page.tsx
// so the two routes cannot drift apart.

import { CoveragePage, coverageMetadata } from "@/components/coverage/coverage-page";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// focus: Rails' coverage matrix, a page about Rails itself: what each explorer can show, not a list to act on.

export const metadata = coverageMetadata(MAINNET_CHAIN_ID);

export default function EthereumCoveragePage() {
  return <CoveragePage chainId={MAINNET_CHAIN_ID} />;
}
