// A reserve page under Aave V3 on Ethereum (anatomy M3, ui-jobs 541): /ethereum/aave-v3/markets/<asset>,
// the asset its underlying's lowercased address. The client half is
// lib/aave-family/reserve.tsx.

import { notFound } from "next/navigation";
import { AaveReservePage } from "@/lib/aave-family/reserve";
import { ethereumAaveV3Market } from "@/lib/shared/aave-market-configs";
type Params = Promise<{ asset: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
const marketKeyOf = (sp: Record<string, string | string[] | undefined>) =>
  ethereumAaveV3Market(Array.isArray(sp.market) ? sp.market[0] : sp.market).key;
export const metadata = { title: "Aave V3 on Ethereum reserve", robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { asset } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(asset)) notFound();
  return <AaveReservePage marketKey={marketKeyOf(await searchParams)} asset={asset} />;
}
