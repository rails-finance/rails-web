// The Compound V3 Base holder view, /base/compound-v3/<wallet>. Next names one
// dynamic segment per level, so this level's segment is `[market]` for the
// market pages beneath it (`[market]/[wallet]`), and here it holds the wallet.
// A wallet whose Comet read and history name one Comet between them is sent
// to that market page; otherwise the holder strip and one card per Comet it
// touched (rails-ops reference/arbitrum-position-first-lane.md).

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { positionMetadata, shortSubject } from "@/lib/shared/page-metadata";
import { loadCompoundBaseTail } from "@/lib/compound-base/position-page-data";
import { COMPOUND_BASE_DEPLOYMENT } from "@/lib/compound-base/asset-catalog";
import { compoundBaseMarketHref, compoundBaseWalletHref } from "@/lib/compound-base/routes";
import { COMPOUND_BASE_PAGE } from "@/lib/compound-base/page-deployment";
import { compoundBaseHolderStrip } from "@/lib/compound-base/holder-strip";
import { cometViewFromChain } from "@/lib/compound/chain-position-view";
import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import { cometPriceOf, resolveCometPrices } from "@/lib/sources/chain/compound-prices";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import type { CometChainTimelineResult } from "@/lib/sources/chain/compound-v3-events";
import { CompoundBaseWalletOverview, type OverviewHistory, type OverviewMarket } from "./wallet-overview";

interface Props {
  params: Promise<{ market: string }>;
}

// Every figure is read at one block per request; nothing is cacheable across requests.
export const dynamic = "force-dynamic";

/** Each held token at its Comet's price in dollars, keyed by lowercase
 *  address: the `prices` `cometViewFromChain` reads. The ETH-quoted Comet
 *  converts at the read's `ethUsd`; a Comet with no conversion is unpriced. */
function cometPricesUsd(p: CompoundMarketChainResponse, baseToken: string, ethUsd: number | undefined) {
  const fx = p.quoteUnit === "USD" ? 1 : p.quoteUnit === "ETH" && ethUsd ? ethUsd : null;
  const out: Record<string, number> = {};
  if (fx == null) return out;
  if (p.basePrice > 0) out[baseToken.toLowerCase()] = p.basePrice * fx;
  for (const c of p.collateral) if (c.price > 0) out[c.address.toLowerCase()] = c.price * fx;
  return out;
}

/** WETH in dollars: the ETH-quoted Comet's base price converted on
 *  cUSDCv3's WETH feed, the reading the market page's prices route makes
 *  (lib/sources/chain/compound-prices.ts). The Base roster states no feeds, so
 *  the Comet read carries no `ethUsd` of its own. Null where it is unread. */
async function wethUsd(): Promise<number | null> {
  const eth = COMPOUND_BASE_DEPLOYMENT.markets.find((m) => m.quoteUnit === "ETH");
  if (!eth) return null;
  try {
    const map = await resolveCometPrices(
      [{ comet: eth.comet, baseToken: eth.baseToken, collateral: [] }],
      COMPOUND_BASE_DEPLOYMENT,
    );
    const p = cometPriceOf(map, eth.comet, eth.baseToken);
    return p != null && p > 0 ? p : null;
  } catch (err) {
    console.error("compound-v3-base holder view: WETH price read failed", err);
    return null;
  }
}

/** The chain reader calls viem's `getAddress`, which throws outside its try;
 *  a malformed wallet is turned away here. */
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market: wallet } = await params;
  const base = positionMetadata({
    session: "compound-base",
    subject: wallet,
    canonicalPath: compoundBaseWalletHref(wallet),
    image: "dynamic",
  });
  const title = `Compound V3 on Base Wallet ${shortSubject(wallet)}`;
  const description = `Every Compound V3 market on Base this wallet has touched, read live from the Comets, one card each.`;
  return {
    ...base,
    title,
    description,
    openGraph: { ...base.openGraph, title: `Rails | ${title}`, description },
    twitter: { ...base.twitter, title: `Rails | ${title}`, description },
  };
}

export default async function CompoundBaseHolderPage({ params }: Props) {
  const { market: raw } = await params;
  if (!ADDRESS.test(raw)) notFound();
  const wallet = raw.toLowerCase();

  // The roster read, and the history when the index vouches for the whole of
  // it (lib/shared/swept-position-page-data.ts); a history that has to be
  // swept is read on the market pages.
  const [tail, ethUsd] = await Promise.all([loadCompoundBaseTail(wallet), wethUsd()]);
  const head = tail.head && ethUsd != null ? { ...tail.head, ethUsd } : tail.head;
  const history = tail.timeline ? (rehydrateChainTimelineWire(tail.timeline) as CometChainTimelineResult) : null;

  // Open first, then the Comets only the history names; roster order within.
  const held = new Set((head?.positions ?? []).map((p) => p.market));
  const named = new Set((history?.markets ?? []).map((r) => r.market));
  const roster = COMPOUND_BASE_DEPLOYMENT.markets;
  const markets: OverviewMarket[] = [
    ...roster
      .filter((m) => held.has(m.key))
      .map((m) => ({ market: m, chain: head!.positions.find((p) => p.market === m.key) ?? null })),
    ...roster.filter((m) => !held.has(m.key) && named.has(m.key)).map((m) => ({ market: m, chain: null })),
  ];

  // Both legs answered and name one Comet between them: that is the page.
  if (head && history && markets.length === 1) redirect(compoundBaseMarketHref(markets[0].market.key, wallet));

  const whole = history != null && COMPOUND_BASE_PAGE.wholeOf(history.coverage);
  const historyState: OverviewHistory = history == null ? "missing" : whole ? "whole" : "not-whole";
  // One card per Comet, built as the market page builds its section; open
  // first, then the rest, the roster's order within each.
  const captureSource = COMPOUND_BASE_PAGE.captureSourceOf(history?.coverage);
  const cards = markets
    .map(({ market, chain }) => {
      const replay = history?.markets.find((r) => r.market === market.key) ?? null;
      return {
        market,
        chain,
        href: compoundBaseMarketHref(market.key, wallet),
        baseAtChain: replay?.baseAtChain === true,
        view: cometViewFromChain(
          market,
          wallet,
          chain,
          replay,
          chain ? cometPricesUsd(chain, market.baseToken, head?.ethUsd) : undefined,
          whole,
        ),
      };
    })
    .sort((a, b) => Number(b.view.status === "open") - Number(a.view.status === "open"));
  const strip =
    cards.length > 0
      ? compoundBaseHolderStrip(
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
    <CompoundBaseWalletOverview
      wallet={wallet}
      head={head}
      markets={markets}
      cards={cards.map(({ market, chain, href, view, baseAtChain }) => ({
        key: market.key,
        href,
        view,
        live: chain,
        baseAtChain,
      }))}
      strip={strip}
      captureSource={captureSource}
      history={historyState}
      untouched={untouched}
    />
  );
}
