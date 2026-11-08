import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { readPendleWallet } from "@/lib/sources/api/pendle";
import { PendleWalletView } from "@/components/protocol/pendle/pendle-wallet-view";

// A wallet's Pendle positions, one per market its router events name, read
// from rails-server at the block the answer names.

interface Props {
  params: Promise<{ wallet: string }>;
}

export const dynamic = "force-dynamic";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  return positionMetadata({
    session: "pendle",
    subject: wallet,
    canonicalPath: `/ethereum/pendle/${wallet.toLowerCase()}`,
  });
}

export default async function PendleWalletPage({ params }: Props) {
  const { wallet: raw } = await params;
  if (!ADDRESS.test(raw)) notFound();
  const wallet = raw.toLowerCase();
  const ip = readerIpFromRequest({ headers: await headers() });
  const read = await readPendleWallet(wallet, ip);
  return (
    <PendleWalletView key={wallet} wallet={wallet} data={read.ok ? read.data : null} failure={read.ok ? null : read} />
  );
}
