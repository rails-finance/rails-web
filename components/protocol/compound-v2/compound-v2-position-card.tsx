"use client";

// Compound V2 position card — the original of the Compound-v2 family, through
// the SAME shared grammar (OpenPositionStats + StatValue) as the Moonwell and
// Compound V3 cards so it lines up with the other explorers.
//
// A Compound V2 account is cross-collateralised through the Comptroller: one
// wallet supplies and borrows across the twenty listed markets. The two sides
// carry DIFFERENT bases, and the provenance names each: supply is the exact
// cToken balance (slot-verified Transfer replay) × the market's exchange rate
// when the chain read landed — balanceOfUnderlying, interest included — else
// the replayed deposit principal; debt is the emitted accountBorrows at the
// last borrow/repay/liquidation event, UPGRADED to the live
// borrowBalanceStored on the detail page when its chain lane lands (each
// borrow row's `live` flag names the basis).
//
// STATUS IS TWO-AXIS. The lifecycle pill says open/closed/liquidated, where
// 'liquidated' names only a CLOSED account that was liquidated. An OPEN
// account that has been liquidated (close factor 0.5 → partial liquidations;
// borrowers commonly survive, ~4.5 liquidations each across 5,864 of them)
// stays an OPEN card — its liquidation history rides the meta cluster's
// count, never the lifecycle pill.
//
// USD: prices key by MARKET, not underlying address — two markets share
// WBTC's address and cETH has no underlying address at all. Three markets are
// priced by a constant stored in the oracle with NO feed behind it (cSAI at
// $14.4263): their lines carry the flag, and any USD headline they contribute
// to says so in its receipt.

import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { StatValue, StatDash } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { WalletPill } from "@/components/shared/wallet-pill";
import { formatUnitsExact, formatCompact } from "@/lib/utils/format";
import { Prov } from "@/components/shared/provenance";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import {
  positionSupplyCurrentProv,
  positionSupplyPrincipalProv,
  positionDebtProv,
  compoundV2UsdProvOnchain,
  compoundV2InterestCaptionProv,
  fixedPriceLineProv,
  borrowRateProv,
  avgBorrowRateProv,
  peakSupplyProv,
  peakDebtProv,
} from "@/lib/compound-v2/event-provenance";
import { compoundV2LiveDebtProv } from "@/lib/compound-v2/position-provenance";
import type { CompoundV2CardCaptions } from "@/lib/compound-v2/economics";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import { compoundV2PositionContent } from "@/lib/compound-v2/position-content";
import { formatUsd } from "@/lib/shared/format-event";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { LifecyclePill, UsdHeadline } from "@/components/shared/position-card-pills";
import {
  useReserveDisclosure,
  ReserveDisclosureToggle,
  ReserveDisclosureList,
} from "@/components/shared/reserve-disclosure";
import type {
  CompoundV2PositionSummary,
  CompoundV2SupplyAmount,
  CompoundV2BorrowAmount,
  CompoundV2PeakAmount,
} from "@/lib/sources/api/compound-v2-positions";

export interface CompoundV2PositionView {
  wallet: string;
  status: "open" | "closed" | "liquidated";
  /** The orthogonal liquidation flag — true on open survivors too. */
  everLiquidated: boolean;
  supplies: CompoundV2SupplyAmount[];
  borrows: CompoundV2BorrowAmount[];
  /** Highest recorded per-market supply / debt (closed/liquidated cards). */
  peakSupplies: CompoundV2PeakAmount[];
  peakBorrows: CompoundV2PeakAmount[];
  liquidationCount: number;
  /** Non-liquidation transaction count (activity-meta). */
  txCount: number;
  /** Unix seconds of the most recent event (activity-meta). */
  lastActivityAt: number;
  /** On-chain oracle USD (getUnderlyingPrice, chain-derived) per market's
   *  underlying, keyed by MARKET key. Feeds the card's USD footnotes; a
   *  market the oracle didn't price is simply absent. */
  priceByMarket?: Record<string, number>;
  /** Markets whose price is a stored constant with NO feed (the oracle's own
   *  getConfig says so) — the flag every USD surface must carry. */
  priceFixedByMarket?: Record<string, boolean>;
  /** Annualized per-block rates per market key (from the same multicall). */
  ratesByMarket?: Record<string, { borrowApr: number | null; supplyApr: number | null }>;
}

