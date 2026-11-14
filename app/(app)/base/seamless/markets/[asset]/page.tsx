// A reserve page under Seamless (anatomy M3, ui-jobs 541): /base/seamless/markets/<asset>,
// the asset its underlying's lowercased address. The client half is
// lib/aave-family/reserve.tsx.

import { notFound } from "next/navigation";
import { AaveReservePage } from "@/lib/aave-family/reserve";

type Params = Promise<{ asset: string }>;

export const metadata = { title: "Seamless reserve", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Params }) {
  const { asset } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(asset)) notFound();
  return <AaveReservePage marketKey="seamless" asset={asset} />;
}
