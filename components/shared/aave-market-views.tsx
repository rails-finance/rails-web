"use client";

// The shared Aave-V3-family market-overview surface — Aave V3 on Ethereum,
// Base and Arbitrum, SparkLend and Seamless (/ethereum/aave-v3/market,
// /base/aave-v3/market, /arbitrum/aave-v3/markets, /ethereum/spark/market,
// /base/seamless/market). Two sections:
//   1. The vitals band — identity, size, supply composition, and a sentence
//      counting the reserves closed to new business.
//   2. The reserve list (anatomy M1, ui-jobs 541) — every reserve on the
//      Pool, sortable, filterable by asset class. From 1024px a table, every
//      row 64px:
//        ASSET · SUPPLIED · BORROWED · AVAILABLE · SUPPLY RATE · BORROW RATE ·
//        COLLATERAL · UTILISATION
//      Below that the same table reads as cards (D6, `stackBelow="lg"`), with a
//      sort select in place of the headers. Each row is a linked row (D4) to
//      its reserve page (anatomy M3, components/shared/aave-reserve-page.tsx);
//      the asset cell holds the link.
//
// Available is the Pool's virtual balance on a v3.3+ Pool
// (Pool.getVirtualUnderlyingBalance), else supplied less borrowed.
// Collateral is "LTV / LT", or "Not collateral" at a loan-to-value of 0 ("eMode
// only" where an eMode category lends one). The bar is <RatioBar> on the
// UTILISATION axis, its one tick the rate model's kink.
//
// Caps show only near binding: a side in use at CAP_NEAR_BINDING or more, or
// closed by a cap of one whole token (lib/shared/aave-market-view.ts capSide,
// capShows), reads as a pill under its size, `data-caps` on the pill.
//
// One level down: the reserve's parameters (ReserveParameters: oracle price and
// source, LTV, LT, bonus, reserve factor, caps, debt ceiling, kink, eMode
// categories) open from the asset cell's "Details" control in a panel
// (AnchoredPanel; a bottom sheet on a phone); the reserve page's M3.5 draws
// the same list. The control and the receipts stand above the row's cover.
//
// No-opinionated-colour rule: asset classes are distinguished by label +
// grouping colour, and the one caution tint marks a closed door (Moonwell's
// convention). Present, don't rank: default order is size, no score anywhere.
//
// Provenance: one scope for the band, one per reserve row, so the inspector
// pins a row's receipts to that row; the details panel sits inside its row's
// scope. Every figure carries a <Prov> from lib/shared/aave-market-provenance;
// utilisation (a ratio of the row's two receipted sizes) is exempt from the
// coverage tripwire.

import { useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Ban, ChevronDown } from "lucide-react";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { AssetUnit } from "@/components/shared/asset-unit";
import { RevealTip } from "@/components/shared/reveal-tip";
import { RatioBar, type RatioBarTick } from "@/components/shared/ratio-bar";
import { AnchoredPanel } from "@/components/shared/asset-popover";
import { fmtUsd } from "@/lib/aave-v4/format";
import { type AssetClass, ASSET_CLASS_TITLE, ASSET_CLASS_COLOR } from "@/lib/aave-v4/asset-class";
import {
  capShows,
  marketSummaryText,
  type AaveMarketView,
  type CapState,
  type MarketReserveRow,
} from "@/lib/shared/aave-market-view";
import { EXPLORERS_WITHOUT_LISTING } from "@/lib/shared/coverage";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { aaveMarketVocab, type AaveMarketVocab } from "@/lib/shared/aave-market-provenance";
import { VitalsBand } from "@/components/shared/vitals-band";
import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { useSkeletonSizes } from "@/hooks/useSkeletonSizes";
import { formatCompact } from "@/lib/shared/format-compact";
import { ratePercentText } from "@/lib/shared/rate-percent";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import {
  DATA_TABLE_PILL,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DataTableRowLink,
} from "@/components/shared/data-table/data-table";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";

const CLOSED = "text-tone-caution";
const TAG = `${DATA_TABLE_PILL} px-1 py-px text-[10px] uppercase tracking-wide`;
const CAP_PILL = `${DATA_TABLE_PILL} inline-block whitespace-nowrap px-1 py-px text-[10px] leading-tight`;
/** A closed side's pill: D1's pill ground, the caution tint in both schemes. */
const CAP_PILL_CLOSED = `${CAP_PILL} ${CLOSED} dark:text-tone-caution`;

// Display order for the class filter — stablecoin first, "other" last.
const CLASS_ORDER: AssetClass[] = ["stablecoin", "eth", "btc", "gold", "other"];

// A class grouping-color dot — shared by the filter chips and the rows.
function ClassDot({ cls }: { cls: AssetClass }) {
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ASSET_CLASS_COLOR[cls] }} />;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
/** A basis-point integer as a percentage number with no trailing zeros:
 *  8050 → "80.5", 10 → "0.1", 5 → "0.05". Epsilon values (Spark's 1-bp DAI
 *  threshold, 0.1% Pendle thresholds) stay visible. */
