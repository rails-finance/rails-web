// The Base coverage page — one of the two per-chain routes behind the shared
// CoveragePage (its toggle links to the other). Thin on purpose: content and
// metadata both come from components/coverage/coverage-page.tsx so the two
// routes cannot drift apart.

import { CoveragePage, coverageMetadata } from "@/components/coverage/coverage-page";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";

export const metadata = coverageMetadata(BASE_CHAIN_ID);

export default function BaseCoveragePage() {
  return <CoveragePage chainId={BASE_CHAIN_ID} />;
}
