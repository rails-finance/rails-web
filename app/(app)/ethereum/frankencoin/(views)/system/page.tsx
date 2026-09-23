// Frankencoin protocol view (/frankencoin/system) — the oracle-free system's
// balance sheet and enforcement record, read live at one head block plus one
// sweep of the same indexed rows the listing pages. Server-rendered: a
// read-only aggregate with no interactivity to hydrate for, so the first
// paint carries real figures.
//
// This is the system sibling of /makerdao/system and /liquity-v1/system. It
// deliberately does NOT mirror a markets roster or a price board: Frankencoin
// has no oracle, no health factor, and no way to sum 26 heterogeneous
// collateral tokens without importing a feed the protocol runs without — so
// the view states what the system's own contracts state (the franc, the
// two-account reserve, the Leadrate) and what its index has recorded (the
// book, the challenge record). See the view component for the claims.
//
// The static `system` segment sits beside the [position] one — Next resolves
// static before dynamic, and no position address is the literal "system".

import {
  FrankencoinSystemView,
  FrankencoinSystemStamp,
} from "@/components/protocol/frankencoin/frankencoin-system-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { loadFrankencoinSystemFromChain } from "@/lib/sources/chain/frankencoin-system";
import { loadFrankencoinBook } from "@/lib/sources/api/frankencoin-system-book";
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
  title: "Frankencoin System",
  description:
    "Frankencoin's system state — the ZCHF supply, the equity and reserve capital behind it, the Leadrate, and the challenge-auction enforcement record.",
};

const PROTOCOL = protocolForHref("/ethereum/frankencoin")!;

export default async function FrankencoinSystemPage() {
  // Read straight from the loaders rather than through this deployment's own
  // API routes — same code, one less hop on the server.
  const [data, book] = await Promise.all([loadFrankencoinSystemFromChain(), loadFrankencoinBook()]);

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader protocol={PROTOCOL} title="System & equity" stamp={<FrankencoinSystemStamp data={data} />} />

        <FrankencoinSystemView data={data} book={book} />
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
