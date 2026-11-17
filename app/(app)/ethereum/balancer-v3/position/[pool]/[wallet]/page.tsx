// A wallet's share of one Balancer V3 pool (components/protocol/balancer/balancer-position-page.tsx).
// A pool share has no id of its own: the pool and the wallet name it.

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { BalancerPositionPage, balancerTabName } from "@/components/protocol/balancer/balancer-position-page";

interface Props {
  params: Promise<{ pool: string; wallet: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pool, wallet } = await params;
  // The pool's symbol and the wallet, as the card names the share, off the read
  // the page makes (the same `cache()` entry); the pool alone where it did not answer.
  const named = await balancerTabName(1, pool, wallet);
  return positionMetadata({
    session: "balancer-v3",
    subject: named?.subject ?? pool,
    market: named?.market,
    canonicalPath: `/ethereum/balancer-v3/position/${pool}/${wallet}`,
  });
}

export default async function Page({ params }: Props) {
  const { pool, wallet } = await params;
  return <BalancerPositionPage chainId={1} pool={pool} wallet={wallet} />;
}
