// The Compound V3 Base holder view: the holder strip
// (components/shared/holder-strip.tsx, through lib/compound-base/
// holder-strip.ts) above one Compound card per Comet the wallet has touched,
// each linking its market page; the shape of Arbitrum's overview
// (rails-ops reference/arbitrum-position-first-lane.md). Server-rendered from
// the page's read; nothing here asks again.

import { HolderStrip, type HolderStripProps } from "@/components/shared/holder-strip";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import type { PriceStripAsset } from "@/components/shared/price-strip";
import type { CometMarket } from "@/lib/compound/asset-catalog";
import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import type { CompoundWalletChainResponse } from "@/lib/api/fetch-compound-wallet";
import { COMPOUND_BASE_PAGE } from "@/lib/compound-base/page-deployment";
import type { CaptureSource } from "@/lib/shared/capture-source";
import { CompoundBaseOverviewCards, type OverviewCard } from "./overview-cards";
import { MarketHashHop } from "./market-hash-hop";

/** One Comet the wallet touched: `chain` where it holds something now, else
 *  the history names it. */
export interface OverviewMarket {
  market: CometMarket;
  chain: CompoundMarketChainResponse | null;
}

/** What the history leg says, for the words under the cards: `missing` where
 *  the index could not vouch for the whole life and the history is swept on
 *  the market page instead. */
export type OverviewHistory = "whole" | "not-whole" | "missing";

const W = COMPOUND_BASE_PAGE.words;

/** Every held asset at its Comet's price in dollars, once each. */
function stripAssets(head: CompoundWalletChainResponse | null): PriceStripAsset[] {
  if (!head) return [];
  const out: PriceStripAsset[] = [];
  const seen = new Set<string>();
  for (const p of head.positions) {
    const fx = p.quoteUnit === "USD" ? 1 : p.quoteUnit === "ETH" && head.ethUsd ? head.ethUsd : null;
    if (fx == null) continue;
    const market = COMPOUND_BASE_PAGE.deployment.markets.find((m) => m.key === p.market);
    const assets = [
      ...(p.supplyBalanceRaw !== "0" || p.borrowBalanceRaw !== "0"
        ? [{ symbol: p.baseSymbol, address: market?.baseToken ?? "", price: p.basePrice }]
        : []),
      ...p.collateral.map((c) => ({ symbol: c.symbol, address: c.address, price: c.price })),
    ];
    for (const a of assets) {
      const addr = a.address.toLowerCase();
      if (!addr || seen.has(addr) || !(a.price > 0)) continue;
      seen.add(addr);
      out.push({ symbol: a.symbol, address: a.address, price: a.price * fx });
    }
  }
  return out;
}

export function CompoundBaseWalletOverview({
  wallet,
  head,
  markets,
  cards,
  strip,
  captureSource,
  history,
  untouched,
}: {
  wallet: string;
  /** Every Comet's answer; null where the read failed. */
  head: CompoundWalletChainResponse | null;
  /** Open first, then closed, roster order within each. */
  markets: OverviewMarket[];
  /** One per Comet, open first. */
  cards: OverviewCard[];
  /** Null when there are no cards. */
  strip: HolderStripProps | null;
  captureSource: CaptureSource;
  history: OverviewHistory;
  untouched: boolean;
}) {
  const scanned = head?.marketsScanned ?? COMPOUND_BASE_PAGE.deployment.markets.length;
  const historyLine =
    history === "missing"
      ? "Rails’ index does not yet hold this wallet’s whole history, so a market it has left may be missing here; each market page reads the Comets’ logs for its own."
      : null;

  return (
    <div className="py-8 space-y-6">
      <MarketHashHop wallet={wallet} />
      <DetailTopRow
        session="compound-base"
        wallet={wallet}
        owner={{ wallet }}
        assets={stripAssets(head)}
        closed={markets.length > 0 && markets.every((m) => m.chain == null)}
        tools={false}
      />

      {untouched ? (
        <div className="py-12 text-center text-rb-500">
          <p className="mb-1">{W.untouchedTitle}</p>
          <p className="text-sm">{W.untouchedBody(scanned)}</p>
        </div>
      ) : markets.length === 0 ? (
        <div className="py-12 text-center text-rb-500">
          {head ? (
            <>
              <p className="mb-1">{W.emptyNowTitle}</p>
              <p className="text-sm">
                All {scanned} markets were asked, and none holds a balance, a debt or collateral for this address.{" "}
                {history === "missing"
                  ? "Whether it ever did waits on the history, which Rails’ index does not yet hold whole for this wallet."
                  : null}
                {history === "not-whole" ? W.emptyNowHistory.notWhole : null}
              </p>
            </>
          ) : (
            <>
              <p className="mb-1">Couldn&apos;t read this wallet&apos;s positions.</p>
              <p className="text-sm">The Comets did not answer in time; reload to ask again.</p>
            </>
          )}
        </div>
      ) : (
        <section className="space-y-3">
          {strip && <HolderStrip {...strip} />}
          <CompoundBaseOverviewCards cards={cards} captureSource={captureSource} />
          {historyLine && <p className="text-sm text-rb-500">{historyLine}</p>}
        </section>
      )}

      <ProvInspectorLayer />
    </div>
  );
}
