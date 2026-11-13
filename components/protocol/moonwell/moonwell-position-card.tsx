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
// the basis). The Credit remaining headline and the panel's risk rows ride the
// detail page's live Comptroller read — the listing card still asserts no
// health column (the listing snapshot carries none).

import { headReadOf, serverReadOf, stampServerRead, type ServerRead } from "@/lib/shared/server-head-read";
import { TitleTip } from "@/components/shared/reveal-tip";
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
import { AssetBreakdownPanel, type AssetBreakdown } from "@/components/shared/asset-donut";
import { WalletPill } from "@/components/shared/wallet-pill";
import { formatUnitsExact, formatUsdValue } from "@/lib/utils/format";
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
import { moonwellCreditHead, moonwellRiskRows } from "./moonwell-risk-slot";
import { moonwellCollateralFactorProv, type MoonwellLane } from "@/lib/moonwell/position-provenance";
import { MoonwellMenuRows } from "./moonwell-menu-rows";
import { formatCompact, formatCompactUsd } from "@/lib/shared/format-compact";
import { TokenFigure } from "@/components/shared/token-figure";
import { PanelFigure } from "@/components/shared/position-card-panel";

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
  /** The block the exchange rates, prices and rates above were read at and
   *  who answered (`MoonwellPositionSummary.marketRead`). */
  marketRead?: MoonwellPositionSummary["marketRead"];
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

/** rails-server's read (live or stored) of the market state a view's
 *  exchange rates, prices and rates come from; undefined where the web read
 *  the chain, and the receipts keep "@ head". */
const marketReadBy = (v: MoonwellPositionView): ServerRead | undefined =>
  v.marketRead ? headReadOf(v.marketRead.head, v.marketRead.blockNumber, v.marketRead.stored) : undefined;

/** The receipts behind each supply / debt line, and the market's receipt-token
 *  label — all resolved through the surrounding page's deployment, so a Base
 *  row never cites Ethereum's catalog or index (Ethereum's is the default).
 *  A current supply value is stamped with the market read (`marketBy`). */
function useLineReceipts(readBy?: ServerRead, marketBy?: ServerRead) {
  const dep = useMoonwellDeployment();
  return {
    supplyProv: (r: MoonwellSupplyAmount) =>
      stampServerRead(dep.card.supply(r, dep.market(r.market, r.symbol)), r.current != null ? marketBy : undefined),
    /** Debt-line provenance: the live borrowBalanceStored lane when the detail
     *  page's chain read upgraded this row, the emitted-accountBorrows lane
     *  otherwise. */
    borrowProv: (r: MoonwellBorrowAmount) =>
      stampServerRead(dep.card.debt(r, dep.market(r.market, r.symbol)), r.live ? readBy : undefined),
    mSymbolOf: (r: MoonwellSupplyAmount) => dep.market(r.market, r.symbol).mSymbol,
  };
}

const NOT_COLLATERAL_TIP =
  "Supplied and earning the supply rate, but not entered as collateral (the Comptroller's market membership, read now), so it backs no borrowing. A liquidation can still seize it.";
const FACTOR_TIP =
  "The share of each entered market's value that counts toward the borrow limit, as the Comptroller sets it now.";
/** Whether a line's market is entered as collateral; true where membership
 *  is unknown, so nothing is split without a read behind it. */
const isEntered = (v: MoonwellPositionView, address: string) =>
  !v.entered || v.entered.some((e) => e.underlying === address.toLowerCase());

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
          <AssetAmount
            value={r.amount}
            symbol={r.symbol}
            address={r.address}
            exact={formatUnitsExact(r.amountRaw, r.decimals)}
          />
        </Prov>
      ))}
    </AmountStack>
  );
}

/** A USD figure traced to the oracle read: `compact` for a side of several
 *  markets (its cents on hover), `cents` for the line under a one-market
 *  head and a panel row, `whole` in the breakdown. */
function UsdFigure({
  usd,
  what,
  form,
  marketBy,
}: {
  usd: number;
  what: string;
  form: "compact" | "cents" | "whole";
  /** The market read the oracle price came from. */
  marketBy?: ServerRead;
}) {
  const dep = useMoonwellDeployment();
  const figure = (
    <Prov info={stampServerRead(dep.card.usd(what), marketBy)}>
      {form === "cents" ? formatUsdValue(usd) : form === "compact" ? formatCompactUsd(usd) : formatUsd(usd)}
    </Prov>
  );
  return form === "cents" ? figure : <TitleTip title={formatUsdValue(usd)}>{figure}</TitleTip>;
}

