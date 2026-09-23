// PWN protocol view (/pwn/book) — the loan book, whole. This is the `views`
// cell of PWN's coverage row.
//
// It sits ALONGSIDE the loan explorer, the same split as /compound-v2/markets
// and /liquity-v1/system: the explorer answers "what happened to this loan",
// this answers "what is the protocol". For PWN the protocol IS its loan book —
// no pools, no rate curve, no oracle, no branches — so the view's subject is
// the book itself: how many loans stand open, secured by what, owing what, on
// what terms, and how the settled ones ended.
//
// Named "book" rather than "loans" because /pwn already lists the loans one by
// one; this page is the aggregate the listing never states.
//
// Source: the LIVE indexed backend — the explorer's own lane (mv_pwn_positions
// over the captured SimpleLoan events), fetched whole and reduced server-side.
// There is nothing to read at a head block: PWN keeps no shared state, and a
// settled loan's truth is its event history.
//
// The static `book` segment sits beside `[wallet]`; Next resolves static
// before dynamic, and no wallet address is the literal string "book".

import { PwnBookView, PwnBookStamp } from "@/components/protocol/pwn/pwn-book-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { loadPwnLoanBook } from "@/lib/pwn/loan-book";
import { protocolForHref } from "@/lib/shared/protocols";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "PWN Loan Book",
  description:
    "PWN's whole loan book — every peer-to-peer fixed-term loan ever struck: what stands open, what secures it, what it owes, and how the settled loans ended.",
};

const PROTOCOL = protocolForHref("/ethereum/pwn")!;

export default async function PwnBookPage() {
  // Straight to the loader rather than through a route handler — same code,
  // one less hop on the server (the other protocol views' posture).
  const book = await loadPwnLoanBook();

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader protocol={PROTOCOL} title="The loan book" stamp={<PwnBookStamp book={book} />} />

        <div data-skel-section="page-table">
          <PwnBookView book={book} />
        </div>
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
