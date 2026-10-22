// One wallet's positions across the protocols and chains Rails reads —
// /wallet/<address> (rails-ops decisions/0050-one-wallet-across-protocols-and-chains.md,
// step 3: one read, the read behind /api/chain/wallet/<address>,
// lib/wallet/read-wallet.ts). It spans chains, so it sits under no chain and
// no explorer rail.
// `[address]` is a 0x address or an ENS name; a name, or an address in mixed
// case, redirects to the lower-cased address. `?from=<path>` is the explorer
// page the reader came from (the wallet menu adds it): the empty state links
// back to that explorer's listing.

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { WalletView } from "@/components/wallet/wallet-view";
import { readWallet, walletFamiliesLine } from "@/lib/wallet/read-wallet";
import { explorerName, protocolForPathname } from "@/lib/shared/protocols";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { resolveEnsAddress, resolveEnsNames } from "@/lib/ens/resolve-ens";

export const dynamic = "force-dynamic";
// The read's budget (8 s) sits under it.
export const maxDuration = 30;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ENS = /^[^\s]+\.eth$/i;

interface Props {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const subject = decodeURIComponent(address);
  return {
    title: `Wallet ${ADDRESS.test(subject) ? `${subject.slice(0, 6)}…${subject.slice(-4)}` : subject}`,
    // Preview-only until the charter amendment is ruled (decision 0050, open point 1).
    robots: { index: false, follow: false },
  };
}

export default async function WalletPage({ params, searchParams }: Props) {
  const { address: raw } = await params;
  const { from: fromParam } = await searchParams;
  const from = typeof fromParam === "string" && fromParam.startsWith("/") ? fromParam : undefined;
  const keep = from ? `?from=${encodeURIComponent(from)}` : "";
  const typed = decodeURIComponent(raw).trim();
  if (ENS.test(typed) && typed.length >= 7) {
    const resolved = await resolveEnsAddress(typed.toLowerCase());
    if (!resolved || !ADDRESS.test(resolved)) notFound();
    redirect(`/wallet/${resolved.toLowerCase()}${keep}`);
  }
  if (!ADDRESS.test(typed)) notFound();
  const address = typed.toLowerCase();
  if (address !== typed) redirect(`/wallet/${address}${keep}`);
  // Only an explorer's own listing is linked back to.
  const entry = protocolForPathname(from?.split("?")[0] ?? null);
  const back = entry ? { href: entry.href, name: explorerName(entry) } : null;

  const [read, names] = await Promise.all([
    readWallet(address, await readerIpFromHeaders()),
    resolveEnsNames([address]).catch(() => ({}) as Record<string, string | null>),
  ]);
  return (
    <WalletView
      address={address}
      ensName={names[address] ?? null}
      read={read}
      reads={walletFamiliesLine()}
      back={back}
    />
  );
}
