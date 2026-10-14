"use client";

// Moonwell position card: the Compound-v2-family analog of the Spark /
// Compound position cards, as a slot builder for the shared position card
// (rails-ops TO-DO-position-card 322): `useMoonwellCardSlots` turns the
// account's view and the page's live Comptroller read into one
// `PositionCardSlots` object, and `PositionCard`
// (components/shared/position-card.tsx) draws it on the position page and in
// the listing row.
//
// A Moonwell account is cross-collateralised through the Comptroller: one
// wallet supplies and borrows across the mToken markets. The two sides
// carry DIFFERENT bases, and the provenance names each: supply is the exact
// mToken balance (slot-verified Transfer replay) × the market's exchange rate
// when the chain read landed — balanceOfUnderlying, interest included — else
// the replayed deposit principal; debt is the emitted accountBorrows at the
// last borrow/repay event, UPGRADED to the live borrowBalanceStored on the
// detail page when its chain lane lands (each borrow row's `live` flag names
// the basis). The Health factor headline and the panel's risk rows ride the
// detail page's live Comptroller read — the listing card still asserts no
// health column (the listing snapshot carries none).

import type { ReactNode } from "react";
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
import { WalletPill } from "@/components/shared/wallet-pill";
import { formatUnitsExact, formatCompact } from "@/lib/utils/format";
import { Prov } from "@/components/shared/provenance";
import { useMoonwellDeployment } from "@/lib/moonwell/deployment-context";
import { moonwellPositionModal } from "@/lib/moonwell/event-templates";
import type { MoonwellCardCaptions } from "@/lib/moonwell/economics";
import { formatUsd } from "@/lib/shared/format-event";
import { CARD_VOCAB, notRecordedNote } from "@/lib/shared/card-vocab";
import { protocolForSession } from "@/lib/shared/protocols";
import type {
  MoonwellPositionSummary,
  MoonwellSupplyAmount,
  MoonwellBorrowAmount,
  MoonwellPeakAmount,
} from "@/lib/sources/api/moonwell-positions";
import { ExactSpan } from "@/components/shared/amount-text";
import type { LiquidationStory } from "@/lib/shared/ctoken-liquidation-story";
import { splitDust, useDustLines } from "@/components/shared/dust-reserves";
import type { MoonwellChainResponse } from "@/lib/api/fetch-moonwell-position";
import { moonwellHealthHead, moonwellRiskRows } from "./moonwell-risk-slot";
import { MoonwellMenuRows } from "./moonwell-menu-rows";

export interface MoonwellPositionView {
  wallet: string;
  /** "unread" is a listing row whose account has not been read from the
   *  chain yet — no state recorded, never mapped to "closed" (0018). */
  status: "open" | "closed" | "liquidated" | "unread";
  supplies: MoonwellSupplyAmount[];
  borrows: MoonwellBorrowAmount[];
  /** Highest recorded per-market supply / debt (closed/liquidated cards). */
  peakSupplies: MoonwellPeakAmount[];
  peakBorrows: MoonwellPeakAmount[];
  liquidationCount: number;
  /** Non-liquidation transaction count (activity-meta). */
  txCount: number;
  /** Unix seconds of the most recent event (activity-meta). */
  lastActivityAt: number;
  /** On-chain oracle USD (getUnderlyingPrice, chain-derived) per market's
   *  underlying, keyed by lowercased token address. Feeds the card's USD
   *  footnotes; a market the oracle didn't price is simply absent. */
  priceByAddress?: Record<string, number>;
  /** Annualized per-timestamp rates per market key (from the same multicall). */
  ratesByMarket?: Record<string, { borrowApr: number | null; supplyApr: number | null }>;
  /** Each liquidation as the rows tell it, where the page holds them. */
  liquidations?: LiquidationStory[];
  /** Every row of the history, beside the transaction count (the detail page). */
  eventTotal?: number;
  /** The markets the account has entered as collateral (Comptroller
   *  getAssetsIn at head), each with its live collateral factor. Absent where
   *  no chain read stands behind the card (the listing). */
  entered?: { underlying: string; symbol: string; collateralFactor: number }[];
}

