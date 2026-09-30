"use client";

// Dolomite position card — one Account.Info, through the SAME shared grammar
// (OpenPositionStats + StatValue) as the other explorers.
//
// THE GRAIN IS THE PAIR: the card is one (owner, accountNumber), never an
// owner. Dolomite is cross-margin WITHIN an account number and isolated
// ACROSS them — one card per owner would assert a single collateralisation
// across accounts that are independently liquidated. The identity row carries
// Dolomite's own vocabulary: account 0 is the owner's "Dolomite Balance";
// every other number is an isolated "Borrow Position".
//
// The two sides are ONE lane read two ways, and the provenance names each
// basis: par (the emitted absolute, = the getAccountPar slot) × the market's
// CURRENT index = the token amount including interest — rendered when the
// market-state read landed, the par figure otherwise (labeled par, never
// principal: par is a SCALED balance and interest lives in the index). A
// negative balance IS debt — the core has no Borrow action.
//
// STATUS IS TWO-AXIS. The lifecycle pill says open/closed/liquidated, where
// 'liquidated' names only a CLOSED account; an OPEN account that has been
// liquidated stays an OPEN card with the meta cluster's count. The detail
// render swaps the lifecycle pill for the mode word (Lending / Borrowing).
//
// USD keys by MARKET ID (Dolomite's own key — symbols collide on this
// roster), priced by the core's own getMarketPrice.

import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { StatValue, StatDash } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { TokenAmountNotLoaded, loadedSymbols } from "@/components/shared/not-loaded";
import { WalletPill } from "@/components/shared/wallet-pill";
import { formatUnitsExact, formatCompact } from "@/lib/utils/format";
import { Prov } from "@/components/shared/provenance";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import {
  positionCurrentProv,
  positionParProv,
  dolomiteUsdProv,
  dolomitePeakParProv,
  dolomitePeakTokenProv,
  borrowRateProv,
  avgBorrowRateProv,
} from "@/lib/dolomite/event-provenance";
import type { DolomiteCardCaptions } from "@/lib/dolomite/economics";
import type { LiquidationStory } from "@/lib/shared/ctoken-liquidation-story";
import { dolomitePositionContent } from "@/lib/dolomite/position-content";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { LifecyclePill, UsdHeadline } from "@/components/shared/position-card-pills";
import type {
  DolomitePositionSummary,
  DolomiteBalanceAmount,
  DolomitePeakAmount,
} from "@/lib/sources/api/dolomite-positions";
import { ExactSpan } from "@/components/shared/amount-text";
import { RevealTip } from "@/components/shared/reveal-tip";
import { accountLabelTip } from "@/lib/dolomite/asset-catalog";
import { splitDust, useDustLines } from "@/components/shared/dust-reserves";

export interface DolomitePositionView {
  owner: string;
  /** uint256 — canonical decimal STRING. */
  accountNumber: string;
  accountLabel: string;
  isDolomiteBalance: boolean;
  status: "open" | "closed" | "liquidated";
  /** The orthogonal liquidation flag — true on open survivors too. */
  everLiquidated: boolean;
  supplies: DolomiteBalanceAmount[];
  borrows: DolomiteBalanceAmount[];
  /** Highest recorded per-market par (closed/liquidated cards). */
  peakSupplies: DolomitePeakAmount[];
  peakBorrows: DolomitePeakAmount[];
  liquidationCount: number;
  /** The owner's transactions (the index leaves out each liquidation, which is
   *  the liquidator's transaction). */
  txCount: number;
  /** The account's rows on the timeline, when the page knows the whole
   *  history: the count's tip gives both figures. */
  eventTotal?: number;
  lastActivityAt: number;
  /** The core's own oracle USD per whole token, keyed by MARKET ID string. */
  priceByMarket?: Record<string, number>;
  /** Live APRs per market id (percent). */
  ratesByMarket?: Record<string, { borrowAprPct: number | null; supplyAprPct: number | null }>;
  /** What each liquidation did, read from the rows (a page holding the whole
   *  history only). */
  liquidations?: LiquidationStory[];
}

/** The figure a line asserts: the current token amount (par × current index,
 *  interest included) when the market-state read landed; the par otherwise. */
const legAmount = (r: DolomiteBalanceAmount): number => r.current ?? r.par;

