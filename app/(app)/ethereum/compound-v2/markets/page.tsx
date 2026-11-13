// Compound V2's markets page (/ethereum/compound-v2/markets), archetype R2 on
// the shared product shell (rails-ops ui-jobs 549/550; decision 0059): one
// Comptroller, so the Markets tab opens the market page directly, one row per
// cToken. The figures are one head-block read of the Comptroller, each
// cToken, the oracle and the rate models; lib/comptroller/ maps them.
//
// Server-rendered: the first paint carries the figures. ISR, ten minutes: a
// protocol aggregate serves every visitor the same render, and the head's read
// stamp states the time of the read behind a cached page.

import { ComptrollerMarketsPage } from "@/lib/comptroller/product";
import { fromCompoundV2 } from "@/lib/comptroller/markets";
import { loadCompoundV2Markets } from "@/lib/sources/chain/compound-v2-markets";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export const revalidate = 600;

export const metadata = {
  title: "Compound V2 markets",
  description: "Every Compound V2 market on Ethereum: its size, rates, collateral factor and what is still open.",
};

export default async function CompoundV2MarketsRoute() {
  const read = fromCompoundV2(await loadCompoundV2Markets());
  return (
    <>
      <ComptrollerMarketsPage read={read} />
      {/* The inspector, armed from the profile menu's switch. */}
      <ProvInspectorLayer />
    </>
  );
}
