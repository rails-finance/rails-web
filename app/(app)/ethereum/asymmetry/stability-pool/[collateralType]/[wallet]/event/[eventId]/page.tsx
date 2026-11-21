// One operation of a Asymmetry stability-pool deposit, on the shared event page
// (rails-ops reference/app-anatomy.md, P4): the deposit page's body, whose view
// reads `eventId` from the route.

import { ForkSpDepositPage, forkSpDepositMetadata, type SpDepositParams } from "@/lib/liquity-fork/sp-pages";

// Restated: the parent route renders per request over a `no-store` read.
export const dynamic = "force-dynamic";

export const generateMetadata = (p: SpDepositParams) => forkSpDepositMetadata("asymmetry", p);

export default function AsymmetryDepositEventPage({ params }: SpDepositParams) {
  return <ForkSpDepositPage fork="asymmetry" params={params} />;
}
