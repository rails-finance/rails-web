// One Aave V4 spoke reserve on Arc (anatomy M3):
// /arc/aave-v4/markets/<spoke>/<asset>, the asset its underlying's lowercased
// address. The client half is lib/aave-v4/reserve.tsx.

import { notFound } from "next/navigation";
import { AaveV4ReservePage } from "@/lib/aave-v4/reserve";

type Params = Promise<{ spoke: string; asset: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
export const metadata = { title: "Aave V4 reserve on Arc", robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { spoke, asset } = await params;
  if (!/^[a-z0-9-]+$/.test(spoke) || !/^0x[0-9a-fA-F]{40}$/.test(asset)) notFound();
  const hub = (await searchParams).hub;
  return <AaveV4ReservePage chain="arc" slug={spoke} asset={asset} hub={Array.isArray(hub) ? hub[0] : hub} />;
}
