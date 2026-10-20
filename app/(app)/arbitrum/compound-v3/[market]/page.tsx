// The Compound V3 Arbitrum wallet overview, /arbitrum/compound-v3/<wallet>.
// Next names one dynamic segment per level, so this level's segment is
// `[market]` for the market pages beneath it (`[market]/[wallet]`), and here
// it holds the wallet. A wallet with activity in exactly one Comet is sent to
// that market page; otherwise the holder strip and one card per Comet it
// touched (rails-ops reference/arbitrum-position-first-lane.md).

import type { Metadata } from "next";
import { after } from "next/server";
import { notFound, redirect } from "next/navigation";
import { positionMetadata, shortSubject } from "@/lib/shared/page-metadata";
import { loadCompoundArbitrumTail } from "@/lib/compound-arbitrum/position-page-data";
import { recordCompoundArbitrumVisit } from "@/lib/compound-arbitrum/record-visit";
import { COMPOUND_ARBITRUM_DEPLOYMENT } from "@/lib/compound-arbitrum/asset-catalog";
import { compoundArbitrumMarketHref, compoundArbitrumWalletHref } from "@/lib/compound-arbitrum/routes";
import { compoundArbitrumWholeLife } from "@/lib/compound-arbitrum/whole-life";
import { COMPOUND_ARBITRUM_PAGE } from "@/lib/compound-arbitrum/page-deployment";
import { compoundArbitrumHolderStrip } from "@/lib/compound-arbitrum/holder-strip";
import { cometViewFromChain } from "@/lib/compound/chain-position-view";
import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import type { CometChainTimelineResult } from "@/lib/sources/chain/compound-v3-events";
import { CompoundArbitrumWalletOverview, type OverviewHistory, type OverviewMarket } from "./wallet-overview";

interface Props {
  params: Promise<{ market: string }>;
}

// Every figure is read at one block per request; nothing is cacheable across requests.
export const dynamic = "force-dynamic";

/** Each held token at its Comet's price in dollars, keyed by lowercase
 *  address — the `prices` `cometViewFromChain` reads. The ETH-quoted Comet
 *  converts at the read's `ethUsd`; a Comet with no conversion is unpriced. */
function cometPricesUsd(p: CompoundMarketChainResponse, baseToken: string, ethUsd: number | undefined) {
  const fx = p.quoteUnit === "USD" ? 1 : p.quoteUnit === "ETH" && ethUsd ? ethUsd : null;
  const out: Record<string, number> = {};
  if (fx == null) return out;
  if (p.basePrice > 0) out[baseToken.toLowerCase()] = p.basePrice * fx;
  for (const c of p.collateral) if (c.price > 0) out[c.address.toLowerCase()] = c.price * fx;
  return out;
}

/** The chain reader calls viem's `getAddress`, which throws outside its try —
 *  a malformed wallet is turned away here. */
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market: wallet } = await params;
  const base = positionMetadata({
    session: "compound-v3-arbitrum",
    subject: wallet,
    canonicalPath: compoundArbitrumWalletHref(wallet),
    image: "dynamic",
  });
  const title = `Compound V3 on Arbitrum Wallet ${shortSubject(wallet)}`;
  const description = `Every Compound V3 market on Arbitrum this wallet has touched, read live from the Comets, one card each.`;
  return {
    ...base,
    title,
    description,
    openGraph: { ...base.openGraph, title: `Rails | ${title}`, description },
    twitter: { ...base.twitter, title: `Rails | ${title}`, description },
  };
}

export default async function CompoundArbitrumWalletPage({ params }: Props) {
  const { market: raw } = await params;
  if (!ADDRESS.test(raw)) notFound();
  const wallet = raw.toLowerCase();

  const tail = await loadCompoundArbitrumTail(wallet);
  const head = tail.head;
  const history = tail.timeline ? (rehydrateChainTimelineWire(tail.timeline) as CometChainTimelineResult) : null;

  // Open first, then the Comets only the history names; roster order within.
  const held = new Set((head?.positions ?? []).map((p) => p.market));
  const named = new Set(tail.historyMarketKeys);
  const roster = COMPOUND_ARBITRUM_DEPLOYMENT.markets;
  const markets: OverviewMarket[] = [
    ...roster
      .filter((m) => held.has(m.key))
      .map((m) => ({ market: m, chain: head!.positions.find((p) => p.market === m.key) ?? null })),
    ...roster.filter((m) => !held.has(m.key) && named.has(m.key)).map((m) => ({ market: m, chain: null })),
  ];

  // Both legs answered and name one Comet between them: that is the page.
  if (head && history && markets.length === 1) redirect(compoundArbitrumMarketHref(markets[0].market.key, wallet));

  // One post of this render's Comet read, once the response is sent; a stale
  // stub or a missed read posts nothing.
  if (head) {
    const keys = tail.historyMarketKeys;
    after(() => recordCompoundArbitrumVisit(head, keys));
  }

  const whole = history != null && compoundArbitrumWholeLife(history.coverage);
  const historyState: OverviewHistory = history == null ? "missing" : whole ? "whole" : "not-whole";
  // One card per Comet, built as the wallet page builds its sections; open
  // first, then the rest, the list's order within each.
  const captureSource = COMPOUND_ARBITRUM_PAGE.captureSourceOf(history?.coverage);
  const cards = markets
    .map(({ market, chain }) => ({
      market,
      chain,
      href: compoundArbitrumMarketHref(market.key, wallet),
      view: cometViewFromChain(
        market,
        wallet,
        chain,
        history?.markets.find((r) => r.market === market.key) ?? null,
        chain ? cometPricesUsd(chain, market.baseToken, head?.ethUsd) : undefined,
        whole,
      ),
    }))
    .sort((a, b) => Number(b.view.status === "open") - Number(a.view.status === "open"));
  const strip =
    cards.length > 0
      ? compoundArbitrumHolderStrip(
          wallet,
          head,
          cards.map((c) => ({ market: c.market, chain: c.chain, status: c.view.status })),
        )
      : null;

  const untouched =
    head != null &&
    head.positionsFound === 0 &&
    whole &&
    history != null &&
    history.events.length === 0 &&
    (history.coverage.omitted?.count ?? 0) === 0;

  return (
    <CompoundArbitrumWalletOverview
      wallet={wallet}
      head={head}
      markets={markets}
      cards={cards.map(({ market, chain, href, view }) => ({ key: market.key, href, view, live: chain }))}
      strip={strip}
      captureSource={captureSource}
      history={historyState}
      untouched={untouched}
    />
  );
}