/** The figure a supply line asserts: the current value (interest included)
 *  when the chain read landed, the replayed principal otherwise. */
const supplyAmount = (r: MoonwellSupplyAmount): number => r.current ?? r.principal;

/** On-chain oracle USD for one line; null when Moonwell didn't price it. */
function lineUsd(v: MoonwellPositionView, address: string, amount: number): number | null {
  const p = v.priceByAddress?.[address.toLowerCase()];
  return typeof p === "number" && p > 0 ? amount * p : null;
}

/** Each line's oracle USD for the dust rule (components/shared/dust-reserves);
 *  null (held) where the oracle didn't price it. */
const supplyLineUsd = (v: MoonwellPositionView) => (r: MoonwellPositionView["supplies"][number]) =>
  lineUsd(v, r.address, supplyAmount(r));
const borrowLineUsd = (v: MoonwellPositionView) => (r: MoonwellPositionView["borrows"][number]) =>
  lineUsd(v, r.address, r.amount);

/** Total USD across one side, with the STRICT guard: null the moment any
 *  contributing market is unpriced, so a partial total is never asserted (it
 *  degrades to no headline). */
function totalUsd(v: MoonwellPositionView, lines: { address: string; amount: number }[]): number | null {
  let sum = 0;
  let any = false;
  for (const l of lines) {
    if (l.amount <= 0) continue;
    const u = lineUsd(v, l.address, l.amount);
    if (u == null) return null;
    sum += u;
    any = true;
  }
  return any ? sum : null;
}

/** The receipts behind each supply / debt line, and the market's receipt-token
 *  label — all resolved through the surrounding page's deployment, so a Base
 *  row never cites Ethereum's catalog or index (Ethereum's is the default). */
function useLineReceipts() {
  const dep = useMoonwellDeployment();
  return {
    supplyProv: (r: MoonwellSupplyAmount) => dep.card.supply(r, dep.market(r.market, r.symbol)),
    /** Debt-line provenance: the live borrowBalanceStored lane when the detail
     *  page's chain read upgraded this row, the emitted-accountBorrows lane
     *  otherwise. */
    borrowProv: (r: MoonwellBorrowAmount) => dep.card.debt(r, dep.market(r.market, r.symbol)),
    mSymbolOf: (r: MoonwellSupplyAmount) => dep.market(r.market, r.symbol).mSymbol,
  };
}

const NOT_COLLATERAL_TIP =
  "Supplied and earning the supply rate, but not entered as collateral (the Comptroller's market membership, read now), so it backs no borrowing. A liquidation can still seize it.";
const FACTOR_TIP =
  "The share of each entered market's value that counts toward the borrow limit, as the Comptroller sets it now.";
const DUST_TIP =
  "Balances worth under a cent at the oracle price, usually the last units a withdrawal or repayment left behind. Open to see them.";

/** Whether a line's market is entered as collateral; true where membership
 *  is unknown, so nothing is split without a read behind it. */
const isEntered = (v: MoonwellPositionView, address: string) =>
  !v.entered || v.entered.some((e) => e.underlying === address.toLowerCase());

/** A line's share of its side, as the panel states it. */
const shareText = (share: number) => (share > 0 && share < 0.01 ? "under 1%" : `${Math.round(share * 100)}%`);

/** The stacked per-market amounts of a side with no complete USD total. */
function AmountStack({ children }: { children: ReactNode }) {
  return <span className="flex flex-col gap-1">{children}</span>;
}

/** Per-market PEAK amounts (highest recorded), each traced to the lane's
 *  maximum (the supply balance at a row on supply, emitted accountBorrows on
 *  debt); no USD, the token amount only. */
