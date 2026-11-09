// A reserve page under Aave V3 on Arbitrum (anatomy M3, ui-jobs 541): /arbitrum/aave-v3/markets/<asset>,
// the asset its underlying's lowercased address. The client half is
// components/shared/aave-reserve-page.tsx.

import { notFound } from "next/navigation";
import { AaveReservePage } from "@/components/shared/aave-reserve-page";

type Params = Promise<{ asset: string }>;

export const metadata = { title: "Aave V3 on Arbitrum reserve", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Params }) {
  const { asset } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(asset)) notFound();
  return <AaveReservePage marketKey="aave-v3-arbitrum" asset={asset} />;
}