/** The core's oracle USD for one line; null when unpriced. */
function lineUsd(v: DolomitePositionView, marketId: number, amount: number): number | null {
  const p = v.priceByMarket?.[String(marketId)];
  return typeof p === "number" && p > 0 ? amount * p : null;
}

/** A line's oracle USD for the dust rule (components/shared/dust-reserves);
 *  null (held) where unpriced or its decimals were not read. */
const dustUsdOf =
  (v: DolomitePositionView) =>
  (r: DolomiteBalanceAmount): number | null =>
    r.decimalsUnread ? null : lineUsd(v, r.marketId, legAmount(r));

/** Total USD across one side, with the STRICT guard: null the moment any
 *  contributing market is unpriced, so a partial total is never asserted. */
function totalUsd(v: DolomitePositionView, lines: DolomiteBalanceAmount[]): number | null {
  let sum = 0;
  let any = false;
  for (const l of lines) {
    if (l.decimalsUnread) return null;
    const amount = legAmount(l);
    if (amount <= 0) continue;
    const u = lineUsd(v, l.marketId, amount);
    if (u == null) return null;
    sum += u;
    any = true;
  }
  return any ? sum : null;
}

const legProv = (r: DolomiteBalanceAmount, side: "supply" | "debt") =>
  r.current != null ? positionCurrentProv(r.symbol, side) : positionParProv(r.symbol, side);

/** The exact hover figure — the lane the line's provenance asserts. */
const legExact = (r: DolomiteBalanceAmount): string =>
  r.current != null && r.currentRaw != null
    ? formatUnitsExact(r.currentRaw, r.decimals)
    : `${formatUnitsExact(r.parRaw.replace("-", ""), r.decimals)} (par)`;

/** Per-market token amounts, demoted beneath the USD headline — still the
 *  strict chain reads (each line traced, exact figure on hover). Keyed by MARKET ID
 *  (symbols collide on this roster: rUSD/srUSD/wsrUSD/cUSD/stcUSD). */
function FootnoteLines({ v, side }: { v: DolomitePositionView; side: "supply" | "debt" }) {
  const all = side === "supply" ? v.supplies : v.borrows;
  const { lines, control } = useDustLines(all, dustUsdOf(v));
  if (all.length === 0) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500 tabular-nums space-y-0.5">
      {lines.map((r) => (
        <div key={r.marketId}>
          {r.decimalsUnread ? (
            <TokenAmountNotLoaded label={r.symbol} />
          ) : (
            <Prov info={legProv(r, side)}>
              <ExactSpan exact={legExact(r)} symbol={r.symbol}>
                {formatCompact(legAmount(r))} {r.symbol}
              </ExactSpan>
            </Prov>
          )}
        </div>
      ))}
      {control}
    </div>
  );
}

/** "X% borrow rate" — the live per-second rate (annualized) on the single
 *  borrowed market, or the debt-USD-weighted average. */
function BorrowRateCaption({ rate }: { rate: DolomiteCardCaptions["borrowRate"] | undefined }) {
  if (!rate) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500">
      <Prov info={rate.avg ? avgBorrowRateProv() : borrowRateProv(rate.symbol)}>{rate.pct.toFixed(2)}%</Prov>{" "}
      {rate.avg ? "avg borrow rate" : "borrow rate"}
    </div>
  );
}

/** A vertical stack of one side's balances, each traced. */
function LegStack({ v, side }: { v: DolomitePositionView; side: "supply" | "debt" }) {
  const all = side === "supply" ? v.supplies : v.borrows;
  const { lines, control } = useDustLines(all, dustUsdOf(v));
  if (all.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {lines.map((r) => (
        <StatValue key={r.marketId}>
          <Prov info={legProv(r, side)}>
            {r.decimalsUnread ? (
              <TokenAmountNotLoaded label={r.symbol} />
            ) : (
              <AssetAmount value={legAmount(r)} symbol={r.symbol} exact={legExact(r)} />
            )}
          </Prov>
        </StatValue>
      ))}
      {control}
    </div>
  );
}

/** A vertical stack of per-market PEAK amounts (highest recorded PAR — the
 *  scaled balance, labeled so on hover), each traced; no USD (the oracle
 *  prices the present, not history). */
