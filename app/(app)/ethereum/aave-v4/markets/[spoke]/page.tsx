// One Aave V4 spoke on Ethereum (/ethereum/aave-v4/markets/<spoke>): its head and
// its reserves (anatomy M1). The client half is lib/aave-v4/product.tsx.

import { notFound } from "next/navigation";
import { AaveV4SpokeView } from "./spoke-view";

type Params = Promise<{ spoke: string }>;
export const metadata = { title: "Aave V4 spoke on Ethereum", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Params }) {
  const { spoke } = await params;
  if (!/^[a-z0-9-]+$/.test(spoke)) notFound();
  return <AaveV4SpokeView chain="ethereum" slug={spoke} />;
}
