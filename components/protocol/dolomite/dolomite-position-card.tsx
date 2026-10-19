"use client";

// Dolomite position card: one Account.Info, as a slot builder for the shared
// position card (components/shared/position-card.tsx; rails-ops
// TO-DO-position-card 322).
//
// THE GRAIN IS THE PAIR: the card is one (owner, accountNumber), never an
// owner. Dolomite is cross-margin WITHIN an account number and isolated
// ACROSS them — one card per owner would assert a single collateralisation
// across accounts that are independently liquidated. The identity slot carries
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
// STATUS IS TWO-AXIS. The tag says Closed or Liquidated, where 'liquidated'
// names only a CLOSED account; an OPEN account that has been liquidated stays
// an OPEN card with the counters' warning count.
//
// USD keys by MARKET ID (Dolomite's own key — symbols collide on this
// roster), priced by the core's own getMarketPrice.

import { ListingTag } from "@/components/shared/listing-tag";
import {
  PositionCard,
  type PositionCardExports,
  type PositionCardHead,
  type PositionCardOutcome,
  type PositionCardSlots,
  type PositionCardStatus,
  type PositionPanelRow,
} from "@/components/shared/position-card";
import { AssetAmount } from "@/components/shared/asset-amount";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import type { AssetBreakdown } from "@/components/shared/asset-donut";
import { TokenAmountNotLoaded, loadedSymbols } from "@/components/shared/not-loaded";
import { WalletPill } from "@/components/shared/wallet-pill";
import { formatUnitsExact } from "@/lib/utils/format";
import { Prov, type Provenance } from "@/components/shared/provenance";
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
import { formatUsd } from "@/lib/shared/format-event";
import type {
  DolomitePositionSummary,
  DolomiteBalanceAmount,
  DolomitePeakAmount,
} from "@/lib/sources/api/dolomite-positions";
import type { DolomiteChainResponse } from "@/lib/api/fetch-dolomite-position";
import { ExactSpan } from "@/components/shared/amount-text";
import { RevealTip } from "@/components/shared/reveal-tip";
import { accountLabelTip } from "@/lib/dolomite/asset-catalog";
import { splitDust, useDustLines } from "@/components/shared/dust-reserves";
import { DolomiteMenuRows } from "@/components/protocol/dolomite/dolomite-menu-rows";
import {
  DolomiteMarginRatio,
  dolomiteHasRisk,
  dolomiteRiskRows,
} from "@/components/protocol/dolomite/dolomite-risk-slot";
import { formatCompact } from "@/lib/shared/format-compact";

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

/** One side's balances as lines in the figure type, each traced, for a head whose
 *  USD total is not stated (a market on the side is unpriced). Keyed by MARKET ID
 *  (symbols collide on this roster: rUSD/srUSD/wsrUSD/cUSD/stcUSD). */
function LegLines({ lines, side }: { lines: DolomiteBalanceAmount[]; side: "supply" | "debt" }) {
  return (
    <span className="flex flex-col gap-1">
      {lines.map((r) => (
        <Prov key={r.marketId} info={legProv(r, side)}>
          {r.decimalsUnread ? (
            <TokenAmountNotLoaded label={r.symbol} />
          ) : (
            <AssetAmount value={legAmount(r)} symbol={r.symbol} exact={legExact(r)} address={r.token} />
          )}
        </Prov>
      ))}
    </span>
  );
}

/** A closed card's per-market PEAK amounts (highest recorded PAR, the scaled
 *  balance, labeled so on hover), each traced; no USD (the oracle prices only
 *  the present). */
function PeakLines({ lines, side }: { lines: DolomitePeakAmount[]; side: "supply" | "debt" }) {
  return (
    <span className="flex flex-col gap-1">
      {lines.map((r) => (
        <Prov
          key={r.marketId}
          info={r.tokens ? dolomitePeakTokenProv(r.symbol, side) : dolomitePeakParProv(r.symbol, side)}
        >
          {r.decimalsUnread ? (
            <TokenAmountNotLoaded label={r.symbol} />
          ) : (
            <AssetAmount
              value={r.amount}
              symbol={r.symbol}
              address={r.token}
              exact={
                r.tokens
                  ? formatUnitsExact(r.amountRaw, r.decimals)
                  : `${formatUnitsExact(r.amountRaw, r.decimals)} (par: multiply by the market's interest index for tokens)`
              }
            />
          )}
        </Prov>
      ))}
    </span>
  );
}

