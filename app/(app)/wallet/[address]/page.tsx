// One wallet's positions across the protocols and chains Rails reads —
// /wallet/<address> (rails-ops decisions/0050-one-wallet-across-protocols-and-chains.md,
// step 3: one read, the read behind /api/chain/wallet/<address>,
// lib/wallet/read-wallet.ts). It spans chains, so it sits under no chain and
// no explorer rail.
// `[address]` is a 0x address or an ENS name; a name, or an address in mixed
// case, redirects to the lower-cased address, and a name that resolves to no
// address draws a page saying so. `?from=<path>` is the explorer
// page the reader came from (the wallet menu adds it): the empty state links
// back to that explorer's listing.
// `?protocol=<slug>` reads that protocol alone (ui-jobs 738), and is where a
// wallet search on the Liquity V2 and fork listings lands. `?kind=` is the
// Kind pill's selection, `?status=` the Status pill's.

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { WalletUnresolved, WalletView } from "@/components/wallet/wallet-view";
import { readWallet, walletFamiliesLine } from "@/lib/wallet/read-wallet";
import {
  isWalletEnsName,
  parseKinds,
  parseStatus,
  WALLET_ADDRESS as ADDRESS,
  walletProtocol,
  walletProtocolHref,
} from "@/lib/wallet/wallet-filters";
import { toURLSearchParams, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { explorerName, protocolForPathname } from "@/lib/shared/protocols";
import { holderListingMetadata } from "@/lib/shared/page-metadata";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { resolveEnsAddress, resolveEnsNames } from "@/lib/ens/resolve-ens";
import { readCowWalletEntry } from "@/lib/sources/api/cow";
import { readWalletLiquidity } from "@/lib/wallet/liquidity/read-liquidity";

export const dynamic = "force-dynamic";
// The read's budget (8 s) sits under it.
export const maxDuration = 30;

interface Props {
  params: Promise<{ address: string }>;
  searchParams: Promise<RawSearchParams>;
}

// Preview-only until the charter amendment is ruled (decision 0050, open point 1).
const NO_INDEX = { index: false, follow: false };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { address } = await params;
  const subject = decodeURIComponent(address);
  // Liquity V2 chosen: the holder's card its listing search unfurled as before
  // the search moved here (/api/share/liquity-v2-wallet).
  if (
    ADDRESS.test(subject) &&
    walletProtocol(toURLSearchParams(await searchParams).get("protocol"))?.slug === "liquity-v2"
  ) {
    const q = encodeURIComponent(subject.toLowerCase());
    return {
      ...holderListingMetadata({
        session: "liquity-v2",
        subject,
        canonicalPath: walletProtocolHref(subject, "liquity-v2"),
        imagePath: `/api/share/liquity-v2-wallet?q=${q}`,
      }),
      robots: NO_INDEX,
    };
  }
  return {
    title: `Wallet ${ADDRESS.test(subject) ? `${subject.slice(0, 6)}…${subject.slice(-4)}` : subject}`,
    robots: NO_INDEX,
  };
}

export default async function WalletPage({ params, searchParams }: Props) {
  const { address: raw } = await params;
  const query = await searchParams;
  const sp = toURLSearchParams(query);
  const fromParam = sp.get("from");
  const from = fromParam?.startsWith("/") ? fromParam : undefined;
  // A redirect keeps the query as it came.
  const keep = sp.size ? `?${sp.toString()}` : "";
  const typed = decodeURIComponent(raw).trim();
  // Only an explorer's own listing is linked back to.
  const entry = protocolForPathname(from?.split("?")[0] ?? null);
  const back = entry ? { href: entry.href, name: explorerName(entry) } : null;
  if (isWalletEnsName(typed)) {
    const resolved = await resolveEnsAddress(typed.toLowerCase());
    if (!resolved || !ADDRESS.test(resolved)) return <WalletUnresolved name={typed.toLowerCase()} back={back} />;
    redirect(`/wallet/${resolved.toLowerCase()}${keep}`);
  }
  if (!ADDRESS.test(typed)) notFound();
  const address = typed.toLowerCase();
  if (address !== typed) redirect(`/wallet/${address}${keep}`);

  const ip = await readerIpFromHeaders();
  const protocol = walletProtocol(sp.get("protocol"))?.slug;

  // The CoW row (W7) streams in after the page: started here, awaited by the
  // view under its own Suspense, never by the page; not read where one
  // protocol is chosen.
  const cow = protocol ? null : readCowWalletEntry(address, ip);
  const wallet = readWallet(address, ip, { protocol });
  // The Liquidity section (W9) streams in like the CoW row: its owner routes start once the
  // main read has settled, so the two never open their connections to the api together.
  const liquidity = protocol
    ? null
    : wallet.then(
        () => readWalletLiquidity(address, ip),
        () => readWalletLiquidity(address, ip),
      );
  const [read, names] = await Promise.all([
    wallet,
    resolveEnsNames([address]).catch(() => ({}) as Record<string, string | null>),
  ]);
  return (
    <WalletView
      address={address}
      ensName={names[address] ?? null}
      read={read}
      cow={cow}
      liquidity={liquidity}
      reads={walletFamiliesLine()}
      back={back}
      kinds={parseKinds(sp.get("kind") ?? undefined)}
      status={parseStatus(sp.get("status") ?? undefined)}
    />
  );
}