function PeakStack({ lines, side }: { lines: DolomitePeakAmount[]; side: "supply" | "debt" }) {
  if (lines.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {lines.map((r) => (
        <StatValue key={r.marketId}>
          <Prov info={r.tokens ? dolomitePeakTokenProv(r.symbol, side) : dolomitePeakParProv(r.symbol, side)}>
            {r.decimalsUnread ? (
              <TokenAmountNotLoaded label={r.symbol} />
            ) : (
              <AssetAmount
                value={r.amount}
                symbol={r.symbol}
                exact={
                  r.tokens
                    ? formatUnitsExact(r.amountRaw, r.decimals)
                    : `${formatUnitsExact(r.amountRaw, r.decimals)} (par: multiply by the market's interest index for tokens)`
                }
              />
            )}
          </Prov>
        </StatValue>
      ))}
    </div>
  );
}

/** An account's name that explains the account number on hover or tap: the
 *  card header and a transfer row's other account carry the same tip. The
 *  tip is a paragraph, so it wraps at a fixed width. */
export function DolomiteAccountLabel({ text, accountNumber }: { text: string; accountNumber: string }) {
  const tip = accountLabelTip(accountNumber);
  return (
    <RevealTip
      tip={<span className="block w-72 whitespace-normal text-left font-normal normal-nums leading-snug">{tip}</span>}
      label={`${text}: ${tip}`}
      focusable
      className="focus-ring rounded-sm"
    >
      <span className="underline decoration-dotted decoration-rb-400 underline-offset-2">{text}</span>
    </RevealTip>
  );
}

/** The account-grain identity: the owner (address) + which of its accounts
 *  this is, in Dolomite's own vocabulary. On the detail page the label
 *  explains itself on hover or tap (the listing card sits inside a link). */
function AccountIdentity({ v, tip }: { v: DolomitePositionView; tip?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <WalletPill wallet={v.owner} ensName={null} filterProtocol="dolomite" bookmarkProtocol="dolomite" />
      <span className="text-xs text-rb-500">
        {tip ? <DolomiteAccountLabel text={v.accountLabel} accountNumber={v.accountNumber} /> : v.accountLabel}
      </span>
    </span>
  );
}

