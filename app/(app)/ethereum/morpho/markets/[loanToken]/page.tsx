// Morpho Blue — one loan token's markets (/ethereum/morpho/markets/<loan
// token>). The overview above it has one row per token; this is what the row
// opens: that token's markets shaped by lib/morpho/markets-shape — the ones
// carrying the book as rows, a same-collateral same-lltv family as one entry,
// the dust and the never-funded behind counted disclosures.
//
// The whole roster is read for it, as the overview reads it: one token's
// markets cannot be read alone any cheaper (the multicall is chunked by
// roster, not by token), and the page needs the roster anyway to say whether
// this token's symbol is unique on it. The two reads are one per request —
// React's cache() dedupes generateMetadata's against the page's.

import { cache } from "react";
import type { Metadata } from "next";
import { RailHeader } from "@/components/shared/rail-header";
import { notFound } from "next/navigation";
import { MorphoLoanTokenView, MorphoMarketsStamp } from "@/components/protocol/morpho/morpho-markets-view";
import { loadMorphoMarketsFromChain } from "@/lib/sources/chain/morpho-markets";
import { loanTokenViewData, stampOf } from "@/lib/morpho/markets-shape";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-f]{40}$/;
const load = cache(() => loadMorphoMarketsFromChain());

type Params = { params: Promise<{ loanToken: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { loanToken } = await params;
  const token = loanToken.toLowerCase();
  if (!ADDRESS.test(token)) return { title: "Morpho Blue Markets" };
  const data = await load();
  const g = data.groups.find((x) => x.loanToken.toLowerCase() === token);
  const name = g?.loanNamed ? g.loanSymbol : `${token.slice(0, 6)}…${token.slice(-4)}`;
  return {
    title: `${name} Markets · Morpho Blue`,
    description: `Every Morpho Blue market that lends ${name} — what it is lent against, how much, how used, and the one loan-to-value that governs each.`,
    alternates: { canonical: `/ethereum/morpho/markets/${token}` },
  };
}

export default async function MorphoLoanTokenPage({ params }: Params) {
  const { loanToken } = await params;
  const token = loanToken.toLowerCase();
  if (!ADDRESS.test(token)) notFound();
  const data = await load();
  const g = data.groups.find((x) => x.loanToken.toLowerCase() === token);
  if (!data.chainStale && !g) notFound();

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5">
          <div className="mb-2.5">
            <RailHeader session="morpho" venue="subPage" />
          </div>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-rb-500">{g?.loanSymbol ?? "…"}</div>
          <h1 className="text-2xl font-semibold text-foreground">
            {g ? (
              <>
                <a
                  href={explorerUrl(MAINNET_CHAIN_ID, "address", g.loanToken)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={g.loanNamed ? "" : "font-mono"}
                >
                  {g.loanSymbol}
                </a>{" "}
                markets
              </>
            ) : (
              "Morpho Blue markets"
            )}
          </h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500">
            Every market here lends {g?.loanSymbol ?? "this token"} and measures in it — every figure on this page is a
            quantity of {g?.loanSymbol ?? "it"}, never dollars. A market&rsquo;s loan-to-value is its whole risk
            surface: the borrow limit and the liquidation line at once, fixed when the market was created. Sizes are the
            balance each market last settled, left as the contract stores them; the rates are live.
          </p>
          <MorphoMarketsStamp data={stampOf(data)} />
        </header>

        {g ? (
          <MorphoLoanTokenView block={data.blockNumber} group={loanTokenViewData(data, g)} />
        ) : (
          <p className="text-sm text-rb-500">The market roster could not be read from chain at this block.</p>
        )}
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
