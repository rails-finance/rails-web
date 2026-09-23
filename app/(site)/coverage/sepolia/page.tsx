// The Sepolia coverage page — the third per-chain route behind the shared
// CoveragePage (its toggle links to the others). Thin on purpose: content and
// metadata both come from components/coverage/coverage-page.tsx so the routes
// cannot drift apart.

import { CoveragePage, coverageMetadata } from "@/components/coverage/coverage-page";
import { SEPOLIA_CHAIN_ID } from "@/lib/shared/chains";

export const metadata = coverageMetadata(SEPOLIA_CHAIN_ID);

export default function SepoliaCoveragePage() {
  return <CoveragePage chainId={SEPOLIA_CHAIN_ID} />;
}