function PeakLines({ lines, side }: { lines: MoonwellPeakAmount[]; side: "supply" | "debt" }) {
  const dep = useMoonwellDeployment();
  return (
    <AmountStack>
      {lines.map((r) => (
        <Prov key={r.address} info={side === "supply" ? dep.card.peakSupply(r.symbol) : dep.card.peakDebt(r.symbol)}>
          <AssetAmount value={r.amount} symbol={r.symbol} exact={formatUnitsExact(r.amountRaw, r.decimals)} />
        </Prov>
      ))}
    </AmountStack>
  );
}

/** One side's USD total as the headline figure, traced to the oracle read. */
function UsdFigure({ usd, what }: { usd: number; what: string }) {
  const dep = useMoonwellDeployment();
  return (
    <span title={"$" + usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}>
      <Prov info={dep.card.usd(what)}>{formatUsd(usd)}</Prov>
    </span>
  );
}

/** A panel row's value for one market line: the amount, then its USD and its
 *  share of the side. */
function LineValue({
  amount,
  usd,
  share,
  usdWhat,
}: {
  amount: ReactNode;
  usd: number | null;
  share: number | null;
  usdWhat: string;
}) {
  const dep = useMoonwellDeployment();
  return (
    <>
      {amount}
      {usd != null && (
        <span className="text-rb-500">
          {" · "}
          <Prov info={dep.card.usd(usdWhat)}>{formatUsd(usd)}</Prov>
          {share != null && ` · ${shareText(share)}`}
        </span>
      )}
    </>
  );
}

/** "WETH 84% · USDC 88%": the entered markets the card lists, each at the
 *  factor the Comptroller applies to it now. */
function factorsRow(v: MoonwellPositionView, addresses: string[]): PositionPanelRow | null {
  const rows = (v.entered ?? []).filter((e) => addresses.some((a) => a.toLowerCase() === e.underlying));
  if (rows.length === 0) return null;
  return {
    id: "collateral-factors",
    label: rows.length > 1 ? "Collateral factors" : "Collateral factor",
    tip: FACTOR_TIP,
    value: rows.map((e) => `${e.symbol} ${+(e.collateralFactor * 100).toFixed(1)}%`).join(" · "),
  };
}

/** The borrow rate row: the live per-timestamp rate on the single borrowed
 *  market, or the debt-USD-weighted average across several. */
function BorrowRateValue({ rate }: { rate: NonNullable<MoonwellCardCaptions["borrowRate"]> }) {
  const dep = useMoonwellDeployment();
  return (
    <Prov info={rate.avg ? dep.card.avgBorrowRate() : dep.card.borrowRate(rate.symbol)}>{rate.pct.toFixed(2)}%</Prov>
  );
}

export interface MoonwellPositionCardProps {
  v: MoonwellPositionView;
  /** `detail` on the position page (receipts, panel, (i)); `listing` in a row. */
  surface: "detail" | "listing";
  /** The page's live Comptroller read: the Health factor headline and the
   *  panel's risk rows. Null while it is out; the listing passes none. */
  chain?: MoonwellChainResponse | null;
  /** Whether the row carries highest-recorded amounts (the index's replay and
   *  a whole sweep do; the Base listing, a chain read at a block with no
   *  replay behind it, does not — its closed cards say so instead of showing
   *  a dash as if nothing was ever held). */
  peaks?: boolean;
  /** The card's Explanation section (narration describing the position NOW). */
  explanation?: ReactNode;
  /** Copy-this-view control, the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** Detail-page stat captions (accrued interest, borrow rate) — computed from
   *  the event stream + the per-market chain read (computeMoonwellCardCaptions).
   *  Listing cards omit them. */
  captions?: MoonwellCardCaptions;
  /** The ⋮'s export shapes (`moonwellExports`). */
  exports?: PositionCardExports | null;
}

/** Moonwell's slots for the shared position card: the headlines, the panel,
 *  the tag, the ⋮ and the counters, from the account's view and the page's
 *  live read. */
