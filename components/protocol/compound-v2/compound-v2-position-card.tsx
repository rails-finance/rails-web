"use client";

// Compound V2 position card: a slot builder for the shared position card
// (components/shared/position-card.tsx). `useCompoundV2CardSlots` turns the
// account's view and the page's live Comptroller read into one
// `PositionCardSlots`; the shell draws the frame, the tag, the ⋮, the
// headlines, the panel, the (i) and the counters.
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

import { type ReactNode, useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import {
  PositionCard,
  type PositionCardExports,
  type PositionCardHead,
  type PositionCardMenu,
  type PositionCardOutcome,
  type PositionCardSlots,
  type PositionCardStatus,
  type PositionPanelRow,
} from "@/components/shared/position-card";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { AssetAmount } from "@/components/shared/asset-amount";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { WalletPill } from "@/components/shared/wallet-pill";
import { formatUnitsExact, formatCompact } from "@/lib/utils/format";
import { formatUsd } from "@/lib/shared/format-event";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { TipLabel } from "@/components/shared/tip-label";
import {
  DEPRECATED_CONDITIONS,
  DEPRECATED_CONSEQUENCE,
  isCompoundV2Deprecated,
} from "@/lib/compound-v2/deprecated-markets";
import {
  positionSupplyCurrentProv,
  positionSupplyPrincipalProv,
  positionDebtProv,
  compoundV2UsdProvOnchain,
  fixedPriceLineProv,
  borrowRateProv,
  avgBorrowRateProv,
  peakSupplyProv,
  peakDebtProv,
} from "@/lib/compound-v2/event-provenance";
import { compoundV2LiveDebtProv } from "@/lib/compound-v2/position-provenance";
import type { CompoundV2ChainResponse } from "@/lib/api/fetch-compound-v2-position";
import type { CompoundV2CardCaptions } from "@/lib/compound-v2/economics";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import { compoundV2PositionModal } from "@/lib/compound-v2/event-templates";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import type {
  CompoundV2PositionSummary,
  CompoundV2SupplyAmount,
  CompoundV2BorrowAmount,
  CompoundV2PeakAmount,
} from "@/lib/sources/api/compound-v2-positions";
import { ExactSpan } from "@/components/shared/amount-text";
import type { LiquidationStory } from "@/lib/shared/ctoken-liquidation-story";
import { splitDust, useDustLines } from "@/components/shared/dust-reserves";
import { compoundV2LineRows, compoundV2RiskHead } from "./compound-v2-risk-slot";

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
  /** Each liquidation as the rows tell it, where the page holds them. */
  liquidations?: LiquidationStory[];
  /** Every row of the history, beside the transaction count (the detail page). */
  eventTotal?: number;
}

/** The figure a supply line asserts: the current value (interest included)
 *  when the chain read landed, the replayed principal otherwise. */
const supplyAmount = (r: CompoundV2SupplyAmount): number => r.current ?? r.principal;

/** On-chain oracle USD for one line; null when Compound didn't price it. */
function lineUsd(v: CompoundV2PositionView, market: string, amount: number): number | null {
  const p = v.priceByMarket?.[market];
  return typeof p === "number" && p > 0 ? amount * p : null;
}

/** Each line's oracle USD for the dust rule (components/shared/dust-reserves);
 *  null (held) where the oracle didn't price it. */
const supplyLineUsd = (v: CompoundV2PositionView) => (r: CompoundV2PositionView["supplies"][number]) =>
  lineUsd(v, r.market, supplyAmount(r));
const borrowLineUsd = (v: CompoundV2PositionView) => (r: CompoundV2PositionView["borrows"][number]) =>
  lineUsd(v, r.market, r.amount);

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
      · <Prov info={fixedPriceLineProv(symbol)}>fixed price set by governance</Prov>
    </span>
  );
}

/** A debt line read from the last borrow, repay or liquidation event's
 *  accountBorrows, without the interest since. */
function StaleDebtNote() {
  return (
    <span
      className="text-[10px] text-rb-500"
      title="The accountBorrows the market emitted at this account's last borrow, repay or liquidation event. Interest since then is not included."
    >
      {" "}
      at the last event
    </span>
  );
}

/** A borrow in a deprecated market can be repaid in full by any liquidator,
 *  however healthy the account (lib/compound-v2/deprecated-markets.ts). */
