import type { Metadata } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { readPendleWallet } from "@/lib/sources/api/pendle";
import { marketName } from "@/lib/pendle/format";
import { PendlePositionView } from "@/components/protocol/pendle/pendle-position-view";
import { PendleWalletView } from "@/components/protocol/pendle/pendle-wallet-view";

// One wallet's position in one Pendle market. The wallet's answer carries every
// market it names; the page draws the one in the URL.

interface Props {
  params: Promise<{ wallet: string; market: string }>;
}

export const dynamic = "force-dynamic";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

/** One read per request: the metadata and the page share it. */
const loadPendlePosition = cache((wallet: string, ip: string | undefined, market: string) =>
  readPendleWallet(wallet, ip, market),
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet, market } = await params;
  // The market as the card names it, off the read the page makes; none where it
  // did not answer.
  const valid = ADDRESS.test(wallet) && ADDRESS.test(market);
  const ip = readerIpFromRequest({ headers: await headers() });
  const read = valid
    ? await loadPendlePosition(wallet.toLowerCase(), ip, market.toLowerCase()).catch(() => null)
    : null;
  const p = read?.ok ? read.data.positions.find((x) => x.tokens.market.address === market.toLowerCase()) : undefined;
  return positionMetadata({
    session: "pendle",
    subject: wallet.toLowerCase(),
    market: p ? marketName(p.tokens) : undefined,
    canonicalPath: `/ethereum/pendle/${wallet.toLowerCase()}/${market.toLowerCase()}`,
  });
}

export default async function PendlePositionPage({ params }: Props) {
  const { wallet: rawWallet, market: rawMarket } = await params;
  if (!ADDRESS.test(rawWallet) || !ADDRESS.test(rawMarket)) notFound();
  const wallet = rawWallet.toLowerCase();
  const market = rawMarket.toLowerCase();
  const ip = readerIpFromRequest({ headers: await headers() });
  const read = await loadPendlePosition(wallet, ip, market);
  if (!read.ok) return <PendleWalletView wallet={wallet} data={null} failure={read} />;
  if (!read.data.positions.some((p) => p.tokens.market.address === market)) notFound();
  return <PendlePositionView key={`${wallet}:${market}`} data={read.data} market={market} />;
}