/** "84% · 88%", each with its market's icon: the entered markets the card
 *  lists, each at the factor the Comptroller applies to it now. */
function factorsRow(
  v: MoonwellPositionView,
  addresses: string[],
  lane: MoonwellLane,
  readBy?: ServerRead,
): PositionPanelRow | null {
  const rows = (v.entered ?? []).filter((e) => addresses.some((a) => a.toLowerCase() === e.underlying));
  if (rows.length === 0) return null;
  return {
    id: "collateral-factors",
    label: rows.length > 1 ? "Collateral factors" : "Collateral factor",
    tip: FACTOR_TIP,
    value: (
      <span className="inline-flex flex-wrap items-center gap-x-3">
        {rows.map((e) => (
          <TokenFigure key={e.underlying} symbol={e.symbol} address={e.underlying}>
            <Prov
              info={moonwellCollateralFactorProv(e.symbol, lane, readBy)}
            >{`${+(e.collateralFactor * 100).toFixed(1)}%`}</Prov>
          </TokenFigure>
        ))}
      </span>
    ),
  };
}

/** The borrow rate row: the live per-timestamp rate on the single borrowed
 *  market, or the debt-USD-weighted average across several. */
function BorrowRateValue({
  rate,
  marketBy,
}: {
  rate: NonNullable<MoonwellCardCaptions["borrowRate"]>;
  marketBy?: ServerRead;
}) {
  const dep = useMoonwellDeployment();
  return (
    <Prov info={stampServerRead(rate.avg ? dep.card.avgBorrowRate() : dep.card.borrowRate(rate.symbol), marketBy)}>
      {rate.pct.toFixed(2)}%
    </Prov>
  );
}

