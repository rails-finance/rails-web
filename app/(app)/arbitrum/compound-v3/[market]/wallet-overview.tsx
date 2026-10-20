// The Compound V3 Arbitrum wallet overview: one row per Comet the wallet has
// touched, each linking its market page. Each Comet holds its own collateral
// and liquidates on its own, so the rows state no total and no combined health
// (rails-ops reference/arbitrum-position-first-lane.md). Server-rendered from
// the page's read; nothing here asks again.

import Link from "next/link";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import type { PriceStripAsset } from "@/components/shared/price-strip";
import type { CometMarket } from "@/lib/compound/asset-catalog";
import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import type { CompoundWalletChainResponse } from "@/lib/api/fetch-compound-wallet";
import { compoundArbitrumUsd, type CompoundArbitrumCometUsd } from "@/lib/compound-arbitrum/usd";
import { compoundArbitrumMarketHref } from "@/lib/compound-arbitrum/routes";
import { COMPOUND_ARBITRUM_PAGE } from "@/lib/compound-arbitrum/page-deployment";
import { formatUsd } from "@/lib/shared/format-event";

/** One Comet the wallet touched: `chain` where it holds something now, else
 *  the history names it. */
export interface OverviewMarket {
  market: CometMarket;
  chain: CompoundMarketChainResponse | null;
}

/** What the history leg says, for the words under the rows. */
export type OverviewHistory = "whole" | "not-whole" | "missing";

const W = COMPOUND_ARBITRUM_PAGE.words;

const COLUMNS = ["Collateral", "Debt", "Supply", "Health factor"] as const;
const DASH = <span className="text-rb-400">—</span>;

function usdCell(v: number | null | undefined) {
  if (v == null) return <span className="text-rb-400">Not priced</span>;
  if (v === 0) return DASH;
  return formatUsd(v);
}

function healthCell(chain: CompoundMarketChainResponse | null) {
  if (!chain) return <span className="text-rb-400">Closed</span>;
  if (chain.isLiquidatable) return <span className="font-medium text-amber-600">Liquidatable</span>;
  if (chain.healthFactor == null) return <span className="text-rb-400">No debt</span>;
  return chain.healthFactor.toFixed(2);
}

/** Every held asset at its Comet's price in dollars, once each. */
function stripAssets(head: CompoundWalletChainResponse | null): PriceStripAsset[] {
  if (!head) return [];
  const out: PriceStripAsset[] = [];
  const seen = new Set<string>();
  for (const p of head.positions) {
    const fx = p.quoteUnit === "USD" ? 1 : p.quoteUnit === "ETH" && head.ethUsd ? head.ethUsd : null;
    if (fx == null) continue;
    const market = COMPOUND_ARBITRUM_PAGE.deployment.markets.find((m) => m.key === p.market);
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

export function CompoundArbitrumWalletOverview({
  wallet,
  head,
  markets,
  history,
  untouched,
}: {
  wallet: string;
  /** Every Comet's answer; null where the read failed. */
  head: CompoundWalletChainResponse | null;
  /** Open first, then closed, roster order within each. */
  markets: OverviewMarket[];
  history: OverviewHistory;
  untouched: boolean;
}) {
  const usd = head ? compoundArbitrumUsd(head).byComet : new Map<string, CompoundArbitrumCometUsd>();
  const scanned = head?.marketsScanned ?? COMPOUND_ARBITRUM_PAGE.deployment.markets.length;
  const historyLine =
    history === "missing"
      ? "The history has not answered yet, so a market this wallet has left may be missing; reload in a minute."
      : null;

  return (
    <div className="py-8 space-y-6">
      <DetailTopRow
        session="compound-v3-arbitrum"
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
                {history === "missing" ? "Whether it ever did waits on the history, which has not answered yet." : null}
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
        <section className="space-y-3" data-compound-arbitrum-overview={markets.length}>
          {/* A grid per row: five columns from `sm`, and on a phone the label
          over a 2×2 of figures, each with its own heading. */}
          <div
            className="hidden grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-4 text-[11px] uppercase tracking-wide text-rb-500 sm:grid"
            aria-hidden
          >
            <span>Market</span>
            {COLUMNS.map((c) => (
              <span key={c} className="text-right">
                {c}
              </span>
            ))}
          </div>
          <ul>
            {markets.map(({ market, chain }) => {
              const u = chain ? usd.get(chain.comet.toLowerCase()) : undefined;
              const cells = [
                chain ? usdCell(u?.collateralUsd) : DASH,
                chain ? usdCell(u?.borrowUsd) : DASH,
                chain ? usdCell(u?.supplyUsd) : DASH,
                head ? healthCell(chain) : DASH,
              ];
              return (
                <li
                  key={market.key}
                  className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-rb-200 py-3 text-sm sm:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] sm:items-baseline dark:border-rb-800"
                  data-overview-market={market.key}
                >
                  <span className="col-span-2 sm:col-span-1">
                    <Link
                      href={compoundArbitrumMarketHref(market.key, wallet)}
                      className="font-medium text-blue-500 hover:underline"
                    >
                      {market.label}
                    </Link>
                    <span className="ml-2 text-[11px] text-rb-500">{market.baseSymbol}</span>
                  </span>
                  {cells.map((cell, i) => (
                    <span
                      key={COLUMNS[i]}
                      className="flex items-baseline justify-between gap-2 tabular-nums sm:block sm:text-right"
                    >
                      <span className="text-[11px] text-rb-500 sm:hidden">{COLUMNS[i]}</span>
                      {cell}
                    </span>
                  ))}
                </li>
              );
            })}
          </ul>
          {!head && (
            <p className="text-sm text-rb-500">
              The Comets did not answer in time, so these are the markets the history names; reload to read them.
            </p>
          )}
          {historyLine && <p className="text-sm text-rb-500">{historyLine}</p>}
          <p className="text-[11px] text-rb-500">
            Each Comet holds its own collateral and liquidates on its own; nothing here sums.
          </p>
        </section>
      )}

      <ProvInspectorLayer />
    </div>
  );
}
