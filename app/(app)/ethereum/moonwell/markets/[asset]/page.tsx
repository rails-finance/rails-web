// One Moonwell market on Ethereum (/ethereum/moonwell/markets/<asset>, the
// underlying's lowercased address), archetype R3 on the shared product shell
// (rails-ops ui-jobs 549 step 3). ISR, ten minutes, as the markets page.

import { notFound } from "next/navigation";
import { ComptrollerMarketPage } from "@/lib/comptroller/product";
import { fromMoonwell } from "@/lib/comptroller/markets";
import { loadMoonwellMarkets } from "@/lib/sources/chain/moonwell-market-state";

export const revalidate = 600;
export const metadata = { title: "Moonwell market", robots: { index: false, follow: false } };

export default async function MoonwellMarketRoute({ params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(asset)) notFound();
  return <ComptrollerMarketPage read={fromMoonwell(await loadMoonwellMarkets(), "moonwell")} asset={asset} />;
}