export interface MoonwellPositionCardProps {
  v: MoonwellPositionView;
  /** `detail` on the position page (receipts, panel, (i)); `listing` in a row. */
  surface: "detail" | "listing";
  /** The page's live Comptroller read: the Credit remaining headline and the
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
  const marketBy = marketReadBy(v);
  const { supplyProv, borrowProv, mSymbolOf } = useLineReceipts(serverReadOf(chain), marketBy);
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
  // the "Show dust" control puts them back.
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
    <WalletPill wallet={v.wallet} ensName={null} filterProtocol={session} bookmark />
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
            <UsdFigure usd={collUsd} what="Collateral" form="compact" marketBy={marketBy} />
          ) : (
            <AmountStack>
              {collDust.lines.map((r) => (
                <Prov key={r.address} info={supplyProv(r)}>
                  <AssetAmount
                    value={supplyAmount(r)}
                    symbol={r.symbol}
                    address={r.address}
                    exact={r.current != null ? formatUnitsExact(r.mTokensRaw, 8) : String(r.principal)}
                    {...(r.current != null ? { exactUnit: mSymbolOf(r) } : {})}
                  />
                </Prov>
              ))}
            </AmountStack>
          ),
        assets:
          vc.supplies.length > 0 ? (
            <InlineAssetCluster assets={suppliesShown.map((r) => ({ symbol: r.symbol, address: r.address }))} />
          ) : undefined,
        total:
          collUsd != null ? { usd: collUsd, info: stampServerRead(dep.card.usd("Collateral"), marketBy) } : undefined,
      },
      {
        id: "debt",
        label: CARD_VOCAB.debt,
        value:
          v.borrows.length === 0 ? null : debtUsd != null ? (
            <UsdFigure usd={debtUsd} what="Borrowed" form="compact" marketBy={marketBy} />
          ) : (
            <AmountStack>
              {debtDust.lines.map((r) => (
                <Prov key={r.address} info={borrowProv(r)}>
                  <AssetAmount
                    value={r.amount}
                    symbol={r.symbol}
                    address={r.address}
                    exact={formatUnitsExact(r.amountRaw, r.decimals)}
                  />
                </Prov>
              ))}
            </AmountStack>
          ),
        assets:
          v.borrows.length > 0 ? (
            <InlineAssetCluster assets={borrowsShown.map((r) => ({ symbol: r.symbol, address: r.address }))} />
          ) : undefined,
        total:
          debtUsd != null ? { usd: debtUsd, info: stampServerRead(dep.card.usd("Borrowed"), marketBy) } : undefined,
      },
    ];
    // One market on a side: its amount with its icon, the dollars beneath
    // (the Liquity V2 headline).
    if (vc.supplies.length === 1) {
      const r = vc.supplies[0];
      heads[0] = {
        ...heads[0],
        value: (
          <Prov info={supplyProv(r)}>
            <AssetAmount
              value={supplyAmount(r)}
              symbol={r.symbol}
              address={r.address}
              exact={r.current != null ? formatUnitsExact(r.mTokensRaw, 8) : String(r.principal)}
              {...(r.current != null ? { exactUnit: mSymbolOf(r) } : {})}
            />
          </Prov>
        ),
        assets: undefined,
        usd:
          collUsd != null ? (
            <span className="font-bold text-green-400">
              <UsdFigure usd={collUsd} what="Collateral" form="cents" marketBy={marketBy} />
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
            <AssetAmount
              value={r.amount}
              symbol={r.symbol}
              address={r.address}
              exact={formatUnitsExact(r.amountRaw, r.decimals)}
            />
          </Prov>
        ),
        assets: undefined,
        usd:
          debtUsd != null ? (
            <span className="font-bold text-green-400">
              <UsdFigure usd={debtUsd} what="Borrowed" form="cents" marketBy={marketBy} />
            </span>
          ) : null,
      };
    }
    // Credit remaining rides the detail page's live Comptroller read; the
    // listing snapshot carries none, so a listing card asserts no risk
    // column (never dashed, never staled).
    const credit = detail ? moonwellCreditHead(chain, v.borrows.length > 0) : null;
    if (credit) heads.push(credit);
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

  const collateralFactors = factorsRow(
    v,
    vc.supplies.map((r) => r.address),
    { comptroller: dep.comptroller, positionRoute: dep.positionRoute },
    serverReadOf(chain),
  );
  // Each side's markets open under its headline (the chevron by the icons);
  // the panel keeps the additive values and the supplies that are not
  // collateral.
  const usdCell = (usd: number | null, what: string) =>
    usd != null ? (
      <span className="text-foreground">
        <UsdFigure usd={usd} what={what} form="whole" marketBy={marketBy} />
      </span>
    ) : undefined;
  // A side of supplies as a breakdown: each line's amount and dollars, the
  // dust behind the toggle.
  const supplyBreakdown = (
    kind: "collateral" | "other",
    { lines, control }: { lines: MoonwellSupplyAmount[]; control: ReactNode },
  ): AssetBreakdown => ({
    assets: lines.map((r) => {
      const usd = lineUsd(v, r.address, supplyAmount(r));
      return {
        id: `${kind}-${r.address}`,
        symbol: r.symbol,
        address: r.address,
        usd,
        amount: (
          <Prov info={supplyProv(r)}>
            <ExactSpan
              exact={r.current != null ? formatUnitsExact(r.mTokensRaw, 8) : String(r.principal)}
              symbol={r.current != null ? mSymbolOf(r) : r.symbol}
            >
              {formatCompact(supplyAmount(r))}
            </ExactSpan>
          </Prov>
        ),
        usdText: usdCell(usd, `${r.symbol} supplied`),
      };
    }),
    dust: control ?? undefined,
  });
  const collBreakdown = supplyBreakdown("collateral", collDust);
  // The supplies not entered as collateral: many and priced, their total and
  // icons open the breakdown (C19), as Aave V3's and Spark's do; otherwise
  // each line under the total.
  const notCollTotal =
    otherUsd != null
      ? { usd: otherUsd, info: stampServerRead(dep.card.usd("Supplied, not collateral"), marketBy) }
      : null;
  const othersByValue = [...vo.supplies].sort((a, b) => (supplyLineUsd(v)(b) ?? -1) - (supplyLineUsd(v)(a) ?? -1));
  const notCollRow: PositionPanelRow | null =
    vo.supplies.length === 0
      ? null
      : vo.supplies.length > 1 && notCollTotal
        ? {
            id: "not-collateral",
            label: "Supplied, not collateral",
            tip: NOT_COLLATERAL_TIP,
            value: (
              <UsdFigure usd={notCollTotal.usd} what="Supplied, not collateral" form="compact" marketBy={marketBy} />
            ),
            breakdown: {
              assets: splitDust(vo.supplies, supplyLineUsd(v)).shown.map((r) => ({
                symbol: r.symbol,
                address: r.address,
              })),
              total: notCollTotal,
              panel: (
                <AssetBreakdownPanel
                  id="moonwell-not-collateral-breakdown"
                  name="Supplied, not collateral"
                  side="collateral"
                  breakdown={supplyBreakdown("other", otherDust)}
                />
              ),
            },
          }
        : {
            id: "not-collateral",
            label: "Supplied, not collateral",
            tip: NOT_COLLATERAL_TIP,
            value: (
              <span className="flex flex-col gap-0.5">
                {notCollTotal && (
                  <PanelFigure>
                    <UsdFigure
                      usd={notCollTotal.usd}
                      what="Supplied, not collateral"
                      form="compact"
                      marketBy={marketBy}
                    />
                  </PanelFigure>
                )}
                {othersByValue.map((r) => (
                  <span key={r.address}>
                    <TokenFigure symbol={r.symbol} address={r.address}>
                      <Prov info={supplyProv(r)}>
                        <ExactSpan
                          exact={r.current != null ? formatUnitsExact(r.mTokensRaw, 8) : String(r.principal)}
                          symbol={r.current != null ? mSymbolOf(r) : r.symbol}
                        >
                          {formatCompact(supplyAmount(r))}
                        </ExactSpan>
                      </Prov>
                    </TokenFigure>
                  </span>
                ))}
              </span>
            ),
          };
  const left: PositionPanelRow[] = [
    ...(collateralFactors ? [collateralFactors] : []),
    ...(notCollRow ? [notCollRow] : []),
  ];
  const rate = captions?.borrowRate;
  const debtBreakdown: AssetBreakdown = {
    assets: debtDust.lines.map((r) => {
      const usd = lineUsd(v, r.address, r.amount);
      return {
        id: `debt-${r.address}`,
        symbol: r.symbol,
        address: r.address,
        usd,
        amount: (
          <Prov info={borrowProv(r)}>
            <ExactSpan exact={formatUnitsExact(r.amountRaw, r.decimals)} symbol={r.symbol}>
              {formatCompact(r.amount)}
            </ExactSpan>
          </Prov>
        ),
        usdText: usdCell(usd, `${r.symbol} borrowed`),
      };
    }),
    dust: debtDust.control ?? undefined,
  };
  const right: PositionPanelRow[] = [
    ...(rate
      ? [
          {
            id: "borrow-rate",
            label: rate.avg ? "Average borrow APY" : "Borrow APY",
            tip: rate.avg
              ? "The live variable borrow APY of each borrowed market, compounded every second from its per-second rate and weighted by the debt in each."
              : `The live variable borrow APY on the ${rate.symbol} market, compounded every second from its per-second rate.`,
            value: <BorrowRateValue rate={rate} marketBy={marketBy} />,
          },
        ]
      : []),
    ...moonwellRiskRows(chain),
  ];
  // The headlines' read-mores on a detail card.
  const HEAD_TIP = {
    collateral:
      "What the account supplies to Moonwell's markets, in dollars at Moonwell's oracle prices, earning each market's supply rate. The markets entered as collateral back its borrowing.",
    debt: "What the account owes Moonwell's markets, in dollars at Moonwell's oracle prices, including the interest accrued at each market's borrow rate.",
  };
  const tipped = (h: PositionCardHead): PositionCardHead =>
    h.labelTip || !(h.label === CARD_VOCAB.collateral || h.label === CARD_VOCAB.debt)
      ? h
      : { ...h, labelTip: h.id === "debt" ? HEAD_TIP.debt : HEAD_TIP.collateral };
  const headsWithRows = heads
    .map(tipped)
    .map((h) =>
      h.id === "collateral" && vc.supplies.length > 1
        ? { ...h, breakdown: collBreakdown }
        : h.id === "debt" && v.borrows.length > 1
          ? { ...h, breakdown: debtBreakdown }
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
    marketRead: s.marketRead,
  };
}