/** The figure a supply line asserts: the current value (interest included)
 *  when the chain read landed, the replayed principal otherwise. */
const supplyAmount = (r: CompoundV2SupplyAmount): number => r.current ?? r.principal;

/** On-chain oracle USD for one line; null when Compound didn't price it. */
function lineUsd(v: CompoundV2PositionView, market: string, amount: number): number | null {
  const p = v.priceByMarket?.[market];
  return typeof p === "number" && p > 0 ? amount * p : null;
}

function isFixed(v: CompoundV2PositionView, market: string): boolean {
  return v.priceFixedByMarket?.[market] === true;
}

/** Total USD across one side, with the STRICT guard: null the moment any
 *  contributing market is unpriced, so a partial total is never asserted (it
 *  degrades to no headline). `fixed` says whether any contributing leg is a
 *  frozen oracle constant — the receipt must say so. */
function totalUsd(
  v: CompoundV2PositionView,
  lines: { market: string; amount: number }[],
): { usd: number; fixed: boolean } | null {
  let sum = 0;
  let any = false;
  let fixed = false;
  for (const l of lines) {
    if (l.amount <= 0) continue;
    const u = lineUsd(v, l.market, l.amount);
    if (u == null) return null;
    sum += u;
    any = true;
    if (isFixed(v, l.market)) fixed = true;
  }
  return any ? { usd: sum, fixed } : null;
}

const supplyProv = (r: CompoundV2SupplyAmount) =>
  r.current != null ? positionSupplyCurrentProv(r.symbol, r.cSymbol) : positionSupplyPrincipalProv(r.symbol);

/** Debt-line provenance: the live borrowBalanceStored lane when the detail
 *  page's chain read upgraded this row, the emitted-accountBorrows lane
 *  otherwise. */
const borrowProv = (r: CompoundV2BorrowAmount) => {
  const m = COMPOUND_V2_MARKET_BY_KEY[r.market];
  return r.live ? compoundV2LiveDebtProv(r.symbol, r.cSymbol, m?.ctoken) : positionDebtProv(r.symbol);
};

/** "price fixed, no feed" — the inline flag on a line whose oracle price is a
 *  stored constant (the markets view's wording, carried across surfaces). */
function FixedPriceFlag({ symbol }: { symbol: string }) {
  return (
    <span className="ml-1">
      · <Prov info={fixedPriceLineProv(symbol)}>price fixed, no feed</Prov>
    </span>
  );
}

/** Per-market token amounts, demoted beneath the USD headline — still the
 *  strict chain reads (each line traced, exact figure on hover). The exact hover
 *  figure is the lane the line's provenance asserts: the raw cToken balance on
 *  a current-value line, the raw principal on a principal line. Lines are
 *  keyed by MARKET (two markets share WBTC's underlying address). */
function SupplyFootnoteLines({ v }: { v: CompoundV2PositionView }) {
  if (v.supplies.length === 0) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500 tabular-nums space-y-0.5">
      {v.supplies.map((r) => {
        const exact =
          r.current != null ? `${formatUnitsExact(r.cTokensRaw, 8)} ${r.cSymbol}` : `${r.principal} ${r.symbol}`;
        return (
          <div key={r.market}>
            <Prov info={supplyProv(r)}>
              <span title={exact} data-prov-exact={exact} data-prov-symbol={r.symbol}>
                {formatCompact(supplyAmount(r))} {r.symbol}
              </span>
            </Prov>
            {isFixed(v, r.market) && <FixedPriceFlag symbol={r.symbol} />}
          </div>
        );
      })}
    </div>
  );
}

