"use client";

// SparkLend position card — the chain-state analog of the Aave / Morpho / Maker
// position cards, through the SAME shared grammar (OpenPositionStats + StatValue)
// so it lines up with the other explorers.
//
// A SparkLend account is cross-collateralised: one wallet supplies and borrows
// MANY reserves. Every headline value is read from the chain — each reserve's supplied /
// borrowed balance is the index's scaled-balance reduction (0008/0011): the
// current rebased figure, interest included, equal to the spToken /
// variableDebtToken `balanceOf` at the indexed head. A LISTING card carries no
// health factor (rails-ops decision 0018): a listing exists to find a position,
// and risk is read live on the position page — whose own Pool
// getUserAccountData read is the only HF this card ever shows.

import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { StatValue, StatDash } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { WalletPill } from "@/components/shared/wallet-pill";
import { formatUnitsExact, formatCompact } from "@/lib/utils/format";
import { Prov } from "@/components/shared/provenance";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import {
  positionSupplyProv,
  positionDebtProv,
  sparkUsdProvOnchain,
  sparkInterestCaptionProv,
  sparkPeakSupplyProv,
  sparkPeakBorrowProv,
  sparkLiqPriceProv,
} from "@/lib/spark/event-provenance";
import { accountDataProv, reserveDataProv, avgBorrowRateProv } from "@/lib/spark/position-provenance";
import { sparkLiquidationRead, type SparkCardCaptions } from "@/lib/spark/economics";
import { sparkPositionContent } from "@/lib/spark/position-content";
import { formatUsd } from "@/lib/shared/format-event";
import { fmtLiqPrice } from "@/lib/aave-v4/format";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import { LifecyclePill, UsdHeadline } from "@/components/shared/position-card-pills";
import type { SparkPositionSummary, SparkReserveAmount } from "@/lib/sources/api/spark-positions";

export interface SparkPositionView {
  wallet: string;
  status: "open" | "closed" | "liquidated";
  supplies: SparkReserveAmount[];
  borrows: SparkReserveAmount[];
  /** Highest recorded per-reserve supply / debt (closed/liquidated cards). */
  peakSupplies: SparkReserveAmount[];
  peakBorrows: SparkReserveAmount[];
  liquidationCount: number;
  /** Non-liquidation transaction count (activity-meta). */
  txCount: number;
  /** Unix seconds of the most recent event (activity-meta). */
  lastActivityAt: number;
  /** On-chain oracle USD (IAaveOracle, chain-derived) per reserve, keyed by
   *  lowercased token address. Feeds the card's USD footnotes; a reserve the
   *  oracle didn't price is simply absent (the total then omits). */
  priceByAddress?: Record<string, number>;
  atBlock?: number;
  /** The position page's live health factor (Pool.getUserAccountData, read on
   *  visit). Null = no debt when read; meaningless when `chainHfStale`. A
   *  listing view never carries one (0018). */
  healthFactor?: number | null;
  /** True when no live read stands behind `healthFactor` — every listing
   *  view, and the position page until its chain read lands — so the HF
   *  column is omitted rather than asserted. */
  chainHfStale?: boolean;
}

/** On-chain oracle USD for one reserve; null when SparkLend didn't price it. */
function reserveUsd(v: SparkPositionView, address: string, amount: number): number | null {
  const p = v.priceByAddress?.[address.toLowerCase()];
  return typeof p === "number" && p > 0 ? amount * p : null;
}

/** Total USD across a set of reserves, with the STRICT guard: null the moment any
 *  contributing reserve is unpriced, so a partial total is never asserted (it
 *  degrades to no footnote). */
function totalUsd(v: SparkPositionView, reserves: SparkReserveAmount[]): number | null {
  let sum = 0;
  let any = false;
  for (const r of reserves) {
    if (r.amount <= 0) continue;
    const u = reserveUsd(v, r.address, r.amount);
    if (u == null) return null;
    sum += u;
    any = true;
  }
  return any ? sum : null;
}

/** Reserves sorted by oracle-USD value, largest first — so the capped icon
 *  cluster and the detail-page leg lines foreground worth, not naked token
 *  count. Falls back to the incoming raw-balance order the moment any leg is
 *  unpriced or `priceByAddress` is absent — a rank the oracle can't back is
 *  never asserted. */
function rankByValue(v: SparkPositionView, reserves: SparkReserveAmount[]): SparkReserveAmount[] {
  const usd = new Map<string, number>();
  for (const r of reserves) {
    const u = reserveUsd(v, r.address, r.amount);
    if (u == null) return reserves;
    usd.set(r.address, u);
  }
  return [...reserves].sort((a, b) => (usd.get(b.address) ?? 0) - (usd.get(a.address) ?? 0));
}

