import type { Metadata } from "next";
import { headers } from "next/headers";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { CowReadError, parseCowTradesQuery, readCowTokens, readCowTrades } from "@/lib/sources/api/cow";
import { CowWalletView } from "@/components/protocol/cow/cow-wallet-view";

// A wallet's CoW trades, from rails-server's Sieve-backed routes at the
// checkpoint block each answer names. The tokens and the first page of trades
// (with the URL's ?token= filter) are read here; the client pages and narrows.

interface Props {
  params: Promise<{ wallet: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  return positionMetadata({ session: "cow", subject: wallet, canonicalPath: `/ethereum/cow/${wallet}` });
}

export default async function CowWalletPage({ params, searchParams }: Props) {
  const { wallet: raw } = await params;
  if (!ADDRESS.test(raw)) notFound();
  const wallet = raw.toLowerCase();
  const sp = await searchParams;
  const usp = new URLSearchParams();
  for (const k of ["token", "pair"]) {
    const v = sp[k];
    if (typeof v === "string") usp.set(k, v);
  }
  const query = parseCowTradesQuery(usp);
  const ip = readerIpFromRequest({ headers: await headers() });
  const [tokens, trades] = await Promise.allSettled([
    readCowTokens(wallet, ip),
    readCowTrades(wallet, { ...query, limit: 50 }, ip),
  ]);
  const failed = (r: PromiseSettledResult<unknown>) =>
    r.status === "rejected" ? (r.reason instanceof CowReadError ? r.reason.status : 500) : null;
  return (
    <CowWalletView
      key={wallet}
      wallet={wallet}
      tokens={tokens.status === "fulfilled" ? tokens.value : null}
      initial={trades.status === "fulfilled" ? trades.value : null}
      initialQuery={{ tokens: query.tokens, pair: query.pair }}
      readFailed={failed(tokens) ?? failed(trades)}
    />
  );
}
