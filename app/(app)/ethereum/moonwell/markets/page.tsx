// Moonwell protocol view (/moonwell/markets) — every market the Comptroller
// lists and the state of the money in it, read live at one head block. This is
// the `views` cell of Moonwell's row.
//
// It sits ALONGSIDE the position explorer at /moonwell rather than instead of
// it, the same shape as /compound-v2/markets (its direct ancestor — Moonwell's
// Ethereum deployment is a Compound V2 fork), /morpho/markets and
// /fluid/vaults: the explorer answers "what happened to this wallet", this
// answers "what is the protocol". This page reads no index — it is one
// head-block read of the protocol's own contracts.
//
// The claim it makes is Moonwell's own condition, which is its ancestor's in
// reverse: a small book that is actually working. Live since 27 May 2026, four
// markets, a few million dollars supplied with roughly a third of it borrowed,
// and every market far below the supply cap governance opened for it. The
// figures are stated plainly — a seven-week-old protocol is small, and the
// page does not dress that up.
//
// Server-rendered: a read-only aggregate with no interactivity to hydrate for,
// so the first paint carries the real figures (the Compound V2 view's posture).

import { MoonwellMarketsView, MoonwellMarketsStamp } from "@/components/protocol/moonwell/moonwell-markets-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { loadMoonwellMarkets } from "@/lib/sources/chain/moonwell-market-state";
import { protocolForHref } from "@/lib/shared/protocols";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

// ISR, ten minutes. This is a protocol aggregate, not a wallet's page: the
// same render serves every visitor, so re-reading the contracts per request
// bought nothing but RPC. Ten minutes is roughly fifty blocks of interest
// accrual on figures quoted to the nearest percent. The header stamp names the
// block the read happened at, so a cached page states its own age.
export const revalidate = 600;

export const metadata = {
  title: "Moonwell Markets",
  description:
    "Every market on Moonwell's Ethereum deployment — what it holds, how much of it is borrowed, and how far each sits below its cap.",
};

const PROTOCOL = protocolForHref("/ethereum/moonwell")!;

export default async function MoonwellMarketsPage() {
  // Straight to the loader rather than through this deployment's own
  // /api/chain/moonwell/markets route — same code, one less hop on the server.
  const data = await loadMoonwellMarkets();

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={PROTOCOL}
          title="Markets & the money working in them"
          stamp={<MoonwellMarketsStamp data={data} />}
        />

        <div data-skel-section="page-table">
          <MoonwellMarketsView data={data} listingBasePath="/ethereum/moonwell" listingFilterKey="underlyingSymbol" />
        </div>
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
