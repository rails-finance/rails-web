// One Compound V2 market (/ethereum/compound-v2/markets/<asset>), archetype R3
// on the shared product shell (rails-ops ui-jobs 549 step 3): the head, the
// rate curve, the parameters, then history and holders as missing. <asset> is
// the underlying's lowercased address; for the ETH market and the two WBTC
// markets, which no underlying names alone, it is the cToken's address
// (lib/comptroller/markets.ts).
//
// ISR, ten minutes, as the markets page.

import { notFound } from "next/navigation";
import { ComptrollerMarketPage } from "@/lib/comptroller/product";
import { fromCompoundV2 } from "@/lib/comptroller/markets";
import { loadCompoundV2Markets } from "@/lib/sources/chain/compound-v2-markets";

export const revalidate = 600;
export const metadata = { title: "Compound V2 market", robots: { index: false, follow: false } };

export default async function CompoundV2MarketRoute({ params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(asset)) notFound();
  return <ComptrollerMarketPage read={fromCompoundV2(await loadCompoundV2Markets())} asset={asset} />;
}
