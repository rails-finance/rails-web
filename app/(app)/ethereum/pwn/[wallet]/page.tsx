import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { loadPwnPositionTail } from "@/lib/pwn/position-page-data";
import PwnLoanView from "./position-view";

interface Props {
  params: Promise<{ wallet: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// The loan's numbers are stated as current, so the route renders per request and
// every backend read is `no-store`.
export const dynamic = "force-dynamic";

// A wallet is not a loan id: an address PWN has never seen is a legitimate empty
// answer for this page to render, not a 404. Only a string that cannot be an
// address is — nothing on chain answers to it.
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

// Moved down from the layout: the page is the segment that fetches, so it is the
// segment that can describe what it fetched.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  return positionMetadata({
    session: "pwn",
    subject: wallet,
    canonicalPath: `/ethereum/pwn/${wallet}`,
    // This route carries its own opengraph-image.tsx, rendering this
    // wallet's live card — the static per-explorer PNG stays only its
    // fallback.
    image: "dynamic",
  });
}

export default async function PwnLoanPage({ params, searchParams }: Props) {
  const { wallet: raw } = await params;
  if (!ADDRESS.test(raw)) notFound();
  const wallet = raw.toLowerCase();

  // Which loan the page shows. Decoded here rather than from `useSearchParams`
  // on the client, so the document that renders on the server is about the loan
  // the URL names — a wallet with several loans would otherwise be served its
  // most recent one and swap after hydration.
  const sp = await searchParams;
  const rawLoan = Array.isArray(sp.loan) ? sp.loan[0] : sp.loan;

  const tail = await loadPwnPositionTail(wallet);

  return (
    <PwnLoanView
      // Keyed on the wallet so a client-side navigation to another party
      // remounts with that wallet's server tail as its initial state.
      key={wallet}
      wallet={wallet}
      loanParam={rawLoan ?? null}
      initialSummaries={tail.summaries}
      initialEvents={tail.events}
      initialCutoffBlock={tail.cutoffBlock}
      initialOpening={tail.opening}
    />
  );
}