export function useMoonwellCardSlots({
  v,
  surface,
  chain = null,
  peaks = true,
  explanation,
  viewHref,
  captions,
  exports,
}: MoonwellPositionCardProps): PositionCardSlots {
  const dep = useMoonwellDeployment();
  const session = dep.session;
  const { supplyProv, borrowProv, mSymbolOf } = useLineReceipts();
  const detail = surface === "detail";

  // The collateral column holds the entered markets; a supply the account
  // never entered is shown apart ("Supplied, not collateral").
  const vc: MoonwellPositionView = { ...v, supplies: v.supplies.filter((r) => isEntered(v, r.address)) };
  const vo: MoonwellPositionView = { ...v, supplies: v.supplies.filter((r) => !isEntered(v, r.address)) };
  const collUsd = totalUsd(
    vc,
    vc.supplies.map((r) => ({ address: r.address, amount: supplyAmount(r) })),
  );
  const otherUsd = totalUsd(
    vo,
    vo.supplies.map((r) => ({ address: r.address, amount: supplyAmount(r) })),
  );
  const debtUsd = totalUsd(v, v.borrows);
  // Dust lines (under a cent) leave the icon cluster and the panel's rows;
  // the "N dust reserves hidden" control puts them back.
  const collDust = useDustLines(vc.supplies, supplyLineUsd(v));
  const otherDust = useDustLines(vo.supplies, supplyLineUsd(v));
  const debtDust = useDustLines(v.borrows, borrowLineUsd(v));
  const suppliesShown = splitDust(vc.supplies, supplyLineUsd(v)).shown;
  const borrowsShown = splitDust(v.borrows, borrowLineUsd(v)).shown;

  const ended = v.status === "closed" || v.status === "liquidated";
  const status: PositionCardStatus | null =
    v.status === "liquidated"
      ? { word: "Liquidated", tone: "danger" }
      : v.status === "closed"
        ? { word: "Closed", tone: "muted" }
        : v.status === "unread"
          ? { word: "Not loaded", tone: "muted" }
          : null;

  const counters = {
    lastActivityAt: v.lastActivityAt,
    eventCount: v.txCount,
    eventTotal: v.eventTotal,
    countNote: txCountNote(v.liquidationCount),
    liquidationCount: v.liquidationCount,
    // The foot strip reads transactions, warnings, then the age (ui-jobs 270).
    ...(detail ? { order: "age-last" as const } : {}),
  };
  // The listing names the account; the position page's wallet row does.
  const identity = detail ? undefined : (
    <WalletPill wallet={v.wallet} ensName={null} filterProtocol={session} bookmarkProtocol={session} />
  );
  const common = { status, identity, counters };

  let heads: PositionCardHead[];
  let outcome: PositionCardOutcome | undefined;
  if (ended) {
    // Closed / liquidated: the wallet holds no open markets, so the headline is
    // what each asset held at its height — highest recorded per-market supply +
    // debt (replayed MAX over the wallet's life, per asset; no USD).
    const noPeaksNote = !peaks ? notRecordedNote("position") : undefined;
    heads = [
      {
        id: "peak-collateral",
        label: CARD_VOCAB.peakCollateral,
        value: peaks && v.peakSupplies.length > 0 ? <PeakLines lines={v.peakSupplies} side="supply" /> : null,
        sub: noPeaksNote,
      },
      {
        id: "peak-debt",
        label: CARD_VOCAB.peakDebt,
        value: peaks && v.peakBorrows.length > 0 ? <PeakLines lines={v.peakBorrows} side="debt" /> : null,
        sub: noPeaksNote,
      },
    ];
    outcome = {
      word: v.status === "liquidated" ? "Liquidated" : "Closed",
      dates: outcomeDates(v) ?? (v.lastActivityAt ? [{ at: v.lastActivityAt }] : undefined),
    };
  } else {
    // ONE oracle-USD figure leads each side (the asset cluster carries the
    // identities), the per-market amounts sit in the panel. When any
    // contributing market is unpriced the token stack stays the headline: a
    // partial USD total is never asserted.
    heads = [
      {
        id: "collateral",
        label: CARD_VOCAB.collateral,
        value:
          vc.supplies.length === 0 ? null : collUsd != null ? (
            <UsdFigure usd={collUsd} what="Collateral" />
          ) : (
            <AmountStack>
              {collDust.lines.map((r) => (
                <Prov key={r.address} info={supplyProv(r)}>
                  <AssetAmount
                    value={supplyAmount(r)}
                    symbol={r.symbol}
                    exact={r.current != null ? formatUnitsExact(r.mTokensRaw, 8) : String(r.principal)}
                    {...(r.current != null ? { exactUnit: mSymbolOf(r) } : {})}
                  />
                </Prov>
              ))}
            </AmountStack>
          ),
        assets:
          vc.supplies.length > 0 ? <InlineAssetCluster symbols={suppliesShown.map((r) => r.symbol)} /> : undefined,
      },
      {
        id: "debt",
        label: CARD_VOCAB.debt,
        value:
          v.borrows.length === 0 ? null : debtUsd != null ? (
            <UsdFigure usd={debtUsd} what="Borrowed" />
          ) : (
            <AmountStack>
              {debtDust.lines.map((r) => (
                <Prov key={r.address} info={borrowProv(r)}>
                  <AssetAmount value={r.amount} symbol={r.symbol} exact={formatUnitsExact(r.amountRaw, r.decimals)} />
                </Prov>
              ))}
            </AmountStack>
          ),
        assets: v.borrows.length > 0 ? <InlineAssetCluster symbols={borrowsShown.map((r) => r.symbol)} /> : undefined,
      },
    ];
    // The health factor rides the detail page's live Comptroller read; the
    // listing snapshot carries none, so a listing card asserts no health
    // column (never dashed, never staled).
    const health = detail ? moonwellHealthHead(chain, v.borrows.length > 0) : null;
    if (health) heads.push(health);
  }

  if (!detail) return { ...common, surface: "listing", menu: null, heads, outcome };

  const menu = {
    leading: () => (
      <MoonwellMenuRows wallet={v.wallet} pagePath={`${protocolForSession(session)?.href ?? ""}/${v.wallet}`} />
    ),
    exports: exports ?? null,
  };
  const detailCommon = {
    ...common,
    surface: "detail" as const,
    heads,
    explainer: { body: explanation ?? null, viewHref },
    learnMore: ended ? moonwellPositionModal(v.status) : moonwellPositionModal(v.status, v.borrows.length > 0),
    menu,
  };
  if (outcome) return { ...detailCommon, outcome };

  const supplyRow = (r: MoonwellSupplyAmount, kind: "collateral" | "other", total: number | null): PositionPanelRow => {
    const usd = lineUsd(v, r.address, supplyAmount(r));
    const exact = r.current != null ? formatUnitsExact(r.mTokensRaw, 8) : String(r.principal);
    const basis =
      r.current != null
        ? "its mToken balance times the market's exchange rate, interest included"
        : "the deposits replayed, less the withdrawals";
    return {
      id: `${kind}-${r.address}`,
      label: kind === "collateral" ? `${r.symbol} collateral` : `${r.symbol} supplied, not collateral`,
      tip:
        kind === "collateral"
          ? `The ${r.symbol} this account supplies as collateral: ${basis}, with its oracle value and its share of the collateral.`
          : NOT_COLLATERAL_TIP,
      value: (
        <LineValue
          amount={
            <Prov info={supplyProv(r)}>
              <ExactSpan exact={exact} symbol={r.current != null ? mSymbolOf(r) : r.symbol}>
                {formatCompact(supplyAmount(r))} {r.symbol}
              </ExactSpan>
            </Prov>
          }
          usd={usd}
          share={usd != null && total ? usd / total : null}
          usdWhat={`${r.symbol} supplied`}
        />
      ),
    };
  };
  const dustRow = (id: string, control: ReactNode): PositionPanelRow[] =>
    control ? [{ id, label: "Dust reserves", tip: DUST_TIP, value: control }] : [];

  const collateralFactors = factorsRow(
    v,
    vc.supplies.map((r) => r.address),
  );
  // Each side's markets open under its headline (the chevron by the icons);
  // the panel keeps the additive values and the supplies that are not
  // collateral.
  const collRows = [
    ...collDust.lines.map((r) => supplyRow(r, "collateral", collUsd)),
    ...dustRow("dust-collateral", collDust.control),
  ];
  const left: PositionPanelRow[] = [
    ...(collateralFactors ? [collateralFactors] : []),
    ...otherDust.lines.map((r) => supplyRow(r, "other", otherUsd)),
    ...dustRow("dust-not-collateral", otherDust.control),
  ];
  const rate = captions?.borrowRate;
  const debtRows: PositionPanelRow[] = [
    ...debtDust.lines.map((r): PositionPanelRow => {
      const usd = lineUsd(v, r.address, r.amount);
      return {
        id: `debt-${r.address}`,
        label: `${r.symbol} borrowed`,
        tip: `The ${r.symbol} this account owes: the market's borrow balance, with its oracle value and its share of the debt.`,
        value: (
          <LineValue
            amount={
              <Prov info={borrowProv(r)}>
                <ExactSpan exact={formatUnitsExact(r.amountRaw, r.decimals)} symbol={r.symbol}>
                  {formatCompact(r.amount)} {r.symbol}
                </ExactSpan>
              </Prov>
            }
            usd={usd}
            share={usd != null && debtUsd ? usd / debtUsd : null}
            usdWhat={`${r.symbol} borrowed`}
          />
        ),
      };
    }),
    ...dustRow("dust-debt", debtDust.control),
  ];
  const right: PositionPanelRow[] = [
    ...(rate
      ? [
          {
            id: "borrow-rate",
            label: rate.avg ? "Average borrow rate" : "Borrow rate",
            tip: rate.avg
              ? "The live variable borrow rate of each borrowed market, annualised from its per-timestamp rate and weighted by the debt in each."
              : `The live variable borrow rate on the ${rate.symbol} market, annualised from its per-timestamp rate.`,
            value: <BorrowRateValue rate={rate} />,
          },
        ]
      : []),
    ...moonwellRiskRows(chain),
  ];
  const headsWithRows = heads.map((h) =>
    h.id === "collateral" && collRows.length > 0
      ? { ...h, assetRows: collRows }
      : h.id === "debt" && debtRows.length > 0
        ? { ...h, assetRows: debtRows }
        : h,
  );
  return { ...detailCommon, heads: headsWithRows, outcome: undefined, panel: [left, right] };
}

/** The Moonwell position card: its slots, drawn by the shared card. */
export function MoonwellPositionCard(props: MoonwellPositionCardProps) {
  return <PositionCard slots={useMoonwellCardSlots(props)} />;
}

/** Why the transaction count and the event count differ. */
const txCountNote = (liquidations: number) =>
  liquidations > 0
    ? "the count leaves out each liquidation, which is the liquidator's transaction, and one transaction can hold several rows (a liquidation and its seizure, or a repayment and a withdrawal)"
    : "one transaction can hold several rows (a repayment and a withdrawal)";

/** A liquidated card's two dates: the last liquidation, then the closing,
 *  when they fall on different days. An account liquidated more than once
 *  says the date is the last of its count. */
function outcomeDates(v: MoonwellPositionView): { label: string; at: number }[] | undefined {
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
export function viewFromSummary(s: MoonwellPositionSummary): MoonwellPositionView {
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
    ratesByMarket: s.ratesByMarket,
  };
}