function bpsText(bps: number): string {
  return (bps / 100).toFixed(2).replace(/\.?0+$/, "");
}
/** A 0..1 fraction as a percentage number, same trimming. */
function fracText(f: number): string {
  return bpsText(Math.round(f * 1e4));
}
/** Share of a cap in use, whole numbers (the pill shows from 90%). */
function usedText(f: number): string {
  return `${Math.round(f * 100).toLocaleString("en-US")}%`;
}
// Oracle price — full figure above $1k (prices read as exact quotes, not
// sizes), two decimals below so stables show "$1.00", not "$1".
function fmtPrice(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
const tokens = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

// Filter chip — quiet at rest, interaction-blue when engaged (minimal filter UX).
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
        active
          ? "border-teal-500 bg-teal-500/10 text-foreground"
          : "border-raised bg-raised text-rb-500 hover:border-teal-500/50 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

// Composition: one row per asset class — label · proportional bar · share.
// Same row-chart treatment as the hub cards (small classes stay legible).
function CompositionBar({ composition }: { composition: AaveMarketView["composition"] }) {
  if (composition.length === 0) return null;
  return (
    // Supply-mix chart — each row's share is a proportion of the traced
    // supplied-USD total, drawn as a bar. A visualization, not a per-figure
    // read, so it opts out of the coverage tripwire (the receipts already carry
    // the supplied totals the shares are computed from).
    <div className="space-y-1.5" data-prov-exempt="">
      {composition.map((c) => (
        <div key={c.cls} className="flex items-center gap-2" title={`${c.pct}% ${c.label}`}>
          <span className="w-28 shrink-0 truncate text-[12px] text-rb-500">{c.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/5">
            <div
              className="h-full rounded-full"
              style={{ width: `${c.pct}%`, backgroundColor: ASSET_CLASS_COLOR[c.cls] }}
            />
          </div>
          <span className="w-8 shrink-0 text-right tabular-nums text-[12px] text-rb-500">{c.pct}%</span>
        </div>
      ))}
    </div>
  );
}

// ── Row pieces ───────────────────────────────────────────────────────────────

/** The lifecycle and mode tags beside the symbol — states, not judgements. */
export function StateTags({ r, vocab }: { r: MarketReserveRow; vocab: AaveMarketVocab }) {
  return (
    <>
      {r.frozen && (
        <span className={TAG} title="Frozen: no new supply or borrowing; existing positions unwind">
          <Prov info={vocab.flagProv("frozen", r.symbol)}>frozen</Prov>
        </span>
      )}
      {r.paused && (
        <span className={TAG} title="Paused: every action suspended, liquidation included">
          <Prov info={vocab.flagProv("paused", r.symbol)}>paused</Prov>
        </span>
      )}
      {r.debtCeiling != null && (
        <span className={TAG} title={`Isolation mode: debt ceiling $${r.debtCeiling.toLocaleString("en-US")}`}>
          <Prov info={vocab.isolatedProv(r.symbol, r.debtCeiling)}>isolated</Prov>
        </span>
      )}
      {r.siloed && (
        <span className={TAG} title="Siloed borrowing: a wallet borrowing this can borrow nothing else">
          <Prov info={vocab.siloedProv(r.symbol)}>siloed</Prov>
        </span>
      )}
    </>
  );
}

/** One side's cap, where it shows (capShows): "cap 94%" near binding, "cap
 *  closed" at a cap of one whole token. Borrowing switched off on a reserve
 *  that still carries borrows reads "borrowing off". Otherwise nothing. */
function CapPill({
  side,
  c,
  r,
  vocab,
}: {
  side: "supply" | "borrow";
  c: CapState;
  r: MarketReserveRow;
  vocab: AaveMarketVocab;
}) {
  if (c.state === "off")
    return (
      <span className={CAP_PILL_CLOSED} title="Borrowing is switched off for this reserve" data-caps={side}>
        <Prov info={vocab.borrowOffProv(r.symbol)}>borrowing off</Prov>
      </span>
    );
  if (!capShows(c)) return null;
  if (c.state === "closed")
    return (
      <span
        className={CAP_PILL_CLOSED}
        title={`A ${side} cap of one whole ${r.symbol}: governance closes a side this way, so no share is quoted.`}
        data-caps={side}
      >
        cap <Prov info={vocab.capClosedProv(side, r.symbol, c.basis)}>closed</Prov>
      </span>
    );
  if (c.state !== "used") return null;
  return (
    <span
      className={CAP_PILL}
      title={
        c.basis === "automator"
          ? `${tokens(c.amount)} of a ${tokens(c.cap)} ${r.symbol} maximum (CapAutomator); Pool cap ${c.liveCap != null ? tokens(c.liveCap) : "—"}`
          : `${tokens(c.amount)} of a ${tokens(c.cap)} ${r.symbol} ${side} cap`
      }
      data-caps={side}
    >
      cap{" "}
      <Prov
        info={vocab.capUsedProv(side, r.symbol, {
          amount: c.amount,
          cap: c.cap,
          basis: c.basis,
          liveCap: c.liveCap,
          treasury: side === "supply" ? (r.accruedToTreasury ?? 0) : undefined,
        })}
      >
        {usedText(c.used)}
      </Prov>
    </span>
  );
}

/** The eMode categories this reserve belongs to, and whether any lends it a
 *  loan-to-value. */
function emodeOf(r: MarketReserveRow) {
  const cats = r.emodeCategories ?? [];
  const lendsLtv = cats.some((c) => (c.ltv ?? 0) > 0);
  return { cats, lendsLtv };
}

const ltvBpsOf = (r: MarketReserveRow) => r.bps?.ltv ?? Math.round((r.ltv ?? 0) * 1e4);
const ltBpsOf = (r: MarketReserveRow) => r.bps?.lt ?? Math.round((r.lt ?? 0) * 1e4);

/** The Collateral cell: "LTV / LT", or "Not collateral" at a loan-to-value of
 *  0, "eMode only" where an eMode category lends one. */
function Collateral({ r, vocab }: { r: MarketReserveRow; vocab: AaveMarketVocab }) {
  const ltvBps = ltvBpsOf(r);
  const ltBps = ltBpsOf(r);
  const em = emodeOf(r);
  if (ltvBps === 0) {
    if (em.lendsLtv)
      return (
        <span className="text-rb-500" title="Collateral only for a wallet in one of its eMode categories (Details)">
          <Prov info={vocab.reserveEModeLtProv(r.symbol, em.cats)}>eMode only</Prov>
        </span>
      );
    return (
      <span className="text-rb-500" title="A loan-to-value of 0: holding it adds nothing to what a wallet can borrow">
        <Prov info={ltBps > 0 ? vocab.ltvZeroProv(r.symbol) : vocab.reserveLtProv(r.symbol)}>Not collateral</Prov>
      </span>
    );
  }
  return (
    <span title="Loan-to-value / liquidation threshold">
      <Prov info={vocab.reserveLtvProv(r.symbol, ltvBps)}>{bpsText(ltvBps)}%</Prov>
      <span className="text-rb-500"> / </span>
      <Prov info={vocab.reserveLtProv(r.symbol)}>{bpsText(ltBps)}%</Prov>
    </span>
  );
}

/** The utilisation bar with the kink tick. Utilisation is borrowed ÷ supplied,
 *  both traced in the same row, so its percentage is exempt from the coverage
 *  tripwire. */
function UtilBar({ r }: { r: MarketReserveRow }) {
  const ticks: RatioBarTick[] = [];
  if (r.kink != null)
    ticks.push({
      f: r.kink,
      kind: "neutral",
      title: `Rate model kink · the utilisation this reserve's curve turns at (${fracText(r.kink)}%)`,
    });
  const u = r.utilization != null && r.borrowed > 0 ? r.utilization : null;
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1 [&>div]:mt-0">
        <RatioBar fill={u ?? 0} ticks={ticks} />
      </div>
      <span
        className="w-9 shrink-0 text-right tabular-nums text-[12px] text-foreground/80"
        data-prov-exempt=""
        title="Utilisation: borrowed ÷ supplied, both traced in this row"
      >
        {u != null ? pct(u) : "—"}
      </span>
    </div>
  );
}

/** A reserve's available underlying, token units: the Pool's virtual balance
 *  where it has one, else supplied less borrowed. */
const availableTokens = (r: MarketReserveRow) => r.virtualBalance ?? Math.max(0, r.supplied - r.borrowed);

type RowProps = {
  r: MarketReserveRow;
  vocab: AaveMarketVocab;
  assetHref?: (symbol: string, side: "supply" | "borrow") => string;
  /** The row's reserve page (D4). */
  href?: string;
  chainId?: ChainId;
};

export function reserveFigures({ r, vocab, assetHref }: RowProps) {
  const sUsd = fmtUsd(r.suppliedUsd);
  const bUsd = fmtUsd(r.borrowedUsd);
  const hasBorrow = r.borrowedUsd >= 0.01 || r.borrowed > 0;
  const supplyLink = assetHref && r.suppliedUsd > 0 ? assetHref(r.symbol, "supply") : null;
  const borrowLink = assetHref && hasBorrow ? assetHref(r.symbol, "borrow") : null;
  // A reserve with no market price states its size in tokens.
  const fixed = r.fixedOraclePrice;
  const inTokens = (n: number) => (
    <span className="inline-flex items-center gap-1.5 text-foreground/80">
      {formatCompact(n)}
      <AssetUnit symbol={r.symbol} address={r.address} />
    </span>
  );
  const supplied =
    fixed && r.supplied > 0 ? (
      inTokens(r.supplied)
    ) : supplyLink ? (
      <Link href={supplyLink} className={INLINE_LINK}>
        <Prov info={vocab.reserveValueProv("supplied", r.symbol)}>{sUsd.display}</Prov>
      </Link>
    ) : (
      <span className={r.suppliedUsd > 0 ? "text-foreground/80" : "text-rb-500"}>
        <Prov info={vocab.reserveValueProv("supplied", r.symbol)}>{sUsd.display}</Prov>
      </span>
    );
  const borrowed = hasBorrow ? (
    borrowLink ? (
      <Link href={borrowLink} className={INLINE_LINK}>
        <Prov info={vocab.reserveValueProv("borrowed", r.symbol)}>{bUsd.display}</Prov>
      </Link>
    ) : (
      <span className="text-foreground/80">
        <Prov info={vocab.reserveValueProv("borrowed", r.symbol)}>{bUsd.display}</Prov>
      </span>
    )
  ) : null;
  // Available: the Pool's virtual balance where it has one (v3.3+), else
  // supplied less borrowed, in the unit the row's sizes are in.
  const availTokens = availableTokens(r);
  const basis = r.virtualBalance != null ? "virtual" : "difference";
  const availUsd = r.priceUsd != null ? availTokens * r.priceUsd : 0;
  const available =
    fixed && r.supplied > 0 ? (
      <span data-available-basis={basis}>
        <Prov info={vocab.reserveAvailableProv(r.symbol, { priced: false, basis, deficit: r.deficit })}>
          {inTokens(availTokens)}
        </Prov>
      </span>
    ) : (
      <span className={availUsd > 0 ? "text-foreground/80" : "text-rb-500"} data-available-basis={basis}>
        <Prov info={vocab.reserveAvailableProv(r.symbol, { priced: true, basis, deficit: r.deficit })}>
          {fmtUsd(availUsd).display}
        </Prov>
      </span>
    );
  const supplyRate =
    r.supplied > 0 ? (
      <Prov info={vocab.reserveRateProv("supply", r.symbol)}>{ratePercentText(r.supplyApr)}</Prov>
    ) : (
      <span className="text-rb-500">—</span>
    );
  const borrowRate = hasBorrow ? (
    <Prov info={vocab.reserveRateProv("borrow", r.symbol)}>{ratePercentText(r.borrowApr)}</Prov>
  ) : (
    <span className="text-rb-500">—</span>
  );
  const price =
    r.priceUsd != null ? (
      <Prov info={vocab.reservePriceProv(r.symbol)}>{fmtPrice(r.priceUsd)}</Prov>
    ) : fixed ? (
      <RevealTip
        tip={`No market price. The oracle returns a fixed ${fmtPrice(fixed.usd)} for ${r.symbol} (source ${fixed.source.slice(0, 6)}…${fixed.source.slice(-4)}), so ${r.symbol} is left out of the dollar totals. It is not collateral, so the figure moves no health factor.`}
        label={`No market price for ${r.symbol}`}
        focusable
        wrap
        align="end"
        className="focus-ring rounded-sm text-rb-500 underline decoration-dotted"
      >
        no price
      </RevealTip>
    ) : (
      <span className="text-rb-500">—</span>
    );
  return { supplied, borrowed, available, supplyRate, borrowRate, price };
}

/** One line of the details panel. */
function DetailLine({ term, children, title }: { term: string; children: React.ReactNode; title?: string }) {
  return (
    <div className="contents">
      <dt className="text-rb-500" title={title}>
        {term}
      </dt>
      <dd className="text-right tabular-nums text-foreground">{children}</dd>
    </div>
  );
}

/** One cap side as a parameter line: the share in use and the ceiling, or
 *  the state that replaces them, with its receipt. */
function CapLine({
  side,
  c,
  r,
  vocab,
}: {
  side: "supply" | "borrow";
  c: CapState;
  r: MarketReserveRow;
  vocab: AaveMarketVocab;
}) {
  switch (c.state) {
    case "off":
      return <Prov info={vocab.borrowOffProv(r.symbol)}>borrowing off</Prov>;
    case "closed":
      return <Prov info={vocab.capClosedProv(side, r.symbol, c.basis)}>closed</Prov>;
    case "none":
      return (
        <Prov info={vocab.capNoneProv(side, r.symbol, c.why, c.basis, side === "supply" ? r.supplyCap : r.borrowCap)}>
          no cap
        </Prov>
      );
    case "used":
      return (
        <span title={`${tokens(c.amount)} of ${tokens(c.cap)} ${r.symbol}`}>
          <Prov
            info={vocab.capUsedProv(side, r.symbol, {
              amount: c.amount,
              cap: c.cap,
              basis: c.basis,
              liveCap: c.liveCap,
              treasury: side === "supply" ? (r.accruedToTreasury ?? 0) : undefined,
            })}
          >
            {usedText(c.used)}
          </Prov>{" "}
          <span className="text-rb-500">of {formatCompact(c.cap)}</span>
        </span>
      );
  }
}

/** A reserve's parameters: oracle price and its source, loan-to-value,
 *  liquidation threshold and bonus, reserve factor, the two caps with their
 *  use, the debt ceiling where set, the kink and the eMode categories, each
 *  with its receipt. M1's Details panel and the reserve page's M3.5 draw it. */
export function ReserveParameters({
  r,
  vocab,
  price,
  chainId,
}: {
  r: MarketReserveRow;
  vocab: AaveMarketVocab;
  price: React.ReactNode;
  chainId?: ChainId;
}) {
  const ltvBps = ltvBpsOf(r);
  const ltBps = ltBpsOf(r);
  const bonusBps = r.bps?.bonus ?? 0;
  const em = emodeOf(r);
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  return (
    <div data-reserve-parameters="">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
        <DetailLine term="Oracle price" title="The market's oracle price (IAaveOracle getAssetPrice)">
          {price}
        </DetailLine>
        {r.oracleSource && (
          <DetailLine term="Price source" title="The feed the market's oracle reads for this asset">
            <Prov info={vocab.oracleSourceProv(r.symbol, r.oracleSource)}>
              {chainId != null ? (
                <a
                  href={explorerUrl(chainId, "address", r.oracleSource)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-muted font-mono text-[12px]"
                >
                  {short(r.oracleSource)}
                </a>
              ) : (
                <span className="font-mono text-[12px]">{short(r.oracleSource)}</span>
              )}
            </Prov>
          </DetailLine>
        )}
        <DetailLine term="Loan-to-value" title="The most a wallet can borrow against this reserve">
          <Prov info={vocab.reserveLtvProv(r.symbol, ltvBps)}>{bpsText(ltvBps)}%</Prov>
        </DetailLine>
        <DetailLine term="Liquidation threshold" title="The share of its value that counts toward covering debt">
          <Prov info={vocab.reserveLtProv(r.symbol)}>{bpsText(ltBps)}%</Prov>
        </DetailLine>
        {bonusBps > 10000 && (
          <DetailLine term="Liquidation bonus" title="The extra collateral a liquidator receives">
            <Prov info={vocab.reserveBonusProv(r.symbol, bonusBps)}>{bpsText(bonusBps - 10000)}%</Prov>
          </DetailLine>
        )}
        <DetailLine term="Reserve factor" title={RF_TIP}>
          <Prov info={vocab.reserveFactorProv(r.symbol)}>{pct(r.reserveFactor)}</Prov>
        </DetailLine>
        <DetailLine term="Supply cap" title="Share of the supply cap in use, and the cap">
          <CapLine side="supply" c={r.supplyCapState} r={r} vocab={vocab} />
        </DetailLine>
        <DetailLine term="Borrow cap" title="Share of the borrow cap in use, and the cap">
          <CapLine side="borrow" c={r.borrowCapState} r={r} vocab={vocab} />
        </DetailLine>
        {r.debtCeiling != null && (
          <DetailLine term="Debt ceiling" title="Isolation mode: the most that can be borrowed against this reserve">
            <Prov info={vocab.isolatedProv(r.symbol, r.debtCeiling)}>
              ${r.debtCeiling.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </Prov>
          </DetailLine>
        )}
        {r.kink != null && r.rateStrategy && (
          <DetailLine term="Kink" title="The utilisation at which the borrow rate starts to climb steeply">
            <Prov
              info={vocab.kinkProv(r.symbol, {
                strategy: r.rateStrategy,
                method: r.kinkMethod ?? "",
                raw: r.kinkRaw ?? null,
              })}
            >
              {fracText(r.kink)}%
            </Prov>
          </DetailLine>
        )}
      </dl>
      {em.cats.length > 0 && (
        <div className="mt-3 border-t border-rb-200 pt-2 dark:border-rb-700" data-reserve-emode="">
          <p className="mb-1.5 text-[11px] text-rb-500">eMode categories (LTV / LT)</p>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-[12px]">
            {em.cats.map((c) => (
              <div key={c.label} className="contents">
                <dt className="truncate text-rb-500" title={c.label}>
                  {c.label}
                </dt>
                <dd className="text-right tabular-nums text-foreground">
                  <Prov info={vocab.reserveEModeLtProv(r.symbol, [c])}>
                    {c.ltv != null ? `${fracText(c.ltv)}% / ` : ""}
                    {fracText(c.lt)}%
                  </Prov>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

/** The "Details" control in the asset cell: it opens ReserveParameters in a
 *  panel (a bottom sheet on a phone). */
function ReserveDetails({
  r,
  vocab,
  price,
  chainId,
}: {
  r: MarketReserveRow;
  vocab: AaveMarketVocab;
  price: React.ReactNode;
  chainId?: ChainId;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const label = `${r.symbol} reserve`;
  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${r.symbol} details`}
        className={`focus-ring relative z-30 inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded-md px-1 py-0.5 text-[11px] transition-colors hover:text-foreground ${open ? "text-foreground" : "text-rb-500"}`}
        data-reserve-details-toggle={r.address}
      >
        Details
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        // The panel renders in a portal; its events still pass through the
        // row's React handlers, so they stop here.
        <span className="contents" onClick={(e) => e.stopPropagation()}>
          <AnchoredPanel
            id={panelId}
            label={label}
            anchor={() => button.current}
            onClose={close}
            fit={320}
            drop
            name="reserve-details"
            surface="overlay"
          >
            <p className="mb-3 pr-8 text-[13px] font-semibold text-foreground sm:pr-0">{label}</p>
            <ReserveParameters r={r} vocab={vocab} price={price} chainId={chainId} />
          </AnchoredPanel>
        </span>
      )}
    </>
  );
}

/** One reserve as a table row. A keyed component so it can own its
 *  `useReceiptRegistry()`: each row is its own bounds-free receipts scope. */
function ReserveRow(props: RowProps) {
  const { r, vocab, href, chainId } = props;
  const registry = useReceiptRegistry();
  const z = reserveFigures(props);

  return (
    <ProvReceiptsScope registry={registry} bounds={false}>
      <DataTableRow data-reserve-row={r.address} href={href}>
        <DataTableCell rowHeader>
          <div className="flex items-center gap-2">
            <TokenChipIcon symbol={r.symbol} address={r.address} size={20} filterable={false} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex flex-wrap items-center gap-x-1.5 text-[13px] font-medium text-foreground">
                {href ? (
                  <DataTableRowLink href={href} data-reserve-link={r.address}>
                    {r.symbol}
                  </DataTableRowLink>
                ) : (
                  r.symbol
                )}
                <StateTags r={r} vocab={vocab} />
              </div>
              <div className="flex items-center gap-1 text-[11px] text-rb-500" title={r.classLabel}>
                <ClassDot cls={r.cls} />
                <span className="truncate">{r.classLabel}</span>
              </div>
            </div>
            <ReserveDetails r={r} vocab={vocab} price={z.price} chainId={chainId} />
          </div>
        </DataTableCell>
        <DataTableCell align="right" className="tabular-nums text-[13px]" label="Supplied">
          <div>{z.supplied}</div>
          <CapPill side="supply" c={r.supplyCapState} r={r} vocab={vocab} />
        </DataTableCell>
        <DataTableCell align="right" className="tabular-nums text-[13px]" label="Borrowed">
          <div>
            {z.borrowed ??
              (!r.borrowEnabled ? (
                // Structurally not borrowable — a no-entry mark, distinct
                // from a borrowable reserve that has no draws.
                <span
                  className="inline-flex items-center justify-end gap-1 text-rb-500/70"
                  title="Not borrowable in this market"
                >
                  <Ban className="h-3.5 w-3.5" aria-label="Not borrowable" />
                </span>
              ) : (
                <span className="text-rb-500">no borrows</span>
              ))}
          </div>
          {(z.borrowed != null || r.borrowEnabled) && (
            <CapPill side="borrow" c={r.borrowCapState} r={r} vocab={vocab} />
          )}
        </DataTableCell>
        <DataTableCell
          align="right"
          className="tabular-nums text-[13px]"
          title={r.virtualBalance != null ? "The Pool's virtual balance of this reserve" : "Supplied less borrowed"}
          label="Available"
          data-available=""
        >
          {z.available}
        </DataTableCell>
        <DataTableCell
          align="right"
          className="whitespace-nowrap tabular-nums text-[13px] text-foreground/80"
          title="Supply rate, read from the Pool at the stamped block"
          label="Supply rate"
          data-rate="supply"
        >
          {z.supplyRate}
        </DataTableCell>
        <DataTableCell
          align="right"
          className="whitespace-nowrap tabular-nums text-[13px] text-foreground/80"
          title="Variable borrow rate, read from the Pool at the stamped block"
          label="Borrow rate"
          data-rate="borrow"
        >
          {z.borrowRate}
        </DataTableCell>
        <DataTableCell
          align="right"
          className="whitespace-nowrap tabular-nums text-[13px] text-foreground/80"
          label={<span title={HEADER_TIP.collateral}>Collateral</span>}
          data-collateral=""
        >
          <Collateral r={r} vocab={vocab} />
        </DataTableCell>
        <DataTableCell
          className="lg:w-[180px] lg:min-w-[112px]"
          label={<span title={HEADER_TIP.util}>Utilisation</span>}
          wide
        >
          <UtilBar r={r} />
        </DataTableCell>
      </DataTableRow>
    </ProvReceiptsScope>
  );
}

export interface AaveMarketViewsProps {
  view: AaveMarketView;
  /** The protocol's listing route ("/ethereum/aave-v3", "/ethereum/spark"). */
  listingHref: string;
  /** Listing URL filtered to one asset on one side, when the listing's param
   *  space supports it (SparkLend's ?supply=/&borrow=); omit → plain cells. */
  assetHref?: (symbol: string, side: "supply" | "borrow") => string;
  /** Each row's reserve page (the row becomes a D4 link). */
  reserveHref?: (asset: string) => string;
  /** The page with this Pool's reserves table: the band ends with a link to
   *  it, and the table is left off (the overview of several Pools, M4). */
  reservesHref?: string;
  chainId?: ChainId;
}

type SortKey = "asset" | "supplied" | "borrowed" | "available" | "supplyRate" | "borrowRate" | "collateral" | "util";

const SORT_LABEL: Record<SortKey, string> = {
  asset: "Asset",
  supplied: "Supplied",
  borrowed: "Borrowed",
  available: "Available",
  supplyRate: "Supply rate",
  borrowRate: "Borrow rate",
  collateral: "Collateral",
  util: "Utilisation",
};

const RF_TIP = "The share of the interest borrowers pay that the protocol keeps; suppliers get the rest";

/** What a column header stands for, in its tip. */
const HEADER_TIP: Partial<Record<SortKey, string>> = {
  available:
    "Available: the underlying the Pool holds for this reserve, what suppliers can withdraw and borrowers can still take (supplied less borrowed on a Pool before v3.3)",
  collateral:
    "Collateral: loan-to-value / liquidation threshold, the most a wallet can borrow against this reserve and the ratio past which a position holding it can be liquidated",
  util: "Utilisation: the share of the reserve's supply that is on loan; the tick is the rate model's kink",
};

/** A reserve's collateral standing as one sortable number: loan-to-value,
 *  then liquidation threshold. */
const collateralRank = (r: MarketReserveRow) => ltvBpsOf(r) * 1e5 + ltBpsOf(r);

export function AaveMarketViews({
  view,
  listingHref,
  assetHref,
  reserveHref,
  reservesHref,
  chainId,
}: AaveMarketViewsProps) {
  // Not every explorer on this surface HAS a listing behind it. The Base ones
  // open on a wallet because the open-position set is not enumerable there, and
  // a "View all positions" link that lands back on this same page is a promise
  // the explorer cannot keep — decision 0014's point, applied to a control
  // rather than to prose. The registry already knows which explorers those are,
  // so nothing has to be remembered at the call site.
  const hasListing = !EXPLORERS_WITHOUT_LISTING.has(view.protocol);
  // One receipts scope for the band — the figures are one block's reading of
  // one Pool. The vocabulary is protocol-parameterised (each market sits on
  // different Pool/oracle contracts), bound here to the addresses + block the
  // payload was read at, and who read it.
  const registry = useReceiptRegistry();
  const vocab = aaveMarketVocab(view.protocol, {
    readBy: view.readBy,
    blockNumber: view.blockNumber,
    pool: view.pool,
    oracle: view.oracle,
    capAutomator: view.capAutomator,
  });
  const [classes, setClasses] = useState<Set<AssetClass>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("supplied");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleClass = (c: AssetClass) =>
    setClasses((prev) => {
      const n = new Set(prev);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });
  const pickSort = (k: SortKey) => {
    setSortKey(k);
    setSortDir(k === "asset" ? "asc" : "desc");
  };
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else pickSort(k);
  };

  const presentClasses = useMemo(() => {
    const s = new Set(view.rows.map((r) => r.cls));
    return CLASS_ORDER.filter((c) => s.has(c));
  }, [view.rows]);

  // The band is static — it describes the market, not the filtered slice.
  // Filters scope the list only.
  const filteredRows = useMemo(
    () => view.rows.filter((r) => classes.size === 0 || classes.has(r.cls)),
    [view.rows, classes],
  );

  const sortedRows = useMemo(() => {
    const cmp = (a: MarketReserveRow, b: MarketReserveRow): number => {
      switch (sortKey) {
        case "asset":
          return a.symbol.localeCompare(b.symbol);
        case "supplied":
          return a.suppliedUsd - b.suppliedUsd || a.supplied - b.supplied;
        case "borrowed":
          return a.borrowedUsd - b.borrowedUsd || a.borrowed - b.borrowed;
        case "available":
          return (
            availableTokens(a) * (a.priceUsd ?? 0) - availableTokens(b) * (b.priceUsd ?? 0) ||
            availableTokens(a) - availableTokens(b)
          );
        case "supplyRate":
          return a.supplyApr - b.supplyApr;
        case "borrowRate":
          return a.borrowApr - b.borrowApr;
        case "collateral":
          return collateralRank(a) - collateralRank(b);
        case "util":
          return (a.utilization ?? -1) - (b.utilization ?? -1);
      }
    };
    return [...filteredRows].sort((a, b) => (sortDir === "asc" ? cmp(a, b) : -cmp(a, b)));
  }, [filteredRows, sortKey, sortDir]);

  const supplied = fmtUsd(view.suppliedUsd);
  const borrowed = fmtUsd(view.borrowedUsd);
  const summary = marketSummaryText(view);
  // Market-level utilisation — the same quotient the rows show, taken over the
  // whole Pool. Absent (rather than 0%) when nothing is supplied to measure
  // against, so an unread oracle never renders as an idle market.
  const marketUtilization = view.suppliedUsd > 0 ? view.borrowedUsd / view.suppliedUsd : null;

  const dirOf = (k: SortKey) => (sortKey === k ? sortDir : null);
  const th = (label: string, k: SortKey, align: "left" | "right" = "left") => (
    <DataTableHeader
      label={label}
      align={align}
      title={HEADER_TIP[k] ? `${HEADER_TIP[k]}. Click to sort.` : undefined}
      sort={{ dir: dirOf(k), onSort: () => toggleSort(k), ariaLabel: `Sort by ${SORT_LABEL[k]}` }}
    />
  );

  return (
    <ProvReceiptsScope registry={registry}>
      <div>
        {/* Section 1 — the vitals band: identity · head figures · supply mix.
            The figures sit in the shared slots (roster · size in · size out ·
            usage) under this market's words for them. */}
        <div data-market-panel={view.protocol}>
          <VitalsBand
            className="mb-8"
            lead={
              <>
                {hasListing ? (
                  <Link
                    href={listingHref}
                    className="text-base font-semibold text-foreground transition-colors hover:text-blue-600 dark:hover:text-[var(--text-link)]"
                    title={`View ${view.label} positions`}
                  >
                    {view.label}
                  </Link>
                ) : (
                  <span className="text-base font-semibold text-foreground">{view.label}</span>
                )}
                <p className="mt-2 text-[13px] leading-relaxed text-rb-500">{view.purpose}</p>
                {summary && (
                  <p className="mt-3 text-[12px] leading-relaxed text-rb-500" data-market-summary="">
                    {summary}
                  </p>
                )}
              </>
            }
            vitals={[
              {
                slot: "roster",
                label: "Reserves",
                value: <Prov info={vocab.reserveCountProv()}>{view.reserveCount}</Prov>,
              },
              {
                slot: "sizeIn",
                label: "Supplied",
                value: <Prov info={vocab.marketTotalProv("supplied")}>{supplied.display}</Prov>,
                title: supplied.title,
              },
              {
                slot: "sizeOut",
                label: "Borrowed",
                value: <Prov info={vocab.marketTotalProv("borrowed")}>{borrowed.display}</Prov>,
                title: borrowed.title,
              },
              marketUtilization != null && {
                slot: "usage" as const,
                label: "Utilisation",
                // Borrowed ÷ supplied, both traced in this same band. A ratio of
                // two receipted figures — exempt from the coverage tripwire, like
                // the per-row utilisation.
                value: <span data-prov-exempt="">{pct(marketUtilization)}</span>,
                title:
                  "Borrowed ÷ supplied, both in USD at the market's oracle price: the two figures beside it in this band.",
              },
            ]}
            aside={
              <>
                {view.composition.length > 0 && (
                  <>
                    <div className="mb-1.5 text-[11px] uppercase tracking-wider text-rb-500">Supply mix</div>
                    <CompositionBar composition={view.composition} />
                  </>
                )}
                <div className="mt-auto flex flex-col gap-1 pt-3">
                  {reservesHref && (
                    <Link
                      href={reservesHref}
                      className={`inline-flex items-center gap-1 text-[13px] font-medium ${INLINE_LINK}`}
                      data-market-reserves-link=""
                    >
                      View {view.label} reserves
                      <span aria-hidden>→</span>
                    </Link>
                  )}
                  {hasListing && (
                    <Link
                      href={listingHref}
                      className={`inline-flex items-center gap-1 text-[13px] font-medium ${INLINE_LINK}`}
                    >
                      View all {view.label} positions
                      <span aria-hidden>→</span>
                    </Link>
                  )}
                </div>
              </>
            }
          />
        </div>
        {!reservesHref && (
          <>
            {/* Section 2 — the reserve list */}
            <div className="mb-3">
              <h2 className="text-[11px] uppercase tracking-wider text-rb-500">Reserves</h2>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-rb-500">
                Every reserve on the Pool, filter by class, sort any column. Rates, caps and risk parameters decode from
                the configuration the Pool enforces; USD is the market&apos;s oracle price. A cap shows under its size
                once 90% of it is in use. The bar is utilisation, and its tick is the rate model&apos;s kink. A row
                opens its reserve&apos;s page; Details opens its parameters in place.
              </p>
            </div>

            {/* Filters: asset class. Quiet chips; "All" clears. */}
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <span className="mr-0.5 text-[11px] uppercase tracking-wider text-rb-500">Class</span>
              <Chip active={classes.size === 0} onClick={() => setClasses(new Set())}>
                All
              </Chip>
              {presentClasses.map((c) => (
                <Chip key={c} active={classes.has(c)} onClick={() => toggleClass(c)}>
                  <ClassDot cls={c} />
                  {ASSET_CLASS_TITLE[c]}
                </Chip>
              ))}
            </div>

            {filteredRows.length === 0 ? (
              <div className="rounded-lg border border-rb-200 py-12 text-center text-rb-500 dark:border-rb-800">
                <p className="mb-1">No reserves match this filter.</p>
                <button type="button" onClick={() => setClasses(new Set())} className={`text-[13px] ${INLINE_LINK}`}>
                  Clear filter
                </button>
              </div>
            ) : (
              <>
                {/* Below lg the header row is hidden (D6): a select and a direction
                button drive the same sort. */}
                <div className="mb-2 flex items-center gap-2 lg:hidden" data-mobile-sort="">
                  <label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-rb-500">
                    Sort by
                    <select
                      value={sortKey}
                      onChange={(e) => pickSort(e.target.value as SortKey)}
                      className="rounded-md border border-rb-200 bg-background px-2 py-1 text-base sm:text-[12px] normal-case tracking-normal text-foreground dark:border-rb-800"
                    >
                      {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                        <option key={k} value={k}>
                          {SORT_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                    aria-label={
                      sortDir === "asc" ? "Ascending; switch to descending" : "Descending; switch to ascending"
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-rb-200 px-2 py-1 text-[12px] text-foreground dark:border-rb-800"
                  >
                    {sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                    {sortDir === "asc" ? "Low first" : "High first"}
                  </button>
                </div>
                <DataTable
                  label={`${view.label} reserves`}
                  tableClassName="lg:min-w-[900px]"
                  anatomy="M1"
                  stacked
                  stackBelow="lg"
                  rowHeight="two"
                >
                  <DataTableHead>
                    {th("Asset", "asset")}
                    {th("Supplied", "supplied", "right")}
                    {th("Borrowed", "borrowed", "right")}
                    {th("Available", "available", "right")}
                    {th("Supply rate", "supplyRate", "right")}
                    {th("Borrow rate", "borrowRate", "right")}
                    {th("Collateral", "collateral", "right")}
                    {th("Utilisation", "util")}
                  </DataTableHead>
                  <DataTableBody>
                    {sortedRows.map((r) => (
                      <ReserveRow
                        key={r.address}
                        r={r}
                        vocab={vocab}
                        assetHref={assetHref}
                        href={reserveHref?.(r.address)}
                        chainId={chainId}
                      />
                    ))}
                  </DataTableBody>
                </DataTable>
              </>
            )}
          </>
        )}
      </div>
    </ProvReceiptsScope>
  );
}

// Loading placeholder for the market data region (the page renders its real
// header above): one solid block — no inner anatomy (see
// components/shared/skeleton-card.tsx for the block grammar) — sized from the
// measured `page-table` default and this route's remembered height.
export function AaveMarketLoadingSkeleton() {
  const { sizes } = useSkeletonSizes();
  return (
    <div className="animate-pulse">
      <SkeletonBlock height={sizes["page-table"]} />
    </div>
  );
}