function BorrowFootnoteLines({ v }: { v: CompoundV2PositionView }) {
  if (v.borrows.length === 0) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500 tabular-nums space-y-0.5">
      {v.borrows.map((r) => {
        const exact = formatUnitsExact(r.amountRaw, r.decimals);
        return (
          <div key={r.market}>
            <Prov info={borrowProv(r)}>
              <span title={`${exact} ${r.symbol}`} data-prov-exact={exact} data-prov-symbol={r.symbol}>
                {formatCompact(r.amount)} {r.symbol}
              </span>
            </Prov>
            {isFixed(v, r.market) && <FixedPriceFlag symbol={r.symbol} />}
          </div>
        );
      })}
    </div>
  );
}

/** "incl. $X interest" — accrued interest already included in the column's
 *  figure above (it grew it), computed with the strict attribution gates
 *  (computeCompoundV2CardCaptions). Hidden below a cent. */
function InterestCaption({
  side,
  usd,
  live,
}: {
  side: "supply" | "debt";
  usd: number | null | undefined;
  /** Debt side only: the current figure is the live borrowBalanceStored. */
  live?: boolean;
}) {
  if (usd == null || usd < 0.01) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500">
      incl. <Prov info={compoundV2InterestCaptionProv(side, live)}>{formatUsd(usd)}</Prov> interest
    </div>
  );
}

/** "X% borrow rate" — the live per-block rate (annualized on the market's own
 *  model) on the single borrowed market, or the debt-USD-weighted average. */
function BorrowRateCaption({ rate }: { rate: CompoundV2CardCaptions["borrowRate"] | undefined }) {
  if (!rate) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500">
      <Prov info={rate.avg ? avgBorrowRateProv() : borrowRateProv(rate.symbol)}>{rate.pct.toFixed(2)}%</Prov>{" "}
      {rate.avg ? "avg borrow rate" : "borrow rate"}
    </div>
  );
}

/** A vertical stack of the wallet's supplied markets, each traced. */
function SupplyStack({ v }: { v: CompoundV2PositionView }) {
  if (v.supplies.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {v.supplies.map((r) => (
        <StatValue key={r.market}>
          <Prov info={supplyProv(r)}>
            <AssetAmount
              value={supplyAmount(r)}
              symbol={r.symbol}
              exact={r.current != null ? `${formatUnitsExact(r.cTokensRaw, 8)} ${r.cSymbol}` : String(r.principal)}
            />
          </Prov>
        </StatValue>
      ))}
    </div>
  );
}

function BorrowStack({ v }: { v: CompoundV2PositionView }) {
  if (v.borrows.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {v.borrows.map((r) => (
        <StatValue key={r.market}>
          <Prov info={borrowProv(r)}>
            <AssetAmount value={r.amount} symbol={r.symbol} exact={formatUnitsExact(r.amountRaw, r.decimals)} />
          </Prov>
        </StatValue>
      ))}
    </div>
  );
}

/** A vertical stack of per-market PEAK amounts (highest recorded), each traced
 *  to its own lane's maximum (principal-after on supply, emitted accountBorrows
 *  on debt); no USD — the replayed token amount only. */
function PeakStack({ lines, side }: { lines: CompoundV2PeakAmount[]; side: "supply" | "debt" }) {
  if (lines.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {lines.map((r) => (
        <StatValue key={r.market}>
          <Prov info={side === "supply" ? peakSupplyProv(r.symbol) : peakDebtProv(r.symbol)}>
            <AssetAmount value={r.amount} symbol={r.symbol} exact={formatUnitsExact(r.amountRaw, r.decimals)} />
          </Prov>
        </StatValue>
      ))}
    </div>
  );
}