function DeprecatedBorrowNote({ v }: { v: CompoundV2PositionView }) {
  const hit = v.borrows.filter((b) => isCompoundV2Deprecated(b.market));
  if (hit.length === 0) return null;
  return (
    <div className="text-xs mb-3 text-amber-700 dark:text-amber-400" data-compound-v2-deprecated-borrow="">
      <TipLabel
        text={`${hit.map((b) => b.symbol).join(" and ")} market deprecated`}
        tip={`A deprecated market has ${DEPRECATED_CONDITIONS}: ${DEPRECATED_CONSEQUENCE}.`}
      />
      : this borrow can be liquidated in full at any time.
    </div>
  );
}

/** The unpriced side's token amounts, one under another, at most three: a
 *  partial USD total is never asserted, so the amounts stand in the headline
 *  and the panel lists them all. */
function TokenStack({ lines }: { lines: ReactNode[] }) {
  const shown = lines.slice(0, 3);
  return (
    <div className="flex flex-col gap-1">
      {shown}
      {lines.length > shown.length && <span className="text-xs text-rb-500">+{lines.length - shown.length} more</span>}
    </div>
  );
}

/** A side's USD headline, its full figure on hover. */
function UsdFigure({ usd, info }: { usd: number; info: Provenance }) {
  return (
    <span title={"$" + usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}>
      <Prov info={info}>{formatUsd(usd)}</Prov>
    </span>
  );
}

/** One market's peak amounts (highest recorded), each traced to the lane's
 *  maximum (the supply balance at a row on supply, emitted accountBorrows on
 *  debt); no USD, the token amount only. Null where nothing was recorded. */
function peakValue(lines: CompoundV2PeakAmount[], side: "supply" | "debt"): ReactNode | null {
  if (lines.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {lines.map((r) => (
        <div key={r.market}>
          <Prov info={side === "supply" ? peakSupplyProv(r.symbol) : peakDebtProv(r.symbol)}>
            <AssetAmount value={r.amount} symbol={r.symbol} exact={formatUnitsExact(r.amountRaw, r.decimals)} />
          </Prov>
        </div>
      ))}
    </div>
  );
}

const shareText = (share: number): string =>
  share > 0 && share < 0.01 ? "under 1%" : `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%`;

/** The account's ID and its page on the card's ⋮: the wallet address with a
 *  copy, and the link to this position. */
function CompoundV2MenuRows({ wallet }: { wallet: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };
  return (
    <>
      <ToolsMenuItem
        icon={copied === "id" ? <Check size={16} /> : <Copy size={16} />}
        title={`Wallet ${wallet.slice(0, 6)}…${wallet.slice(-4)}`}
        subtitle={copied === "id" ? "Copied" : "Copy the wallet address"}
        onClick={() => copy("id", wallet)}
      />
      <ToolsMenuItem
        icon={copied === "link" ? <Check size={16} /> : <Link2 size={16} className="-rotate-45" />}
        title="Link to this position"
        subtitle={copied === "link" ? "Copied" : "Copy the page's address"}
        onClick={() => copy("link", `${window.location.origin}/ethereum/compound-v2/${wallet}`)}
      />
    </>
  );
}

/** What a Compound V2 page or listing hands the card. */
export interface CompoundV2PositionCardProps {
  v: CompoundV2PositionView;
  /** `detail` on the account's page (receipts, panel, (i)); `listing` in a row. */
  surface?: "detail" | "listing";
  /** The detail page's live Comptroller read; null until it lands. */
  chain?: CompoundV2ChainResponse | null;
  /** Detail-page captions (the borrow rate), computed from the per-market chain
   *  read (computeCompoundV2CardCaptions). Listing cards omit them. */
  captions?: CompoundV2CardCaptions;
  /** The (i) pane's prose (narration describing the position NOW). */
  explanation?: ReactNode;
  /** The pane's copy-this-view link: the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** The ⋮'s export shapes (`compoundV2Exports`). Absent: the ⋮ holds the
   *  account's rows and the provenance row alone. */
  exports?: PositionCardExports;
}

