// A reserve page under SparkLend (anatomy M3, ui-jobs 541): /ethereum/spark/market/<asset>,
// the asset its underlying's lowercased address. The client half is
// components/shared/aave-reserve-page.tsx.

import { notFound } from "next/navigation";
import { AaveReservePage } from "@/components/shared/aave-reserve-page";

type Params = Promise<{ asset: string }>;

export const metadata = { title: "SparkLend reserve", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Params }) {
  const { asset } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(asset)) notFound();
  return <AaveReservePage marketKey="spark" asset={asset} />;
}
