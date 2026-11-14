// Moonwell's markets page on Ethereum (/ethereum/moonwell/markets), archetype
// R2 on the shared product shell (rails-ops ui-jobs 549/550; decision 0059):
// one Comptroller, so the Markets tab opens the market page directly, one row
// per mToken. The figures are one head-block read of the Comptroller, each
// mToken, the oracle and the rate models; lib/comptroller/ maps them.
//
// Server-rendered, ISR ten minutes; the head's read stamp states the time of
// the read behind a cached page.

import { ComptrollerMarketsPage } from "@/lib/comptroller/product";
import { fromMoonwell } from "@/lib/comptroller/markets";
import { loadMoonwellMarkets } from "@/lib/sources/chain/moonwell-market-state";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export const revalidate = 600;

export const metadata = {
  title: "Moonwell markets",
  description: "Every market on Moonwell's Ethereum deployment: its size, rates, collateral factor and caps.",
};

export default async function MoonwellMarketsRoute() {
  const read = fromMoonwell(await loadMoonwellMarkets(), "moonwell");
  return (
    <>
      <ComptrollerMarketsPage read={read} />
      {/* The inspector, armed from the profile menu's switch. */}
      <ProvInspectorLayer />
    </>
  );
}