/** The Compound V2 slots for the shared position card. */
export function useCompoundV2CardSlots({
  v,
  surface = "listing",
  chain = null,
  captions,
  explanation,
  viewHref,
  exports,
}: CompoundV2PositionCardProps): PositionCardSlots {
  const detail = surface === "detail";
  const collUsd = totalUsd(
    v,
    v.supplies.map((r) => ({ market: r.market, amount: supplyAmount(r) })),
  );
  const debtUsd = totalUsd(
    v,
    v.borrows.map((r) => ({ market: r.market, amount: r.amount })),
  );
  // Dust lines (under a cent) leave the icon cluster and the panel's list; the
  // panel puts them behind the "N dust reserves hidden" control.
  const suppliesShown = splitDust(v.supplies, supplyLineUsd(v)).shown;
  const borrowsShown = splitDust(v.borrows, borrowLineUsd(v)).shown;
  const supplyLines = useDustLines(v.supplies, supplyLineUsd(v));
  const borrowLines = useDustLines(v.borrows, borrowLineUsd(v));

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
    countNote: txCountNote(v.liquidationCount),
    liquidationCount: v.liquidationCount,
    // The foot strip reads transactions, warnings, then the age.
    ...(detail ? { order: "age-last" as const } : {}),
  };

  // The listing names the wallet; the detail page's wallet row does.
  const identity = detail ? undefined : (
    <WalletPill wallet={v.wallet} ensName={null} filterProtocol="compound-v2" bookmarkProtocol="compound-v2" />
  );

  const ended = v.status === "closed" || v.status === "liquidated";
  const common = { status, identity, counters };
  const menu: PositionCardMenu = {
    leading: () => <CompoundV2MenuRows wallet={v.wallet} />,
    exports: exports ?? null,
  };
  const detailCommon = {
    surface: "detail" as const,
    explainer: { body: explanation ?? null, viewHref },
    learnMore: compoundV2PositionModal({ status: v.status, hasDebt: v.borrows.length > 0 }),
    menu,
  };

  // Closed / liquidated: the wallet holds no open markets, so the headline is
  // what each asset held at its height: the highest recorded per-market supply
  // and debt (replayed MAX over the wallet's life, per asset; no USD). The
  // liquidated outcome appears only here: an open survivor never reaches this
  // branch, however many liquidations its counters show.
  if (ended) {
    const heads: PositionCardHead[] = [
      { id: "peak-collateral", label: CARD_VOCAB.peakCollateral, value: peakValue(v.peakSupplies, "supply") },
      { id: "peak-debt", label: CARD_VOCAB.peakDebt, value: peakValue(v.peakBorrows, "debt") },
    ];
    const outcome: PositionCardOutcome = {
      word: v.status === "liquidated" ? "Liquidated" : "Closed",
      dates: outcomeDates(v) ?? [{ at: v.lastActivityAt }],
    };
    if (!detail) return { ...common, heads, outcome, surface: "listing", menu: null };
    return { ...common, ...detailCommon, heads, outcome };
  }

  const supplyUnit = (r: CompoundV2SupplyAmount) => (
    <div key={r.market}>
      <Prov info={supplyProv(r)}>
        <AssetAmount
          value={supplyAmount(r)}
          symbol={r.symbol}
          exact={r.current != null ? formatUnitsExact(r.cTokensRaw, 8) : String(r.principal)}
          {...(r.current != null ? { exactUnit: r.cSymbol } : {})}
        />
      </Prov>
    </div>
  );
  const borrowUnit = (r: CompoundV2BorrowAmount) => (
    <div key={r.market}>
      <Prov info={borrowProv(r)}>
        <AssetAmount value={r.amount} symbol={r.symbol} exact={formatUnitsExact(r.amountRaw, r.decimals)} />
      </Prov>
    </div>
  );

  // ONE oracle-USD figure leads each side (the asset cluster carries the
  // identities). When any contributing market is unpriced the token amounts
  // stand in the headline: a partial USD total is never asserted.
  const heads: PositionCardHead[] = [
    {
      id: "collateral",
      label: CARD_VOCAB.collateral,
      value:
        v.supplies.length === 0 ? null : collUsd != null ? (
          <UsdFigure usd={collUsd.usd} info={compoundV2UsdProvOnchain("Collateral", collUsd.fixed)} />
        ) : (
          <TokenStack lines={suppliesShown.map(supplyUnit)} />
        ),
      assets: v.supplies.length > 0 ? <InlineAssetCluster symbols={suppliesShown.map((r) => r.symbol)} /> : undefined,
    },
    {
      id: "debt",
      label: CARD_VOCAB.debt,
      value:
        v.borrows.length === 0 ? null : debtUsd != null ? (
          <UsdFigure usd={debtUsd.usd} info={compoundV2UsdProvOnchain("Borrowed", debtUsd.fixed)} />
        ) : (
          <TokenStack lines={borrowsShown.map(borrowUnit)} />
        ),
      assets: v.borrows.length > 0 ? <InlineAssetCluster symbols={borrowsShown.map((r) => r.symbol)} /> : undefined,
    },
  ];
  // One market on a side: its amount with its icon, the dollars beneath (the
  // Liquity V2 headline).
  if (v.supplies.length === 1) {
    const r = v.supplies[0];
    heads[0] = {
      ...heads[0],
      value: (
        <Prov info={supplyProv(r)}>
          <AssetAmount
            value={supplyAmount(r)}
            symbol={r.symbol}
            exact={r.current != null ? formatUnitsExact(r.cTokensRaw, 8) : String(r.principal)}
            {...(r.current != null ? { exactUnit: r.cSymbol } : {})}
          />
        </Prov>
      ),
      assets: undefined,
      usd:
        collUsd != null ? (
          <span className="font-bold text-green-400">
            <UsdFigure usd={collUsd.usd} info={compoundV2UsdProvOnchain("Collateral", collUsd.fixed)} />
          </span>
        ) : null,
    };
  }
  if (v.borrows.length === 1) {
    const r = v.borrows[0];
    heads[1] = {
      ...heads[1],
      value: (
        <Prov info={borrowProv(r)}>
          <AssetAmount value={r.amount} symbol={r.symbol} exact={formatUnitsExact(r.amountRaw, r.decimals)} />
        </Prov>
      ),
      assets: undefined,
      usd:
        debtUsd != null ? (
          <span className="font-bold text-green-400">
            <UsdFigure usd={debtUsd.usd} info={compoundV2UsdProvOnchain("Borrowed", debtUsd.fixed)} />
          </span>
        ) : null,
    };
  }
  // The risk headline rides the detail page's live Comptroller read; the
  // listing snapshot carries none, so a listing card asserts no risk column.
  const risk = detail ? compoundV2RiskHead(chain, v.borrows.length > 0) : null;
  if (risk) heads.push(risk);

  // A state the owner must act on stays in view.
  const notice = <DeprecatedBorrowNote v={v} />;
  const withNotice = {
    ...common,
    notice: v.borrows.some((b) => isCompoundV2Deprecated(b.market)) ? notice : undefined,
  };
  if (!detail) return { ...withNotice, heads, surface: "listing", menu: null };

  // Each side's market rows, and the panel: the liquidation line on the left;
  // the rate, the room to borrow and the drop on the right.
  const lineRows = compoundV2LineRows(chain);
  const supplyRows: PositionPanelRow[] = supplyLines.lines.map((r) => {
    const share =
      collUsd && collUsd.usd > 0 && v.supplies.length > 1
        ? (lineUsd(v, r.market, supplyAmount(r)) ?? 0) / collUsd.usd
        : null;
    return {
      id: `supply-${r.market}`,
      label: `${r.symbol} supplied`,
      value: (
        <>
          <Prov info={supplyProv(r)}>
            <ExactSpan
              exact={r.current != null ? formatUnitsExact(r.cTokensRaw, 8) : String(r.principal)}
              symbol={r.current != null ? r.cSymbol : r.symbol}
            >
              {formatCompact(supplyAmount(r))} {r.symbol}
            </ExactSpan>
          </Prov>
          {share != null && <span className="text-rb-500"> · {shareText(share)}</span>}
          {isFixed(v, r.market) && <FixedPriceFlag symbol={r.symbol} />}
        </>
      ),
      tip:
        (r.current != null
          ? `The ${r.symbol} supplied to this market with its interest: the ${r.cSymbol} balance times the market's exchange rate, read from the chain.`
          : `The ${r.symbol} deposited to this market without its interest: deposits less withdrawals, replayed from the account's events.`) +
        (share != null ? " The percentage is its share of the collateral's dollar value." : ""),
    };
  });
  if (supplyLines.control)
    supplyRows.push({
      id: "supply-dust",
      label: "Dust",
      value: supplyLines.control,
      tip: "Supplied balances worth under a cent at the oracle price, kept out of the list. The control shows them.",
    });
  const borrowRows: PositionPanelRow[] = borrowLines.lines.map((r) => {
    const share =
      debtUsd && debtUsd.usd > 0 && v.borrows.length > 1 ? (lineUsd(v, r.market, r.amount) ?? 0) / debtUsd.usd : null;
    return {
      id: `borrow-${r.market}`,
      label: `${r.symbol} borrowed`,
      value: (
        <>
          <Prov info={borrowProv(r)}>
            <ExactSpan exact={formatUnitsExact(r.amountRaw, r.decimals)} symbol={r.symbol}>
              {formatCompact(r.amount)} {r.symbol}
            </ExactSpan>
          </Prov>
          {!r.live && <StaleDebtNote />}
          {share != null && <span className="text-rb-500"> · {shareText(share)}</span>}
          {isFixed(v, r.market) && <FixedPriceFlag symbol={r.symbol} />}
        </>
      ),
      tip:
        (r.live
          ? `The ${r.symbol} owed now, interest included: the market's borrowBalanceStored, read from the chain at the latest block.`
          : `The ${r.symbol} owed at the account's last borrow, repay or liquidation: the accountBorrows that event recorded, without the interest since.`) +
        (share != null ? " The percentage is its share of the debt's dollar value." : ""),
    };
  });
  if (borrowLines.control)
    borrowRows.push({
      id: "borrow-dust",
      label: "Dust",
      value: borrowLines.control,
      tip: "Borrowed balances worth under a cent at the oracle price, kept out of the list. The control shows them.",
    });
  const rate = captions?.borrowRate;
  const rateRows: PositionPanelRow[] = rate
    ? [
        {
          id: "borrow-rate",
          label: rate.avg ? "Average borrow rate" : "Borrow rate",
          value: (
            <Prov info={rate.avg ? avgBorrowRateProv() : borrowRateProv(rate.symbol)}>{rate.pct.toFixed(2)}%</Prov>
          ),
          tip: rate.avg
            ? "The borrowed markets' current variable rates, averaged by each debt's dollar value at Compound's oracle prices."
            : `The ${rate.symbol ?? "market"} market's current variable borrow rate: its borrowRatePerBlock, read from the chain and annualised on the market's interest rate model.`,
        },
      ]
    : [];
  return {
    ...withNotice,
    ...detailCommon,
    // Each side's markets open under its headline (the chevron by the icons);
    // the panel keeps the additive values.
    heads: heads.map((h) =>
      h.id === "collateral" && v.supplies.length > 1
        ? { ...h, assetRows: supplyRows }
        : h.id === "debt" && v.borrows.length > 1
          ? { ...h, assetRows: borrowRows }
          : h,
    ),
    outcome: undefined,
    panel: [lineRows.collateral, [...rateRows, ...lineRows.debt]],
  };
}

