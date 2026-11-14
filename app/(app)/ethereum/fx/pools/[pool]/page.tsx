// One f(x) pool (/ethereum/fx/pools/<pool>, the pool's key: wsteth, wbtc),
// archetype A2 on the shared product shell (rails-ops ui-jobs 549/550;
// decision 0059): the pool's head as on the roster, then f(x)'s sections, each
// with its own ⋮: prices, the tick ladder, the reconciliation, funding and
// fees, capacity, the ticks. A position's card links here with ?tick=<tick>.
//
// ISR, ten minutes, as the roster.

import { notFound } from "next/navigation";
import { FxPoolPage } from "@/lib/fx/product";
import { fxPoolData } from "@/lib/fx/product-data";
import { FX_POOL_KEYS, FX_POOLS, isFxPoolKey } from "@/lib/fx/asset-catalog";
import { loadFxSystemFromChain } from "@/lib/sources/chain/fx-system";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export const revalidate = 600;
export const dynamicParams = false;

export function generateStaticParams() {
  return FX_POOL_KEYS.map((pool) => ({ pool }));
}

export async function generateMetadata({ params }: { params: Promise<{ pool: string }> }) {
  const { pool } = await params;
  if (!isFxPoolKey(pool)) return {};
  const sym = FX_POOLS[pool].tokenSymbol;
  return {
    title: `f(x) ${sym} pool`,
    description: `f(x) V2's ${sym} pool on Ethereum: its prices, every tick holding debt, the reconciliation of its debt, funding, fees and caps.`,
  };
}

export default async function FxPoolRoute({ params }: { params: Promise<{ pool: string }> }) {
  const { pool } = await params;
  if (!isFxPoolKey(pool)) notFound();
  const data = await loadFxSystemFromChain();
  return (
    <>
      <FxPoolPage data={fxPoolData(data, pool)} pool={pool} />
      <ProvInspectorLayer />
    </>
  );
}
