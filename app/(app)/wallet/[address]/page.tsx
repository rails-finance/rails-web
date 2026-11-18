// One wallet's positions across the protocols and chains Rails reads —
// /wallet/<address> (rails-ops decisions/0050-one-wallet-across-protocols-and-chains.md,
// step 3: one read, the read behind /api/chain/wallet/<address>,
// lib/wallet/read-wallet.ts). It spans chains, so it sits under no chain and
// no explorer rail.
// `[address]` is a 0x address or an ENS name; a name, or an address in mixed
// case, redirects to the lower-cased address. `?from=<path>` is the explorer
// page the reader came from (the wallet menu adds it): the empty state links
// back to that explorer's listing.
// `?protocol=<slug>` reads that protocol alone (ui-jobs 738); Liquity V2's is
// its Trove listing with the wallet in place of the search. `?kind=` is the
// Kind pill's selection,
// `?status=` the Status pill's.

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { WalletView } from "@/components/wallet/wallet-view";
import { readWallet, readWalletCounts, walletFamiliesLine } from "@/lib/wallet/read-wallet";
import { WalletProtocolListing } from "@/components/wallet/wallet-protocol-listing";
import {
  LISTED_ON_WALLET,
  parseKinds,
  parseStatus,
  walletProtocol,
  WALLET_PROTOCOLS,
} from "@/lib/wallet/wallet-filters";
import {
  walletLiquityV2Dimensions,
  walletLiquityV2FetchParams,
  WALLET_LIQUITY_V2_DEFAULTS,
} from "@/lib/wallet/liquity-v2-on-wallet";
import { fetchTroves } from "@/lib/api/fetch-troves";
import { ssrDecode, ssrInitial, toURLSearchParams, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { explorerName, protocolForPathname } from "@/lib/shared/protocols";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { resolveEnsAddress, resolveEnsNames } from "@/lib/ens/resolve-ens";
import { readCowWalletEntry } from "@/lib/sources/api/cow";

export const dynamic = "force-dynamic";
// The read's budget (8 s) sits under it.
export const maxDuration = 30;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ENS = /^[^\s]+\.eth$/i;

interface Props {
  params: Promise<{ address: string }>;
  searchParams: Promise<RawSearchParams>;
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
  const query = await searchParams;
  const sp = toURLSearchParams(query);
  const fromParam = sp.get("from");
  const from = fromParam?.startsWith("/") ? fromParam : undefined;
  // A redirect keeps the query as it came.
  const keep = sp.size ? `?${sp.toString()}` : "";
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

  const ip = await readerIpFromHeaders();
  const protocol = walletProtocol(sp.get("protocol"))?.slug;

  if (protocol && LISTED_ON_WALLET.has(protocol)) {
    // The protocol's listing for this wallet: its first page read here, as
    // the listing's page reads it, and the summary rows' counts for the
    // Protocol pill (no head read).
    const dims = walletLiquityV2Dimensions(address);
    const { filters, page } = ssrDecode(dims, sp, WALLET_LIQUITY_V2_DEFAULTS);
    let passedOn = 0;
    const [initial, counts, names] = await Promise.all([
      ssrInitial({
        dims,
        defaults: WALLET_LIQUITY_V2_DEFAULTS,
        filters,
        page,
        label: "Wallet Liquity V2",
        fetchPage: (baseUrl, signal, headers) =>
          fetchTroves({ ...walletLiquityV2FetchParams(address, filters, page), baseUrl, signal, headers }).then((r) => {
            passedOn = r.pagination.passedOn;
            return { data: r.data, total: r.pagination.total };
          }),
      }),
      readWalletCounts(address, ip),
      resolveEnsNames([address]).catch(() => ({}) as Record<string, string | null>),
    ]);
    const held = WALLET_PROTOCOLS.map((p) => ({
      slug: p.slug,
      name: p.name,
      positions: counts.families.filter((f) => f.family === p.slug).reduce((s, f) => s + f.positions, 0),
    })).filter((p) => p.positions > 0);
    return (
      <WalletProtocolListing
        address={address}
        ensName={names[address] ?? null}
        held={held}
        {...initial}
        initialPassedOn={passedOn}
        initialSearch={sp.toString()}
      />
    );
  }

  // The CoW row (W7) streams in after the page: started here, awaited by the
  // view under its own Suspense, never by the page; not read where one
  // protocol is chosen.
  const cow = protocol ? null : readCowWalletEntry(address, ip);
  const [read, names] = await Promise.all([
    readWallet(address, ip, { protocol }),
    resolveEnsNames([address]).catch(() => ({}) as Record<string, string | null>),
  ]);
  return (
    <WalletView
      address={address}
      ensName={names[address] ?? null}
      read={read}
      cow={cow}
      reads={walletFamiliesLine()}
      back={back}
      kinds={parseKinds(sp.get("kind") ?? undefined)}
      status={parseStatus(sp.get("status") ?? undefined)}
    />
  );
}