/** The Compound V2 account card: its slots, drawn by the shared card. */
export function CompoundV2PositionCard(props: CompoundV2PositionCardProps) {
  return <PositionCard slots={useCompoundV2CardSlots(props)} />;
}

/** Why the transaction count and the event count differ. */
const txCountNote = (liquidations: number) =>
  liquidations > 0
    ? "the count leaves out each liquidation, which is the liquidator's transaction, and one transaction can hold several rows (a liquidation and its seizure, or a repayment and a withdrawal)"
    : "one transaction can hold several rows (a repayment and a withdrawal)";

/** A liquidated card's two dates: the last liquidation, then the closing,
 *  when they fall on different days. An account liquidated more than once
 *  says the date is the last of its count. */
function outcomeDates(v: CompoundV2PositionView): { label: string; at: number }[] | undefined {
  const last = v.liquidations?.at(-1)?.at;
  if (v.status !== "liquidated" || last == null) return undefined;
  if (Math.floor(last / 86400) === Math.floor(v.lastActivityAt / 86400)) return undefined;
  const n = Math.max(v.liquidationCount, v.liquidations?.length ?? 0);
  return [
    { label: n > 1 ? `Last of ${n} liquidations` : "Liquidated", at: last },
    { label: "Closed", at: v.lastActivityAt },
  ];
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
