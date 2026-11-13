// Moonwell's markets page on Base (/base/moonwell/markets), archetype R2 on
// the shared product shell (rails-ops ui-jobs 549/550; decision 0059): one
// Comptroller, so the Markets tab opens the market page directly, one row per
// mToken. The roster and the oracle are the Comptroller's, read live;
// lib/comptroller/ maps the read.
//
// Server-rendered, ISR ten minutes; the head's read stamp states the time of
// the read behind a cached page.

import { ComptrollerMarketsPage } from "@/lib/comptroller/product";
import { fromMoonwell } from "@/lib/comptroller/markets";
import { loadMoonwellMarkets } from "@/lib/sources/chain/moonwell-market-state";
import { MOONWELL_BASE_DEPLOYMENT } from "@/lib/moonwell-base/asset-catalog";
import { unlaunchedRobotsForPath } from "@/lib/shared/page-metadata";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export const revalidate = 600;

export const metadata = {
  title: "Moonwell markets on Base",
  description: "Every market on Moonwell's Base deployment: its size, rates, collateral factor and caps.",
  ...unlaunchedRobotsForPath("/base/moonwell/markets"),
};

export default async function MoonwellBaseMarketsRoute() {
  const read = fromMoonwell(await loadMoonwellMarkets(MOONWELL_BASE_DEPLOYMENT), "moonwell-base");
  return (
    <>
      <ComptrollerMarketsPage read={read} />
      {/* The inspector, armed from the profile menu's switch. */}
      <ProvInspectorLayer />
    </>
  );
}
