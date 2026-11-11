// A reserve page under Aave V3 on Optimism (anatomy M3): /optimism/aave-v3/markets/<asset>, the asset
// its underlying's lowercased address. The client half is lib/aave-family/reserve.tsx; the indexed
// sections say Optimism is not indexed yet.

import { notFound } from "next/navigation";
import { AaveReservePage } from "@/lib/aave-family/reserve";

type Params = Promise<{ asset: string }>;

export const metadata = { title: "Aave V3 on Optimism reserve", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Params }) {
  const { asset } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(asset)) notFound();
  return <AaveReservePage marketKey="aave-v3-optimism" asset={asset} />;
}