export function CompoundV2PositionCard({
  v,
  receipts = false,
  rowExtra,
  explanation,
  viewHref,
  captions,
}: {
  v: CompoundV2PositionView;
  receipts?: boolean;
  /** Context content riding the shell's heading-button row. */
  rowExtra?: React.ReactNode;
  /** The card's Explanation section (narration describing the position NOW). */
  explanation?: React.ReactNode;
  /** Copy-this-view control, forwarded straight through to `PositionCardShell`
   *  — the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** Detail-page stat captions (accrued interest, borrow rate) — computed from
   *  the event stream + the per-market chain read
   *  (computeCompoundV2CardCaptions). Listing cards omit them. */
  captions?: CompoundV2CardCaptions;
}) {
  const collUsd = totalUsd(
    v,
    v.supplies.map((r) => ({ market: r.market, amount: supplyAmount(r) })),
  );
  const debtUsd = totalUsd(
    v,
    v.borrows.map((r) => ({ market: r.market, amount: r.amount })),
  );
  // `receipts` is the render-site switch (listing defaults false; only the
  // detail page passes it) — computed here (not just below) because the
  // reserve-list disclosure hooks must run on every render, before the
  // closed/liquidated early return. A priced side's list only exists on the
  // detail page (the footnote lines); an unpriced side's list is the
  // headline itself and collapses on every surface.
  const isDetail = receipts;
  const supplyListCount = collUsd == null ? v.supplies.length : isDetail ? v.supplies.length : 0;
  const debtListCount = debtUsd == null ? v.borrows.length : isDetail ? v.borrows.length : 0;
  const supplyDisclosure = useReserveDisclosure(supplyListCount);
  const debtDisclosure = useReserveDisclosure(debtListCount);

  // Closed / liquidated: the wallet holds no open markets, so the headline is
  // what each asset held at its height — highest recorded per-market supply +
  // debt (replayed MAX over the wallet's life, per asset; no USD). The
  // LIQUIDATED outcome appears only here: an open survivor never reaches this
  // branch, however many liquidations its meta cluster counts.
  if (v.status === "closed" || v.status === "liquidated") {
    return (
      <PositionCardShell
        receipts={receipts}
        explanation={explanation}
        viewHref={viewHref}
        learnMore={compoundV2PositionContent({ status: v.status })}
      >
        <ClosedPositionStats
          outcome={v.status}
          leadingIdentity={
            <WalletPill wallet={v.wallet} ensName={null} filterProtocol="compound-v2" bookmarkProtocol="compound-v2" />
          }
          identity={
            <PositionCardMeta
              lastActivityAt={v.lastActivityAt}
              eventCount={v.txCount}
              liquidationCount={v.liquidationCount}
            />
          }
          closedAt={v.lastActivityAt}
          collateral={<PeakStack lines={v.peakSupplies} side="supply" />}
          debt={<PeakStack lines={v.peakBorrows} side="debt" />}
        />
      </PositionCardShell>
    );
  }

  // Detail render (receipts): a neutral mode-word pill (what the account is
  // doing NOW), plus the wallet pill. The LISTING render keeps the lifecycle
  // pill; the wallet pill (facehash + copy + bookmark) renders on both surfaces.
  const modeWord = v.borrows.length > 0 ? "Borrowing" : "Supply only";
  // `isDetail` (== `receipts`) doubles as the surface discriminator: the
  // listing omits the per-leg lines (V4 spoke-card parity — USD headline +
  // capped cluster only), the detail page keeps the full traced list.

  return (
    <PositionCardShell
      receipts={receipts}
      rowExtra={rowExtra}
      explanation={explanation}
      viewHref={viewHref}
      learnMore={compoundV2PositionContent({ status: v.status, hasDebt: v.borrows.length > 0 })}
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
        leadingIdentity={
          <WalletPill wallet={v.wallet} ensName={null} filterProtocol="compound-v2" bookmarkProtocol="compound-v2" />
        }
        identity={
          <PositionCardMeta
            lastActivityAt={v.lastActivityAt}
            eventCount={v.txCount}
            liquidationCount={v.liquidationCount}
          />
        }
        columns={[
          // ONE oracle-USD figure leads each side (the asset cluster carries
          // the identities), the per-market token amounts demote to traced
          // footnote lines. When any contributing market is unpriced the token
          // stack stays the headline — a partial USD total is never asserted.
          {
            label: CARD_VOCAB.collateral,
            assetIcons:
              v.supplies.length > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <InlineAssetCluster symbols={v.supplies.map((r) => r.symbol)} />
                  <ReserveDisclosureToggle disclosure={supplyDisclosure} count={v.supplies.length} />
                </span>
              ) : undefined,
            value:
              collUsd != null ? (
                <UsdHeadline usd={collUsd.usd} info={compoundV2UsdProvOnchain("Collateral", collUsd.fixed)} />
              ) : supplyDisclosure.collapsible ? null : (
                <SupplyStack v={v} />
              ),
            footnote: (
              <>
                {collUsd == null && supplyDisclosure.collapsible && (
                  <ReserveDisclosureList disclosure={supplyDisclosure}>
                    <SupplyStack v={v} />
                  </ReserveDisclosureList>
                )}
                {isDetail && collUsd != null && (
                  <ReserveDisclosureList disclosure={supplyDisclosure}>
                    <SupplyFootnoteLines v={v} />
                  </ReserveDisclosureList>
                )}
                <InterestCaption side="supply" usd={captions?.supplyInterestUsd} />
              </>
            ),
          },
          {
            label: CARD_VOCAB.debt,
            assetIcons:
              v.borrows.length > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <InlineAssetCluster symbols={v.borrows.map((r) => r.symbol)} />
                  <ReserveDisclosureToggle disclosure={debtDisclosure} count={v.borrows.length} />
                </span>
              ) : undefined,
            value:
              debtUsd != null ? (
                <UsdHeadline usd={debtUsd.usd} info={compoundV2UsdProvOnchain("Borrowed", debtUsd.fixed)} />
              ) : debtDisclosure.collapsible ? null : (
                <BorrowStack v={v} />
              ),
            footnote: (
              <>
                {debtUsd == null && debtDisclosure.collapsible && (
                  <ReserveDisclosureList disclosure={debtDisclosure}>
                    <BorrowStack v={v} />
                  </ReserveDisclosureList>
                )}
                {isDetail && debtUsd != null && (
                  <ReserveDisclosureList disclosure={debtDisclosure}>
                    <BorrowFootnoteLines v={v} />
                  </ReserveDisclosureList>
                )}
                <BorrowRateCaption rate={captions?.borrowRate} />
                <InterestCaption
                  side="debt"
                  usd={captions?.debtInterestUsd}
                  live={v.borrows.length > 0 && v.borrows.every((b) => b.live)}
                />
              </>
            ),
          },
          // No health column on the CARD: the risk layer rides the detail
          // page's live Comptroller read (runway + capacity + verdict); the
          // listing snapshot carries none, so listing cards simply don't
          // assert the layer (never dashed, never staled).
        ]}
      />
    </PositionCardShell>
  );
}

/** Build a card view from the listing summary row. */
export function viewFromSummary(s: CompoundV2PositionSummary): CompoundV2PositionView {
  return {
    wallet: s.wallet,
    status: s.status,
    everLiquidated: s.everLiquidated,
    supplies: s.supplies,
    borrows: s.borrows,
    peakSupplies: s.peakSupplies,
    peakBorrows: s.peakBorrows,
    liquidationCount: s.liquidationCount,
    txCount: s.txCount,
    lastActivityAt: s.lastActivityAt,
    priceByMarket: s.priceByMarket,
    priceFixedByMarket: s.priceFixedByMarket,
    ratesByMarket: s.ratesByMarket,
  };
}
