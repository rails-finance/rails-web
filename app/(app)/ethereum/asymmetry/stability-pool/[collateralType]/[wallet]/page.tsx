// One Asymmetry stability-pool deposit: /ethereum/asymmetry/stability-pool/<branch>/<depositor>
// (rails-ops TO-DO-stability-pool-deposits §3.2), on the shared fork pages
// (lib/liquity-fork/sp-pages.tsx).

import { ForkSpDepositPage, forkSpDepositMetadata, type SpDepositParams } from "@/lib/liquity-fork/sp-pages";

export const dynamic = "force-dynamic";

export const generateMetadata = (p: SpDepositParams) => forkSpDepositMetadata("asymmetry", p);

export default function AsymmetryDepositPage({ params }: SpDepositParams) {
  return <ForkSpDepositPage fork="asymmetry" params={params} />;
}