/** Per-reserve token amounts, demoted beneath the USD headline — still the
 *  strict chain reads (each line traced, exact figure on hover), just no longer
 *  giving dust equal billing with the aggregate. */
function ReserveFootnoteLines({
  reserves,
  side,
  atBlock,
}: {
  reserves: SparkReserveAmount[];
  side: "supply" | "debt";
  atBlock?: number;
}) {
  if (reserves.length === 0) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500 tabular-nums space-y-0.5">
      {reserves.map((r) => {
        const exact = formatUnitsExact(r.amountRaw, r.decimals);
        return (
          <div key={r.address}>
            <Prov
              info={side === "supply" ? positionSupplyProv(r.symbol, atBlock) : positionDebtProv(r.symbol, atBlock)}
            >
              <span title={`${exact} ${r.symbol}`} data-prov-exact={exact} data-prov-symbol={r.symbol}>
                {formatCompact(r.amount)} {r.symbol}
              </span>
            </Prov>
          </div>
        );
      })}
    </div>
  );
}

/** "incl. $X interest" — accrued interest already included in the column's
 *  balance above (it grew it), computed with the strict attribution gates
 *  (computeSparkCardCaptions). Hidden below a cent — dust isn't worth a line. */
function InterestCaption({ side, usd }: { side: "supply" | "debt"; usd: number | null | undefined }) {
  if (usd == null || usd < 0.01) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500">
      incl. <Prov info={sparkInterestCaptionProv(side)}>{formatUsd(usd)}</Prov> interest
    </div>
  );
}

/** "X% borrow rate" — the live Pool rate on the single borrowed reserve, or the
 *  debt-USD-weighted average across several (computeSparkCardCaptions gates). */
function BorrowRateCaption({ rate }: { rate: SparkCardCaptions["borrowRate"] | undefined }) {
  if (!rate) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500">
      <Prov
        info={
          rate.avg
            ? avgBorrowRateProv()
            : reserveDataProv("Variable borrow APR", "currentVariableBorrowRate", rate.symbol)
        }
      >
        {rate.pct.toFixed(2)}%
      </Prov>{" "}
      {rate.avg ? "avg borrow rate" : "borrow rate"}
    </div>
  );
}

/** Compact liquidation read beneath the Health Factor stat — the V4 spoke-card
 *  treatment: the tangible restatement of HF, not a peer of it. One supplied
 *  reserve carrying ≥99.5% of the oracle-priced collateral anchors a
 *  single-asset liquidation price (oracle price ÷ HF — both legs on-chain, so
 *  it survives the gate); otherwise the 1 − 1/HF combined-collateral drop.
 *  Nothing when there's no debt, HF ≤ 1 (the headline already says
 *  liquidatable), or HF reads ∞. */
function LiquidationFootnote({ v }: { v: SparkPositionView }) {
  const read = sparkLiquidationRead(v);
  if (read.single) {
    return (
      <div className="text-xs mt-0.5 text-rb-500 inline-flex items-center gap-1">
        Liquidates at
        <TokenChipIcon symbol={read.single.symbol} size={14} filterable={false} />
        <Prov info={sparkLiqPriceProv(read.single.symbol)}>{fmtLiqPrice(read.single.liqPrice)}</Prov>
      </div>
    );
  }
  if (read.dropPct == null) return null;
  // Multi-collateral: 1 − 1/HF, a pure function of the traced HF above.
  return <div className="text-xs mt-0.5 text-rb-500">Liquidates on a {read.dropPct.toFixed(0)}% drop</div>;
}

/** Neutral HF headline (Rails doesn't color-code risk): "∞" above 100 — the
 *  figure stops meaning anything as a ratio there — else two decimals. */
function hfLabel(hf: number): string {
  return hf >= 100 ? "∞" : hf.toFixed(2);
}

/** A vertical stack of the wallet's reserves on one side, each traced. */
function ReserveStack({
  reserves,
  side,
  atBlock,
}: {
  reserves: SparkReserveAmount[];
  side: "supply" | "debt";
  atBlock?: number;
}) {
  if (reserves.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {reserves.map((r) => (
        <StatValue key={r.address}>
          <Prov info={side === "supply" ? positionSupplyProv(r.symbol, atBlock) : positionDebtProv(r.symbol, atBlock)}>
            <AssetAmount value={r.amount} symbol={r.symbol} exact={formatUnitsExact(r.amountRaw, r.decimals)} />
          </Prov>
        </StatValue>
      ))}
    </div>
  );
}

