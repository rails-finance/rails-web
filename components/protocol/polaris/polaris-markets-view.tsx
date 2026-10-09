"use client";

// The Polaris PROTOCOL view (/sepolia/polaris/markets) — the two markets side
// by side. Each card states what the market's own contracts state at one head
// block (the book's collateral and debt, the rate in force, mode and reserve
// ratio, the minimum ratio in force, the stability pool's depth, the price
// legs the protocol values pETH with) beside what the index holds for it (CDP
// counts by status, the open book as the ledger last wrote it, the PSM and
// liquidation counts). Present, don't rank: no score, no valence.
//
// Every figure is a Sepolia testnet figure, and the page says so once, in the
// stamp — not on every number.

import Link from "next/link";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { polarisModal } from "@/lib/polaris/event-templates";
import {
  liveCurvePriceProv,
  liveMcrProv,
  liveMedianiserProv,
  liveModeProv,
  livePethInDebtProv,
  liveRateProv,
  liveReserveRatioProv,
  liveSpDepositsProv,
  liveSpPProv,
  liveTotalProv,
  liveUsdValueProv,
} from "@/lib/polaris/live-provenance";
import { POLARIS_BASE_PATH } from "@/lib/polaris/routes";
import { bookCountProv, openBookProv } from "@/lib/polaris/book-provenance";
import { POLARIS_MARKET_CONFIG, POLARIS_MARKETS, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import { formatExact, formatUsdValue } from "@/lib/utils/format";
import { explorerUrl } from "@/lib/shared/chains";
import { POLARIS_CHAIN_ID } from "@/lib/polaris/asset-catalog";
import { Stat } from "@/components/shared/stat";
import type { PolarisMarketsChainResponse, PolarisMarketChainState } from "@/lib/sources/chain/polaris-position";
import type { PolarisBook } from "@/lib/sources/api/polaris-book";
import type { PolarisMarketBook } from "@/lib/sources/api/polaris-positions";
import { AmountText } from "@/components/shared/amount-text";
import { BlockRef } from "@/components/shared/block-ref";

const pct = (f: number, dp = 2): string => `${(f * 100).toFixed(dp)}%`;

/** `stabilityPool.P()` at deploy. P only ever scales down from here, so the
 *  reading that fits a card column is the fraction of deploy still standing —
 *  raw, P is a 36-digit integer that runs past the column on both cards. This
 *  is the DISPLAY form only: the Prov receipt beside it carries the raw value
 *  unchanged. BigInt throughout, since 1e36 is far outside Number's exact
 *  range and a Number round-trip would move the digits it is meant to show. */
const P_AT_DEPLOY = BigInt("1" + "0".repeat(36));
/** Decimal places kept in the fraction. */
const P_SCALE = BigInt("1" + "0".repeat(10));

function formatSpP(raw: string): string {
  let p: bigint;
  try {
    p = BigInt(raw);
  } catch {
    return raw;
  }
  if (p === P_AT_DEPLOY) return "1";
  if (p <= BigInt(0)) return "0";
  const scaled = (p * P_SCALE) / P_AT_DEPLOY;
  if (scaled === BigInt(0)) {
    // Liquidations have taken P below 1e-10 of deploy — state the order of
    // magnitude rather than ten zeros after the point.
    return `~1e${p.toString().length - 37}`;
  }
  const s = scaled.toString().padStart(11, "0");
  const frac = `${s.slice(0, s.length - 10)}.${s.slice(-10)}`.replace(/0+$/, "").replace(/\.$/, "");
  return frac;
}

function MarketCard({ chain, book }: { chain: PolarisMarketChainState | null; book: PolarisMarketBook | null }) {
  const market = (chain?.market ?? book?.market) as PolarisMarket;
  const cfg = POLARIS_MARKET_CONFIG[market];
  const stable = cfg.stable.symbol;
  const unit = market === "usdp" ? "USD" : "oz gold";
  return (
    <div className="rounded-xl bg-raised px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-foreground">{cfg.label}</span>
        <span className="text-[11px] text-rb-500">
          mints {stable}, tracking {cfg.tracks}
        </span>
        <LearnMore content={polarisModal("market")} inline />
      </div>

      {chain ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <Stat
              label="Collateral in CDPs, now"
              note={
                <>
                  <Prov
                    info={liveUsdValueProv("The market's collateral", true)}
                    value={formatUsdValue(chain.totalColl * chain.price.pethUsd)}
                  >
                    <span>{formatUsdValue(chain.totalColl * chain.price.pethUsd)}</span>
                  </Prov>{" "}
                  · the market&rsquo;s own total, PSM shares included
                </>
              }
            >
              <Prov info={liveTotalProv("coll", market)} value={formatExact(chain.totalColl)}>
                <AmountText value={chain.totalColl} format="compact" /> pETH
              </Prov>
            </Stat>
            <Stat label="Debt across CDPs, now" note="the market's own total, PSM shares included">
              <Prov info={liveTotalProv("debt", market)} value={formatExact(chain.totalDebt)}>
                <AmountText value={chain.totalDebt} format="compact" /> {stable}
              </Prov>
            </Stat>
            <Stat
              label="Rate in force"
              note={
                <>
                  primary{" "}
                  <Prov info={liveRateProv("primary", market, true)} value={pct(chain.primaryRate)}>
                    {pct(chain.primaryRate)}
                  </Prov>{" "}
                  + secondary{" "}
                  <Prov info={liveRateProv("secondary", market, true)} value={pct(chain.secondaryRate)}>
                    {pct(chain.secondaryRate)}
                  </Prov>
                </>
              }
            >
              <Prov info={liveRateProv("combined", market, true)} value={pct(chain.interestRate)}>
                {pct(chain.interestRate)}
              </Prov>
            </Stat>
            <Stat label="Mode">
              <Prov info={liveModeProv(market, true)} value={chain.defensiveMode ? "defensive" : "normal"}>
                {chain.defensiveMode ? "defensive" : "normal"}
              </Prov>
              <span className="ml-1 text-rb-500">
                · reserve-to-debt{" "}
                <Prov info={liveReserveRatioProv(market, true)} value={chain.reserveToDebtRatio.toFixed(4)}>
                  {chain.reserveToDebtRatio.toFixed(2)}
                </Prov>
              </span>
            </Stat>
            <Stat label="Minimum ratio in force">
              <Prov
                info={liveMcrProv(chain.defensiveMode, market, true)}
                value={pct(chain.defensiveMode ? chain.defensiveMcr : chain.mcr, 0)}
              >
                {pct(chain.defensiveMode ? chain.defensiveMcr : chain.mcr, 0)}
              </Prov>
            </Stat>
            <Stat
              label="Stability pool"
              note={
                <>
                  each {stable} deposited when the pool opened is now worth{" "}
                  <Prov info={liveSpPProv(market)} value={chain.spP}>
                    {formatSpP(chain.spP)}
                  </Prov>{" "}
                  {stable}; the rest paid off liquidated debt and came back to the depositor as pETH
                </>
              }
            >
              <Prov info={liveSpDepositsProv(market)} value={formatExact(chain.spDeposits)}>
                <AmountText value={chain.spDeposits} format="compact" /> {stable}
              </Prov>
            </Stat>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <Stat label={`pETH in ${stable}`}>
              <Prov info={livePethInDebtProv(market, true)} value={formatExact(chain.price.pethInDebt)}>
                <AmountText value={chain.price.pethInDebt} /> {unit}
              </Prov>
            </Stat>
            <Stat label="pETH in ETH">
              <Prov info={liveCurvePriceProv(true)} value={formatExact(chain.price.curve)}>
                {chain.price.curve.toFixed(4)} ETH
              </Prov>
            </Stat>
            <Stat label={market === "usdp" ? "ETH/USD" : "ETH/USD · XAU/USD"}>
              <Prov info={liveMedianiserProv("eth", true)} value={formatExact(chain.price.ethUsd)}>
                {formatUsdValue(chain.price.ethUsd)}
              </Prov>
              {chain.price.xauUsd != null && (
                <>
                  <span className="mx-1 text-rb-400">·</span>
                  <Prov info={liveMedianiserProv("xau", true)} value={formatExact(chain.price.xauUsd)}>
                    {formatUsdValue(chain.price.xauUsd)}
                  </Prov>
                </>
              )}
            </Stat>
          </div>
        </>
      ) : (
        <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
          The chain did not answer on this read, so the market&rsquo;s own figures are withheld rather than estimated.
        </p>
      )}

      <div className="mt-3 border-t border-rb-200/60 pt-3 dark:border-rb-800/60">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-foreground">The book, as indexed</span>
          <LearnMore content={polarisModal("liquidation")} inline />
        </div>
        {book ? (
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <Stat label="CDPs">
              <Prov
                info={bookCountProv(
                  "CDPs ever opened",
                  market,
                  "Open, closed and liquidated, by the last CDPUpdated's operation.",
                )}
              >
                {book.openCount + book.closedCount + book.liquidatedCount}
              </Prov>
              <span className="ml-1 text-rb-500">
                · {book.openCount} open, {book.closedCount} closed, {book.liquidatedCount} liquidated
              </span>
            </Stat>
            <Stat
              label="Open CDPs, at their last touch"
              note="each CDP as its last touch wrote it; the market's totals above add what is pending since"
            >
              <Prov info={openBookProv("coll", market)} value={formatExact(book.openColl)}>
                <AmountText value={book.openColl} format="compact" /> pETH
              </Prov>
              <span className="mx-1 text-rb-400">·</span>
              <Prov info={openBookProv("debt", market)} value={formatExact(book.openDebt)}>
                <AmountText value={book.openDebt} format="compact" /> {stable}
              </Prov>
            </Stat>
            {book.psmMintCount != null && (
              <Stat label="PSM" note={`direct ${stable} mints and redemptions against pETH, shared by every open CDP`}>
                <Prov
                  info={bookCountProv(
                    "PSM mints and redemptions",
                    market,
                    "Minted and Redeemed logs on the market's PSM.",
                  )}
                >
                  {book.psmMintCount} mints · {book.psmRedeemCount ?? 0} redemptions
                </Prov>
              </Stat>
            )}
            {book.liquidationCount != null && (
              <Stat label="Liquidations">
                <Prov info={bookCountProv("Liquidations", market, "Liquidation logs on the market's cdpManager.")}>
                  {book.liquidationCount}
                </Prov>
              </Stat>
            )}
            {book.spDepositOps != null && (
              <Stat label="Stability pool operations" note="deposits, withdrawals and gain claims">
                <Prov
                  info={bookCountProv(
                    "Stability pool operations",
                    market,
                    "DepositOperation logs on the market's stability pool: deposits, withdrawals and gain claims.",
                  )}
                >
                  {book.spDepositOps}
                </Prov>
              </Stat>
            )}
          </div>
        ) : (
          <p className="mt-2 text-[11px] leading-relaxed text-rb-500">
            The index has not answered for this market yet, so the book is withheld rather than estimated. The chain
            figures above stand on their own.
          </p>
        )}
        <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
          <Link href={`${POLARIS_BASE_PATH}?market=${market}`} className="text-blue-500 hover:underline">
            Browse the {stable} CDPs
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

export function PolarisMarketsView({ chain, book }: { chain: PolarisMarketsChainResponse; book: PolarisBook }) {
  const registry = useReceiptRegistry();
  if (chain.chainStale && book.bookStale) {
    return (
      <div className="py-12 text-center text-rb-500">
        <p className="mb-1">Couldn&apos;t read Polaris&apos;s markets from Sepolia, and the index did not answer.</p>
        <p className="text-sm">
          This view is a live contract read with no cached fallback — it shows nothing. Try again shortly.
        </p>
      </div>
    );
  }
  return (
    <ProvReceiptsScope registry={registry}>
      <section>
        <h2 className="text-sm font-semibold text-foreground">The two markets</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {POLARIS_MARKETS.map((market) => (
            <MarketCard
              key={market}
              chain={chain.markets.find((m) => m.market === market) ?? null}
              book={book.markets.find((m) => m.market === market) ?? null}
            />
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-rb-500">
          Both markets mint against the same collateral, pETH, which ETH buys from the protocol&rsquo;s bonding curve at
          a price that rises as ETH enters it. They differ in the unit they price it in: USDp values it through the
          ETH/USD medianiser, GOLDp through ETH/USD and XAU/USD, so a GOLDp debt is a claim on ounces of gold. A
          medianiser takes the median of the oracles it reads. The rate is a primary rate, which moves with the
          PSM&rsquo;s mints and redemptions, plus a secondary rate that rises with the market&rsquo;s debt-to-reserve
          ratio. A market whose reserve-to-debt ratio falls below 1.10 enters defensive mode and its minimum rises to
          150%. The stability pool is what absorbs a liquidation&rsquo;s debt. Reserve loans, which lend ETH against
          fpETH, are captured by the index but not shown here. fpETH is the floor part of pETH: the component whose
          price in ETH the protocol guarantees can only rise, which is why a loan against it cannot be liquidated.
        </p>
      </section>
      <ProvenanceInfoTabs className="mt-6" />
    </ProvReceiptsScope>
  );
}

/** The page header's live-read stamp — the block every chain figure was read at. */
export function PolarisMarketsStamp({ chain }: { chain: PolarisMarketsChainResponse }) {
  if (chain.chainStale || chain.blockNumber === 0) return null;
  return (
    <p className="mt-2 text-[11px] text-rb-500">
      Sepolia testnet · chain snapshot · <BlockRef block={chain.blockNumber} chainId={POLARIS_CHAIN_ID} /> · every
      figure a test figure
    </p>
  );
}
