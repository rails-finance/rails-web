// One Basedollar stability-pool deposit: /base/basedollar/stability-pool/<branch>/<depositor>
// (rails-ops TO-DO-stability-pool-deposits §3.2), on the shared fork pages
// (lib/liquity-fork/sp-pages.tsx).

import { ForkSpDepositPage, forkSpDepositMetadata, type SpDepositParams } from "@/lib/liquity-fork/sp-pages";

export const dynamic = "force-dynamic";

export const generateMetadata = (p: SpDepositParams) => forkSpDepositMetadata("basedollar", p);

export default function BasedollarDepositPage({ params }: SpDepositParams) {
  return <ForkSpDepositPage fork="basedollar" params={params} />;
}
