import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { readPendleWallet } from "@/lib/sources/api/pendle";
import { PendlePositionView } from "@/components/protocol/pendle/pendle-position-view";
import { PendleWalletView } from "@/components/protocol/pendle/pendle-wallet-view";

// One wallet's position in one Pendle market. The wallet's answer carries every
// market it names; the page draws the one in the URL.

interface Props {
  params: Promise<{ wallet: string; market: string }>;
}

export const dynamic = "force-dynamic";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet, market } = await params;
  return positionMetadata({
    session: "pendle",
    subject: wallet,
    canonicalPath: `/ethereum/pendle/${wallet.toLowerCase()}/${market.toLowerCase()}`,
  });
}

export default async function PendlePositionPage({ params }: Props) {
  const { wallet: rawWallet, market: rawMarket } = await params;
  if (!ADDRESS.test(rawWallet) || !ADDRESS.test(rawMarket)) notFound();
  const wallet = rawWallet.toLowerCase();
  const market = rawMarket.toLowerCase();
  const ip = readerIpFromRequest({ headers: await headers() });
  const read = await readPendleWallet(wallet, ip, market);
  if (!read.ok) return <PendleWalletView wallet={wallet} data={null} failure={read} />;
  if (!read.data.positions.some((p) => p.tokens.market.address === market)) notFound();
  return <PendlePositionView key={`${wallet}:${market}`} data={read.data} market={market} />;
}