/** A vertical stack of per-reserve PEAK amounts (highest recorded), each traced
 *  to its own receipt — the scaled-delta reducer's largest running claim
 *  (spToken transfers included on the supply side), valued at the index of the
 *  moment it stood, interest to then included. No USD: the peaks are maxima at
 *  different moments, so pricing them at one block would assert a portfolio
 *  that never existed. */
function PeakStack({ reserves, side }: { reserves: SparkReserveAmount[]; side: "supply" | "debt" }) {
  if (reserves.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {reserves.map((r) => (
        <StatValue key={r.address}>
          <Prov info={side === "supply" ? sparkPeakSupplyProv(r.symbol) : sparkPeakBorrowProv(r.symbol)}>
            <AssetAmount value={r.amount} symbol={r.symbol} exact={formatUnitsExact(r.amountRaw, r.decimals)} />
          </Prov>
        </StatValue>
      ))}
    </div>
  );
}

export function SparkPositionCard({
  v,
  receipts = false,
  rowExtra,
  explanation,
  viewHref,
  captions,
}: {
  v: SparkPositionView;
  receipts?: boolean;
  /** Context content riding the shell's heading-button row (the detail page
   *  passes the compact liquidation runway). */
  rowExtra?: React.ReactNode;
  /** The card's Explanation section (the V4/trove "About this position" home) —
   *  narration bullets + the risk strips describing the position NOW. */
  explanation?: React.ReactNode;
  /** Copy-this-view control, forwarded straight through to `PositionCardShell`
   *  — the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** Detail-page stat captions (accrued interest, borrow rate) — computed from
   *  the event stream + live Pool read (computeSparkCardCaptions). Listing
   *  cards omit them; the liquidation caption needs neither and always rides. */
  captions?: SparkCardCaptions;
}) {
  const collUsd = totalUsd(v, v.supplies);
  const debtUsd = totalUsd(v, v.borrows);

  // Closed / liquidated: the wallet holds no open reserves, so the headline is
  // what each asset held at its height — highest recorded per-reserve supply +
  // debt (chain-state MAX over the wallet's life, per asset; no USD).
  if (v.status === "closed" || v.status === "liquidated") {
    return (
      <PositionCardShell
        receipts={receipts}
        explanation={explanation}
        viewHref={viewHref}
        learnMore={sparkPositionContent({ status: v.status })}
      >
        <ClosedPositionStats
          outcome={v.status}
          leadingIdentity={
            <WalletPill wallet={v.wallet} ensName={null} filterProtocol="spark" bookmarkProtocol="spark" />
          }
          identity={
            <PositionCardMeta
              lastActivityAt={v.lastActivityAt}
              eventCount={v.txCount}
              liquidationCount={v.liquidationCount}
            />
          }
          closedAt={v.lastActivityAt}
          collateral={<PeakStack reserves={v.peakSupplies} side="supply" />}
          debt={<PeakStack reserves={v.peakBorrows} side="debt" />}
        />
      </PositionCardShell>
    );
  }

  // Detail render (receipts): the V4 spoke-card header grammar — a neutral
  // mode-word pill (what the account is doing NOW: Borrowing / Supply only /
  // Liquidatable, not a lifecycle word) plus the wallet pill (facehash +
  // copyable address). The LISTING render keeps the lifecycle pill + plain
  // text address: status is the listing's filter axis, and the whole card sits
  // inside a row <Link> where the pill's buttons would fight the navigation.
  const modeWord =
    v.borrows.length > 0
      ? v.healthFactor != null && v.healthFactor < 1
        ? "Liquidatable"
        : "Borrowing"
      : "Supply only";

  // `receipts` is the render-site switch (listing defaults false; only the
  // detail page passes it), so it doubles as the surface discriminator: the
  // listing omits the per-leg lines (V4 spoke-card parity — USD headline +
  // capped cluster only), the detail page keeps the full traced list.
  const isDetail = receipts;
  // Value order for the cluster and the leg lines — the three visible icons
  // are the three largest by oracle USD, and the detail legs match.
  const suppliesRanked = rankByValue(v, v.supplies);
  const borrowsRanked = rankByValue(v, v.borrows);

  return (
    <PositionCardShell
      receipts={receipts}
      rowExtra={rowExtra}
      explanation={explanation}
      viewHref={viewHref}
      learnMore={sparkPositionContent({ status: v.status, hasDebt: v.borrows.length > 0 })}
    >
      <OpenPositionStats
        statusPill={
          receipts ? (
            <span className="font-bold px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
              {modeWord}
            </span>
          ) : (
            <LifecyclePill status={v.status} />
          )
        }
        // The protocol name is redundant inside the SparkLend explorer (one
        // market), so the wallet leads — WalletPill on both surfaces (buttons,
        // not anchors, so it lives safely inside the listing card's <Link>),
        // stays copy-selectable).
        leadingIdentity={
          <WalletPill wallet={v.wallet} ensName={null} filterProtocol="spark" bookmarkProtocol="spark" />
        }
        // Right-hand activity-meta cluster: time-ago, transaction count, liquidation.
        identity={
          <PositionCardMeta
            lastActivityAt={v.lastActivityAt}
            eventCount={v.txCount}
            liquidationCount={v.liquidationCount}
          />
        }
        columns={[
          // The V4 spoke-card grammar: ONE oracle-USD figure leads each side
          // (the asset cluster carries the identities), the per-reserve token
          // amounts demote to traced footnote lines. When any contributing
          // reserve is unpriced the token stack stays the headline — a partial
          // USD total is never asserted.
          {
            label: CARD_VOCAB.collateral,
            assetIcons:
              v.supplies.length > 0 ? <InlineAssetCluster symbols={suppliesRanked.map((r) => r.symbol)} /> : undefined,
            value:
              collUsd != null ? (
                <UsdHeadline usd={collUsd} info={sparkUsdProvOnchain("Collateral")} />
              ) : (
                <ReserveStack reserves={v.supplies} side="supply" atBlock={v.atBlock} />
              ),
            footnote: (
              <>
                {isDetail && collUsd != null && (
                  <ReserveFootnoteLines reserves={suppliesRanked} side="supply" atBlock={v.atBlock} />
                )}
                <InterestCaption side="supply" usd={captions?.supplyInterestUsd} />
              </>
            ),
          },
          {
            label: CARD_VOCAB.debt,
            assetIcons:
              v.borrows.length > 0 ? <InlineAssetCluster symbols={borrowsRanked.map((r) => r.symbol)} /> : undefined,
            value:
              debtUsd != null ? (
                <UsdHeadline usd={debtUsd} info={sparkUsdProvOnchain("Borrowed")} />
              ) : (
                <ReserveStack reserves={v.borrows} side="debt" atBlock={v.atBlock} />
              ),
            footnote: (
              <>
                {isDetail && debtUsd != null && (
                  <ReserveFootnoteLines reserves={borrowsRanked} side="debt" atBlock={v.atBlock} />
                )}
                <BorrowRateCaption rate={captions?.borrowRate} />
                <InterestCaption side="debt" usd={captions?.debtInterestUsd} />
              </>
            ),
          },
          // The live HF — the position page's own chain read. Omitted (not
          // dashed) on every listing view and until the page's read lands
          // (`chainHfStale`) — an unasserted layer, per the chain-truth
          // charter. A read wallet with no debt reads "No debt" (HF is
          // undefined, ∞ in protocol terms).
          v.chainHfStale
            ? null
            : {
                label: ratioLabel("pooled"),
                value:
                  v.healthFactor == null ? (
                    <StatValue color="text-rb-400">No debt</StatValue>
                  ) : (
                    <StatValue>
                      <Prov info={accountDataProv("Health factor", "healthFactor")}>{hfLabel(v.healthFactor)}</Prov>
                    </StatValue>
                  ),
                // The liquidation read beneath HF — its tangible restatement
                // (single collateral → oracle liq price, multi → 1 − 1/HF drop).
                footnote: <LiquidationFootnote v={v} />,
              },
        ]}
      />
    </PositionCardShell>
  );
}

/** Build a card view from the listing summary row. The view carries no health
 *  factor: the position page merges its own live read over this (`chain`). */
export function viewFromSummary(s: SparkPositionSummary): SparkPositionView {
  return {
    wallet: s.wallet,
    status: s.status,
    supplies: s.supplies,
    borrows: s.borrows,
    peakSupplies: s.peakSupplies,
    peakBorrows: s.peakBorrows,
    liquidationCount: s.liquidationCount,
    txCount: s.txCount,
    lastActivityAt: s.lastActivityAt,
    priceByAddress: s.priceByAddress,
    // A listing view never carries a health factor (0018): the row's snapshot
    // HF is not read, and the position page's own live read is the only one
    // the card shows.
    healthFactor: null,
    chainHfStale: true,
  };
}