export function DolomitePositionCard({
  v,
  receipts = false,
  rowExtra,
  explanation,
  viewHref,
  captions,
}: {
  v: DolomitePositionView;
  receipts?: boolean;
  /** Context content riding the shell's heading-button row. */
  rowExtra?: React.ReactNode;
  /** The card's Explanation section (narration describing the account NOW). */
  explanation?: React.ReactNode;
  /** Copy-this-view control, forwarded straight through to `PositionCardShell`
   *  — the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** Detail-page stat captions (borrow rate) — from the market-state read.
   *  Listing cards omit them. */
  captions?: DolomiteCardCaptions;
}) {
  const collUsd = totalUsd(v, v.supplies);
  const debtUsd = totalUsd(v, v.borrows);
  // Dust lines (under a cent) leave the icon stack and its "+N"; the lines
  // put them behind the "N dust reserves hidden" control.
  const suppliesShown = splitDust(v.supplies, dustUsdOf(v)).shown;
  const borrowsShown = splitDust(v.borrows, dustUsdOf(v)).shown;

  // Closed / liquidated: every par is back at zero, so the headline is what
  // each market lane held at its height — the highest recorded par (no USD:
  // the oracle prices the PRESENT, not history). The LIQUIDATED outcome
  // appears only here: an open survivor never reaches this branch, however
  // many liquidations its meta cluster counts.
  if (v.status === "closed" || v.status === "liquidated") {
    return (
      <PositionCardShell
        receipts={receipts}
        explanation={explanation}
        viewHref={viewHref}
        learnMore={dolomitePositionContent({
          status: v.status,
          peaksInTokens: [...v.peakSupplies, ...v.peakBorrows].every((r) => r.tokens),
          liquidations: v.liquidations,
          liquidationCount: v.liquidationCount,
        })}
      >
        <ClosedPositionStats
          outcome={v.status}
          leadingIdentity={<AccountIdentity v={v} tip={receipts} />}
          identity={
            <PositionCardMeta
              lastActivityAt={v.lastActivityAt}
              eventCount={v.txCount}
              eventTotal={v.eventTotal}
              countNote={dolomiteCountNote(v.liquidationCount)}
              liquidationCount={v.liquidationCount}
            />
          }
          closedAt={v.lastActivityAt}
          outcomeDates={outcomeDates(v)}
          collateral={<PeakStack lines={v.peakSupplies} side="supply" />}
          debt={<PeakStack lines={v.peakBorrows} side="debt" />}
        />
      </PositionCardShell>
    );
  }

  // Detail render (receipts): a neutral mode-word pill — Lending / Borrowing,
  // what the account is doing NOW. The LISTING render keeps the lifecycle
  // pill (the whole card sits inside a row <Link>).
  const modeWord = v.borrows.length > 0 ? "Borrowing" : "Lending";
  // `receipts` is the render-site switch (listing defaults false; only the
  // detail page passes it), so it doubles as the surface discriminator: the
  // listing omits the per-leg lines (V4 spoke-card parity — USD headline +
  // capped cluster only), the detail page keeps the full traced list.
  const isDetail = receipts;

  return (
    <PositionCardShell
      receipts={receipts}
      rowExtra={rowExtra}
      explanation={explanation}
      viewHref={viewHref}
      learnMore={dolomitePositionContent({ status: v.status, hasDebt: v.borrows.length > 0 })}
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
        leadingIdentity={<AccountIdentity v={v} tip={receipts} />}
        identity={
          <PositionCardMeta
            lastActivityAt={v.lastActivityAt}
            eventCount={v.txCount}
            eventTotal={v.eventTotal}
            countNote={dolomiteCountNote(v.liquidationCount)}
            liquidationCount={v.liquidationCount}
          />
        }
        columns={[
          // ONE oracle-USD figure leads each side; the per-market token
          // amounts demote to traced footnote lines. When any contributing
          // market is unpriced the token stack stays the headline — a partial
          // USD total is never asserted.
          {
            label: CARD_VOCAB.collateral,
            assetIcons:
              v.supplies.length > 0 ? <InlineAssetCluster symbols={loadedSymbols(suppliesShown)} /> : undefined,
            value:
              collUsd != null ? (
                <UsdHeadline usd={collUsd} info={dolomiteUsdProv("Collateral")} />
              ) : (
                <LegStack v={v} side="supply" />
              ),
            footnote: isDetail && collUsd != null ? <FootnoteLines v={v} side="supply" /> : undefined,
          },
          {
            label: CARD_VOCAB.debt,
            assetIcons: v.borrows.length > 0 ? <InlineAssetCluster symbols={loadedSymbols(borrowsShown)} /> : undefined,
            value:
              debtUsd != null ? (
                <UsdHeadline usd={debtUsd} info={dolomiteUsdProv("Borrowed")} />
              ) : (
                <LegStack v={v} side="debt" />
              ),
            footnote: (
              <>
                {isDetail && debtUsd != null && <FootnoteLines v={v} side="debt" />}
                <BorrowRateCaption rate={captions?.borrowRate} />
              </>
            ),
          },
          // No health column on the CARD: the risk layer rides the detail
          // page's live core read (runway + margin card + verdict); the
          // listing snapshot carries none, so listing cards simply don't
          // assert the layer.
        ]}
      />
    </PositionCardShell>
  );
}

/** Why the transaction count and the event count differ. The index counts
 *  the account's transactions with its liquidations left out (each is the
 *  liquidator's transaction; the triangle counts them). */
function dolomiteCountNote(liquidations: number): string {
  if (liquidations === 1)
    return "the count leaves out the liquidation (the triangle counts it), which writes two rows here";
  return liquidations > 1
    ? `the count leaves out the ${liquidations} liquidations (the triangle counts them), and each writes two rows here`
    : "one transaction can write a row per market it moves";
}

/** A liquidated card's two dates: the last liquidation, then the closing,
 *  when they fall on different days. */
function outcomeDates(v: DolomitePositionView): { label: string; at: number }[] | undefined {
  const last = v.liquidations?.at(-1)?.at;
  if (v.status !== "liquidated" || last == null) return undefined;
  if (Math.floor(last / 86400) === Math.floor(v.lastActivityAt / 86400)) return undefined;
  return [
    { label: "Liquidated", at: last },
    { label: "Closed", at: v.lastActivityAt },
  ];
}

/** Build a card view from the listing summary row. */
export function viewFromSummary(s: DolomitePositionSummary): DolomitePositionView {
  return {
    owner: s.owner,
    accountNumber: s.accountNumber,
    accountLabel: s.accountLabel,
    isDolomiteBalance: s.isDolomiteBalance,
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
    ratesByMarket: s.ratesByMarket,
  };
}