/** The oracle-USD figure that leads a side, with its exact dollars on hover. */
function UsdFigure({ usd, info }: { usd: number; info: Provenance }) {
  return (
    <RevealTip tip={"$" + usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}>
      <Prov info={info}>{formatUsd(usd)}</Prov>
    </RevealTip>
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
 *  explains itself on hover or tap (the listing card sits inside a link), and
 *  the owner is on the page's wallet row above the card (ui-jobs 228). */
function AccountIdentity({ v, tip }: { v: DolomitePositionView; tip?: boolean }) {
  // The listing keeps the wallet alone on the left; the account's name is the
  // card's right-end `tag`.
  if (!tip) {
    return <WalletPill wallet={v.owner} ensName={null} filterProtocol="dolomite" bookmarkProtocol="dolomite" />;
  }
  return (
    <span className="flex items-center gap-2">
      <span className="text-xs text-rb-500">
        {tip ? <DolomiteAccountLabel text={v.accountLabel} accountNumber={v.accountNumber} /> : v.accountLabel}
      </span>
    </span>
  );
}

export interface DolomitePositionCardProps {
  v: DolomitePositionView;
  /** `detail` on the account page (receipts, panel, (i)); `listing` in a row. */
  surface: "detail" | "listing";
  /** The page's live core read. Its margin ratio is the third headline, and its
   *  liquidation line and drop are panel rows. */
  chain?: DolomiteChainResponse | null;
  /** The core read is still in flight: the margin ratio waits behind a pulsing bar. */
  chainPending?: boolean;
  /** The card's Explanation section (narration describing the account NOW). */
  explanation?: React.ReactNode;
  /** The pane's copy-this-view link: the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** Detail-page captions (borrow rate), from the market-state read. */
  captions?: DolomiteCardCaptions;
  /** The ⋮'s export shapes. `null`: the ⋮ holds the account's rows and the
   *  provenance row alone. */
  exports?: PositionCardExports | null;
}

/** The Dolomite account's slots for the shared position card: the three
 *  headlines, the panel, the tag, the ⋮ and the counters, from the account's
 *  view and the page's live read. */
export function useDolomiteCardSlots({
  v,
  surface,
  chain,
  chainPending = false,
  explanation,
  viewHref,
  captions,
  exports,
}: DolomitePositionCardProps): PositionCardSlots {
  const detail = surface === "detail";
  const usdOf = dustUsdOf(v);
  // Dust lines (under a cent) leave the icon stack and its "+N"; the panel puts
  // them behind the "N dust reserves hidden" control.
  const supplyLines = useDustLines(v.supplies, usdOf);
  const borrowLines = useDustLines(v.borrows, usdOf);
  const collUsd = totalUsd(v, v.supplies);
  const debtUsd = totalUsd(v, v.borrows);
  const suppliesShown = splitDust(v.supplies, usdOf).shown;
  const borrowsShown = splitDust(v.borrows, usdOf).shown;

  const status: PositionCardStatus | null =
    v.status === "liquidated"
      ? { word: "Liquidated", tone: "danger" }
      : v.status === "closed"
        ? { word: "Closed", tone: "muted" }
        : null;
  const counters = {
    lastActivityAt: v.lastActivityAt,
    eventCount: v.txCount,
    eventTotal: v.eventTotal,
    countNote: dolomiteCountNote(v.liquidationCount),
    liquidationCount: v.liquidationCount,
    // The foot strip reads transactions, warnings, then the age (ui-jobs 270).
    ...(detail ? { order: "age-last" as const } : {}),
  };
  const common = { status, identity: <AccountIdentity v={v} tip={detail} />, counters };
  const borrowId = /^Borrow Position #(.+)$/.exec(v.accountLabel)?.[1];
  // The WLFI frontend's shared account reads by its frontend alone.
  const tagMarket = /\(WLFI frontend account\)/.test(v.accountLabel) ? "WLFI" : v.accountLabel;
  const tag = borrowId ? <ListingTag id={borrowId} /> : <ListingTag market={tagMarket} />;

  // Closed / liquidated: every par is back at zero, so the heads are what each
  // market lane held at its height, the highest recorded par. The LIQUIDATED
  // outcome appears only here: an open survivor never reaches this branch,
  // however many liquidations its meta cluster counts.
  let heads: PositionCardHead[];
  let outcome: PositionCardOutcome | undefined;
  if (v.status !== "open") {
    heads = [
      {
        id: "peak-collateral",
        label: CARD_VOCAB.peakCollateral,
        value: v.peakSupplies.length > 0 ? <PeakLines lines={v.peakSupplies} side="supply" /> : null,
      },
      {
        id: "peak-debt",
        label: CARD_VOCAB.peakDebt,
        value: v.peakBorrows.length > 0 ? <PeakLines lines={v.peakBorrows} side="debt" /> : null,
      },
    ];
    outcome = {
      word: v.status === "liquidated" ? "Liquidated" : "Closed",
      dates: outcomeDates(v) ?? (v.lastActivityAt ? [{ at: v.lastActivityAt }] : undefined),
    };
  } else {
    // ONE oracle-USD figure leads each side; the per-market token amounts are
    // panel rows. When any contributing market is unpriced the token lines stay
    // the headline: a partial USD total is never asserted.
    heads = [
      {
        id: "collateral",
        label: CARD_VOCAB.collateral,
        value:
          collUsd != null ? (
            <UsdFigure usd={collUsd} info={dolomiteUsdProv("Collateral")} />
          ) : v.supplies.length > 0 ? (
            <LegLines lines={supplyLines.lines} side="supply" />
          ) : null,
        total: collUsd != null ? { usd: collUsd, info: dolomiteUsdProv("Collateral") } : undefined,
        assets: v.supplies.length > 0 ? <InlineAssetCluster symbols={loadedSymbols(suppliesShown)} /> : undefined,
      },
      {
        id: "debt",
        label: CARD_VOCAB.debt,
        value:
          debtUsd != null ? (
            <UsdFigure usd={debtUsd} info={dolomiteUsdProv("Borrowed")} />
          ) : v.borrows.length > 0 ? (
            <LegLines lines={borrowLines.lines} side="debt" />
          ) : null,
        total: debtUsd != null ? { usd: debtUsd, info: dolomiteUsdProv("Borrowed") } : undefined,
        assets: v.borrows.length > 0 ? <InlineAssetCluster symbols={loadedSymbols(borrowsShown)} /> : undefined,
      },
    ];
    // One market on a side: its amount with its icon, the dollars beneath
    // (the Liquity V2 headline).
    const single = (i: 0 | 1, list: DolomiteBalanceAmount[], side: "supply" | "debt", usd: number | null) => {
      const r = list.length === 1 && !list[0].decimalsUnread ? list[0] : null;
      if (!r) return;
      heads[i] = {
        ...heads[i],
        value: (
          <Prov info={legProv(r, side)}>
            <AssetAmount value={legAmount(r)} symbol={r.symbol} exact={legExact(r)} address={r.token} />
          </Prov>
        ),
        assets: undefined,
        usd:
          usd != null ? (
            <span className="font-bold text-green-400">
              <UsdFigure usd={usd} info={dolomiteUsdProv(side === "supply" ? "Collateral" : "Borrowed")} />
            </span>
          ) : null,
      };
    };
    single(0, v.supplies, "supply", collUsd);
    single(1, v.borrows, "debt", debtUsd);
    // The margin ratio rides the detail page's live core read; the listing
    // snapshot carries none, so a listing card has two headlines.
    if (detail) {
      heads.push({
        id: "margin-ratio",
        label: "Margin ratio",
        labelTip:
          "The account's adjusted supply value divided by its adjusted borrow value, both read from the Dolomite core. Below the account's liquidation line it can be liquidated.",
        value: chain ? (
          dolomiteHasRisk(chain) ? (
            <DolomiteMarginRatio chain={chain} />
          ) : !chain.chainStale && v.borrows.length === 0 ? (
            <span className="text-rb-400">No debt</span>
          ) : null
        ) : null,
        pending: chainPending && !chain,
      });
    }
  }

  if (!detail) return { ...common, heads, surface: "listing", menu: null, tag, outcome };

  const detailCommon = {
    ...common,
    heads,
    surface: "detail" as const,
    explainer: { body: explanation ?? null, viewHref },
    learnMore:
      v.status === "open"
        ? dolomitePositionContent({ status: v.status, hasDebt: v.borrows.length > 0 })
        : dolomitePositionContent({
            status: v.status,
            peaksInTokens: [...v.peakSupplies, ...v.peakBorrows].every((r) => r.tokens),
            liquidations: v.liquidations,
            liquidationCount: v.liquidationCount,
          }),
    menu: {
      leading: () => (
        <DolomiteMenuRows
          accountNumber={v.accountNumber}
          pagePath={`/ethereum/dolomite/${v.owner}/${v.accountNumber}`}
        />
      ),
      exports: exports ?? null,
    },
  };
  if (outcome) return { ...detailCommon, outcome };

  const rate = captions?.borrowRate;
  // Each side's markets open under its headline (the chevron by the icons);
  // the panel keeps the rate and the risk.
  const supplyBreakdown = marketBreakdown(v, "supply", supplyLines);
  const debtBreakdown = marketBreakdown(v, "debt", borrowLines);
  return {
    ...detailCommon,
    heads: detailCommon.heads.map((h) =>
      h.id === "collateral" && v.supplies.length > 1
        ? { ...h, breakdown: supplyBreakdown }
        : h.id === "debt" && v.borrows.length > 1
          ? { ...h, breakdown: debtBreakdown }
          : h,
    ),
    outcome: undefined,
    panel: [
      [],
      [
        ...(rate
          ? [
              {
                id: "borrow-rate",
                label: rate.avg ? "Average borrow rate" : "Borrow rate",
                value: (
                  <Prov info={rate.avg ? avgBorrowRateProv() : borrowRateProv(rate.symbol)}>
                    {rate.pct.toFixed(2)}%
                  </Prov>
                ),
                tip: rate.avg
                  ? "The borrow rates of the markets this account owes in, averaged and weighted by each debt's oracle value. Each is read from the Dolomite core and annualised."
                  : `The current borrow rate on the ${rate.symbol} market, read from the Dolomite core and annualised.`,
              },
            ]
          : []),
        ...(chain && v.status === "open" && dolomiteHasRisk(chain) ? dolomiteRiskRows(chain) : []),
      ],
    ],
  };
}

/** One side's markets for the donut's breakdown (asset-donut.tsx), with the
 *  dust control where lines are hidden. */
function marketBreakdown(
  v: DolomitePositionView,
  side: "supply" | "debt",
  { lines, control }: { lines: DolomiteBalanceAmount[]; control: React.ReactNode },
): AssetBreakdown {
  const usdOf = dustUsdOf(v);
  return {
    assets: lines.map((r) => {
      const usd = usdOf(r);
      return {
        id: `${side}-${r.marketId}`,
        symbol: r.symbol,
        address: r.token,
        usd,
        amount: r.decimalsUnread ? (
          <TokenAmountNotLoaded label={r.symbol} />
        ) : (
          <Prov info={legProv(r, side)}>
            <ExactSpan exact={legExact(r)} symbol={r.symbol}>
              {formatCompact(legAmount(r))}
            </ExactSpan>
          </Prov>
        ),
        usdText:
          usd != null ? (
            <UsdFigure usd={usd} info={dolomiteUsdProv(`${r.symbol} ${side === "supply" ? "supplied" : "borrowed"}`)} />
          ) : undefined,
      };
    }),
    dust: control ?? undefined,
  };
}

/** The Dolomite account card: its slots, drawn by the shared card. */
export function DolomitePositionCard(props: DolomitePositionCardProps) {
  return <PositionCard slots={useDolomiteCardSlots(props)} />;
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
