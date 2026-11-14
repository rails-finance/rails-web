// LlamaLend's markets (/ethereum/llamalend/markets), archetype A1 on the shared
// product shell (rails-ops ui-jobs 549 step 7; decision 0059): one head for the
// protocol, then every market the three factories list in one house table
// grouped by era, each row opening the market's page
// (/ethereum/llamalend/markets/<controller>). The figures are one head-block
// read of the factories' and markets' contracts; lib/llamalend/product.tsx maps
// them into the model.
//
// ISR, ten minutes: a protocol aggregate serves every visitor the same render,
// and the head's read stamp states the time of the read behind it.

import { LlamalendRosterPage } from "@/lib/llamalend/product";
import { llamalendEventFallbackContent } from "@/lib/shared/learn-more-content";
import { loadLlamalendMarkets } from "@/lib/sources/chain/llamalend-markets";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export const revalidate = 600;

export const metadata = {
  title: "LlamaLend markets",
  description:
    "Every LlamaLend market across Curve's factories: debt, rates, utilisation, the band width A and the discounts, each opening its own page.",
};

export default async function LlamalendMarketsPage() {
  const data = await loadLlamalendMarkets();
  return (
    <>
      <LlamalendRosterPage data={data} learnMore={llamalendEventFallbackContent()} />
      {/* The inspector, armed from the profile menu's switch. */}
      <ProvInspectorLayer />
    </>
  );
}
