"use client";

// The Aave V3 position card, for Aave V3 on Ethereum and Base and for
// Seamless (the deployment rides `AaveV3CardDeploymentProvider`). It is a slot
// builder (rails-ops TO-DO-position-card 322): `useAaveV3CardSlots` turns the
// position's view and the page's live Pool read into one `PositionCardSlots`
// object, and the shared `PositionCard` (components/shared/position-card.tsx)
// draws it on the position page and in the listing row.
//
// An Aave V3 account is cross-collateralised: one wallet supplies and borrows
// MANY reserves within one market (Core / Prime / EtherFi is a separate Pool =
// a separate account). Every figure is read from the chain — each reserve's
// supplied / borrowed balance is the index's scaled-balance reduction
// (0008/0011): the current rebased figure, interest included, equal to the
// aToken / variableDebtToken `balanceOf` at the indexed head. The headlines are
// each side's oracle-USD total with the reserves' icons beside it; the panel
// holds one row per reserve, the borrow rate, the interest inside each side,
// the room to borrow, the liquidation read and the eMode category. A LISTING
// card carries no health factor (rails-ops decision 0018): a listing exists to
// find a position, and risk is read live on the position page — whose Pool
// getUserAccountData read is the only HF this card ever shows.

import { useState, type ReactNode } from "react";
import { Link2 } from "lucide-react";
import {
  PositionCard,
  type PositionCardExports,
  type PositionCardHead,
  type PositionCardSlots,
  type PositionCardStatus,
  type PositionPanelRow,
} from "@/components/shared/position-card";
import { Icon } from "@/components/icons/icon";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { RevealTip } from "@/components/shared/reveal-tip";
import { AssetAmount } from "@/components/shared/asset-amount";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import type { AssetBreakdown } from "@/components/shared/asset-donut";
import { TokenAmountNotLoaded, loadedSymbols } from "@/components/shared/not-loaded";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { WalletPill } from "@/components/shared/wallet-pill";
import { ExactSpan } from "@/components/shared/amount-text";
import { DustToggle, splitDust, useDustOpen } from "@/components/shared/dust-reserves";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { formatDate } from "@/lib/date";
import { formatUnitsExact, formatCompact } from "@/lib/utils/format";
import { formatUsd } from "@/lib/shared/format-event";
import { fmtLiqPrice, fmtUsd } from "@/lib/aave-v4/format";
import { CARD_VOCAB, ratioLabel, notRecordedNote } from "@/lib/shared/card-vocab";
import {
  accountDataProv,
  avgBorrowRateProv,
  reserveDataProv,
  userEmodeProv,
  type V3PoolLane,
} from "@/lib/aave-v3/position-provenance";
import { useV3Pool } from "@/lib/aave-v3/pool-context";
import { hfLabelV3 } from "@/lib/aave-v3/position-state";
import { aaveV3LiquidationRead, type AaveV3CardCaptions } from "@/lib/aave-v3/chain-truth-tower";
import {
  AaveV3CardDeploymentProvider,
  useAaveV3CardDeployment,
  type AaveV3CardDeployment,
} from "@/lib/aave-v3/card-deployment";
import { aaveV3PositionModal, type AaveV3Deployment } from "@/lib/aave-v3/event-templates";
import type { AaveV3PositionRow, AaveV3ReserveSummary } from "@/lib/api/fetch-aave-v3-positions";
import type { AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";

/** One reserve the wallet holds on a given side, scaled to display units. The
 *  `amountRaw` integer wei string backs the exact reveal (the raw chain figure). */
export interface AaveV3ReserveAmount {
  symbol: string;
  address: string;
  decimals: number;
  amount: number;
  amountRaw: string;
  /** The token's `decimals` was not read, so `amount` has no known scale and
   *  is never shown (see AaveV3ReserveSummary.decimalsUnread). */
  decimalsUnread?: true;
}

export interface AaveV3PositionView {
  wallet: string;
  /** core | prime | etherfi — which Pool this cross-collateralised account is on. */
  market: string;
  /** "unread" is a listing row whose account has not been read from the
   *  chain yet — no state recorded, never mapped to "closed" (0018). */
  status: "open" | "closed" | "liquidated" | "unread";
  supplies: AaveV3ReserveAmount[];
  borrows: AaveV3ReserveAmount[];
  /** Highest recorded per-reserve supply / debt (closed / liquidated cards). */
  peakSupplies: AaveV3ReserveAmount[];
  peakBorrows: AaveV3ReserveAmount[];
  liquidationCount: number;
  /** Non-liquidation transaction count (activity-meta). */
  txCount: number;
  /** The position's events, where the page knows them: the count's tip gives both. */
  eventTotal?: number | null;
  /** Why the events and the transactions differ, after both in the count's tip. */
  countNote?: string;
  /** What the transaction count counts, added to its tip. */
  countRule?: string;
  /** What the liquidation count counts, added to its tip. */
  liquidationRule?: string;
  /** Unix seconds of the most recent event (activity-meta). */
  lastActivityAt: number;
  /** On-chain oracle USD (IAaveOracle, chain-derived) per reserve, keyed by
   *  lowercased token address. Feeds the card's USD figures; a reserve the
   *  oracle didn't price is simply absent (the total then omits). */
  priceByAddress?: Record<string, number>;
  atBlock?: number;
  /** The position page's live health factor (the Pool's getUserAccountData,
   *  read on visit). Null = no debt when read; meaningless when
   *  `chainHfStale`. A listing view never carries one (0018). */
  healthFactor?: number | null;
  /** True when no live read stands behind `healthFactor` — every listing
   *  view, and the position page until its chain read lands — so the HF
   *  headline is omitted (or pending, on a page still reading) rather than
   *  asserted. */
  chainHfStale?: boolean;
}

/** On-chain oracle USD for one reserve; null when this market didn't price it. */
function reserveUsd(v: AaveV3PositionView, address: string, amount: number): number | null {
  const p = v.priceByAddress?.[address.toLowerCase()];
  return typeof p === "number" && p > 0 ? amount * p : null;
}

/** Total USD across a set of reserves, with the STRICT guard from Aave's on-chain
 *  USD: null the moment any contributing reserve is unpriced, so a partial total is
 *  never asserted (the side then shows its token amounts). */
function totalUsd(v: AaveV3PositionView, reserves: AaveV3ReserveAmount[]): number | null {
  let sum = 0;
  let any = false;
  for (const r of reserves) {
    if (r.decimalsUnread) return null;
    if (r.amount <= 0) continue;
    const u = reserveUsd(v, r.address, r.amount);
    if (u == null) return null;
    sum += u;
    any = true;
  }
  return any ? sum : null;
}

/** Reserves sorted by oracle-USD value, largest first — so the capped icon
 *  cluster and the panel's reserve rows foreground worth over token
 *  count (76 wstETH outranks 8.5K sDAI). Falls back to the incoming
 *  raw-balance order the moment any leg is unpriced or `priceByAddress` is
 *  absent — a rank the oracle can't back is never asserted. */
function rankByValue(v: AaveV3PositionView, reserves: AaveV3ReserveAmount[]): AaveV3ReserveAmount[] {
  const usd = new Map<string, number>();
  for (const r of reserves) {
    const u = r.decimalsUnread ? null : reserveUsd(v, r.address, r.amount);
    if (u == null) return reserves;
    usd.set(r.address, u);
  }
  return [...reserves].sort((a, b) => (usd.get(b.address) ?? 0) - (usd.get(a.address) ?? 0));
}

/** One reserve's oracle USD for the dust rule; null (held) when unpriced or
 *  its decimals were not read. */
const dustUsdOf =
  (v: AaveV3PositionView) =>
  (r: AaveV3ReserveAmount): number | null =>
    r.decimalsUnread ? null : reserveUsd(v, r.address, r.amount);

/** Neutral HF headline (Rails doesn't color-code risk): "∞" above 100 — the
 *  figure stops meaning anything as a ratio there — else the family's format
 *  (four decimals below 1.1, as the event tiles and the prose). */
function hfLabel(hf: number): string {
  return hf >= 100 ? "∞" : hfLabelV3(hf);
}

function rawBigInt(raw: string | null | undefined): bigint {
  if (raw == null || raw === "") return BigInt(0);
  try {
    return BigInt(raw.split(".")[0]);
  } catch {
    return BigInt(0);
  }
}

function scaleRaw(raw: string | null | undefined, decimals: number): number {
  return Number(rawBigInt(raw)) / 10 ** decimals;
}

/** A side's oracle-USD total as a headline figure, its cents on hover. */
/** The headlines' read-mores on a detail card. */
const SIDE_TIP = {
  supply:
    "What the account supplies to the Pool, in dollars at the Pool's oracle prices, earning each asset's supply rate. The assets enabled as collateral back its borrowing.",
  debt: "What the account owes the Pool, in dollars at the Pool's oracle prices, including the interest accrued at each asset's variable borrow rate.",
} as const;
const HF_TIP =
  "The collateral, each asset counted up to its liquidation threshold, divided by the debt. Below 1 the account can be liquidated.";

function UsdFigure({ usd, info }: { usd: number; info: Provenance }) {
  return (
    <RevealTip tip={"$" + usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}>
      <Prov info={info}>{formatUsd(usd)}</Prov>
    </RevealTip>
  );
}

/** A headline's reserves as token amounts, one per line, each traced: an
 *  unpriced side's figure, and a closed account's highest recorded balances
 *  (no USD there: the peaks are maxima at different moments, so pricing them
 *  at one block would assert a portfolio that never existed). */
function ReserveAmounts({
  reserves,
  receipt,
}: {
  reserves: AaveV3ReserveAmount[];
  receipt: (r: AaveV3ReserveAmount) => Provenance;
}) {
  return (
    <span className="flex flex-col gap-1">
      {reserves.map((r) => (
        <Prov key={r.address} info={receipt(r)}>
          {r.decimalsUnread ? (
            <TokenAmountNotLoaded address={r.address} label={r.symbol} />
          ) : (
            <AssetAmount value={r.amount} symbol={r.symbol} exact={formatUnitsExact(r.amountRaw, r.decimals)} />
          )}
        </Prov>
      ))}
    </span>
  );
}

/** The ⋮'s row for this position: a link to its page. An Aave V3 account has
 *  no ID or NFT of its own; the wallet and the market name it. */
function AaveV3MenuRows({ pagePath }: { pagePath: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <ToolsMenuItem
      icon={copied ? <Icon name="check" size={16} /> : <Link2 size={16} className="-rotate-45" />}
      title="Link to this position"
      subtitle={copied ? "Copied" : "Copy the page's address"}
      onClick={() =>
        void navigator.clipboard.writeText(`${window.location.origin}${pagePath}`).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    />
  );
}

/** The position page of each deployment, for the ⋮'s link. */
function pagePathOf(session: string, v: AaveV3PositionView): string {
  if (session === "aave-v3-base") return `/base/aave-v3/${v.wallet}`;
  if (session === "seamless") return `/base/seamless/${v.wallet}`;
  return `/ethereum/aave-v3/${v.wallet}?market=${v.market}`;
}

export interface AaveV3PositionCardProps {
  v: AaveV3PositionView;
  /** The position page's card (`detail`: receipts, panel, ⋮, (i)); absent in
   *  a listing row. */
  receipts?: boolean;
  /** The card's (i) Explanation. */
  explanation?: ReactNode;
  /** The pane's copy-this-view link: the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** Detail-page figures (accrued interest, borrow rate) — computed from the
   *  event stream + live Pool read (computeAaveV3CardCaptions). */
  captions?: AaveV3CardCaptions;
  /** The page's live Pool read: the room to borrow and the eMode category. */
  chain?: AaveV3PositionChainResponse | null;
  /** The page is still waiting on its live Pool read: the health factor holds
   *  its place with a pulsing bar until the read lands. */
  hfPending?: boolean;
  /** Which deployment the row describes — its session, market label and the
   *  receipts behind every figure. Ethereum's indexed lane by default; a Base
   *  lender passes its own (lib/aave-v3/card-deployment.tsx). */
  deployment?: AaveV3CardDeployment;
  /** Whether this lane records "highest recorded" balances at all. A Base
   *  LISTING row has no replay behind it, so its closed cards say so instead
   *  of showing a dash as if nothing was ever held; the position page's
   *  sweep supplies the peaks, so it keeps the default. */
  peaks?: boolean;
  /** The page is still reading the oracle prices: the USD headlines pulse in
   *  place, so nothing moves when the dollars land. */
  pricesPending?: boolean;
  /** The ⋮'s export shapes (`aaveV3Exports`); `null` leaves the ⋮ with the
   *  link to the position and the provenance row. */
  exports?: PositionCardExports | null;
}

/** The Aave V3 family's slots for the shared position card. */
export function useAaveV3CardSlots({
  v,
  receipts = false,
  explanation,
  viewHref,
  captions,
  chain,
  hfPending = false,
  peaks = true,
  pricesPending = false,
  exports,
}: Omit<AaveV3PositionCardProps, "deployment">): PositionCardSlots {
  const dep = useAaveV3CardDeployment();
  const lane = useV3Pool();
  const dust = useDustOpen();
  const detail = receipts;

  const marketLabel = dep.marketLabel(v.market);
  // What the market label is, on hover (270 item 6: it carries information).
  const marketTitle = marketLabel
    ? `${marketLabel} is one of the Aave V3 markets on Ethereum. Each market is a separate account with a separate health factor.`
    : undefined;
  const marketBadge = marketLabel ? (
    <span
      className="text-xs font-semibold text-rb-500 header-badge-tip focus-ring rounded-sm"
      title={marketTitle}
      data-tooltip={marketTitle}
      tabIndex={detail ? 0 : undefined}
    >
      {marketLabel}
    </span>
  ) : null;
  // The listing names the wallet (its controls are buttons, which can sit
  // inside the row's <Link>) and the market; the position page names the wallet in its
  // top row (ui-jobs 228) and keeps the market at the heading's right end.
  const identity = detail ? (
    (marketBadge ?? undefined)
  ) : (
    <span className="flex items-center gap-2">
      <WalletPill wallet={v.wallet} ensName={null} filterProtocol={dep.session} bookmarkProtocol={dep.session} />
      {marketBadge}
    </span>
  );

  const counters = {
    lastActivityAt: v.lastActivityAt,
    eventCount: v.txCount,
    eventTotal: v.eventTotal,
    liquidationCount: v.liquidationCount,
    countNote: v.countNote,
    countRule: v.countRule,
    liquidationRule: v.liquidationRule,
    ...(detail ? { order: "age-last" as const } : {}),
  };

  // The "?" every state panel owns — the same content function serves Aave V3
  // on Ethereum, Aave V3 on Base, and Seamless; only the deployment named by
  // the card's session changes the prose.
  const positionDeployment: AaveV3Deployment =
    dep.session === "aave-v3-base" || dep.session === "seamless" ? dep.session : "aave-v3";
  const learnMore = aaveV3PositionModal(v.status, positionDeployment, v.borrows.length > 0);
  const menuSlot = {
    leading: () => <AaveV3MenuRows pagePath={pagePathOf(dep.session, v)} />,
    exports: exports ?? null,
  };
  const explainer = { body: explanation ?? null, viewHref };

  // Closed / liquidated: the account holds no open reserves, so the headline is
  // what each asset held at its height — highest recorded per-reserve supply +
  // debt (chain-state MAX over the account's life, per asset; no USD).
  if (v.status === "closed" || v.status === "liquidated") {
    const notRecorded = peaks ? undefined : notRecordedNote("position");
    const peakHead = (
      id: string,
      label: string,
      reserves: AaveV3ReserveAmount[],
      receipt: (symbol: string) => Provenance,
    ): PositionCardHead => ({
      id,
      label,
      value:
        peaks && reserves.length > 0 ? <ReserveAmounts reserves={reserves} receipt={(r) => receipt(r.symbol)} /> : null,
      sub: notRecorded,
    });
    const liquidated = v.status === "liquidated";
    const status: PositionCardStatus = liquidated
      ? { word: "Liquidated", tone: "danger" }
      : { word: "Closed", tone: "muted" };
    const common = {
      status,
      // The peaks are supplied balances, collateral or not.
      heads: [
        peakHead("peak-supplied", "Highest recorded supplied", v.peakSupplies, dep.peakSupply),
        peakHead("peak-debt", CARD_VOCAB.peakDebt, v.peakBorrows, dep.peakDebt),
      ],
      identity,
      counters,
      outcome: {
        word: liquidated ? "Liquidated" : "Closed",
        dates: v.lastActivityAt ? [{ at: v.lastActivityAt }] : undefined,
      },
    };
    if (!detail) return { ...common, surface: "listing", menu: null };
    return { ...common, surface: "detail", explainer, learnMore, menu: menuSlot };
  }

  const collUsd = totalUsd(v, v.supplies);
  const debtUsd = totalUsd(v, v.borrows);
  // Prices still loading: the side's figure pulses where the dollars will be.
  const collPending = pricesPending && collUsd == null;
  const debtPending = pricesPending && debtUsd == null;
  // Value order for the cluster and the panel rows — the three visible icons
  // are the three largest by oracle USD. Dust reserves (under a cent) leave the
  // icon stack and its "+N"; the panel puts them behind the dust row.
  const usdOf = dustUsdOf(v);
  const suppliesRanked = rankByValue(v, v.supplies);
  const borrowsRanked = rankByValue(v, v.borrows);
  const suppliesSplit = splitDust(suppliesRanked, usdOf);
  const borrowsSplit = splitDust(borrowsRanked, usdOf);

  const sideHead = (
    id: string,
    label: string,
    reserves: AaveV3ReserveAmount[],
    shown: AaveV3ReserveAmount[],
    usd: number | null,
    pending: boolean,
    usdWhat: string,
    side: "supply" | "debt",
  ): PositionCardHead => {
    // One reserve: its amount with its icon, the dollars beneath (the
    // Liquity V2 headline).
    const one = reserves.length === 1 && !reserves[0].decimalsUnread ? reserves[0] : null;
    if (one)
      return {
        id,
        label,
        labelTip: detail ? SIDE_TIP[side] : undefined,
        value: (
          <Prov info={side === "supply" ? dep.supply(one.symbol, v.atBlock) : dep.debt(one.symbol, v.atBlock)}>
            <AssetAmount
              value={one.amount}
              symbol={one.symbol}
              address={one.address}
              exact={formatUnitsExact(one.amountRaw, one.decimals)}
            />
          </Prov>
        ),
        pending: false,
        usd:
          usd != null ? (
            <Prov info={dep.usd(usdWhat)}>
              <span className="font-bold text-green-400">{formatUsd(usd)}</span>
            </Prov>
          ) : pending ? (
            <span className="inline-block h-3 w-16 animate-pulse rounded-md bg-rb-200 dark:bg-rb-700" />
          ) : null,
      };
    return {
      id,
      label,
      labelTip: detail ? SIDE_TIP[side] : undefined,
      value:
        reserves.length === 0 ? null : usd != null ? (
          <UsdFigure usd={usd} info={dep.usd(usdWhat)} />
        ) : (
          // A partial USD total is never asserted: an unpriced side shows its
          // token amounts.
          <ReserveAmounts
            reserves={reserves}
            receipt={(r) => (side === "supply" ? dep.supply(r.symbol, v.atBlock) : dep.debt(r.symbol, v.atBlock))}
          />
        ),
      pending: reserves.length > 0 && pending,
      total: usd != null ? { usd, info: dep.usd(usdWhat) } : undefined,
      assets: reserves.length > 0 && usd != null ? <InlineAssetCluster symbols={loadedSymbols(shown)} /> : undefined,
    };
  };

  // The health factor: the position page's live read. Omitted on every
  // listing view and on a deployment with no live HF receipt — an unasserted
  // layer, per the chain-state charter; pending on a page still reading. A
  // read wallet with no debt reads "No debt" (HF is undefined, ∞ in protocol
  // terms) — but only when the card shows no debt either. The balances are
  // the index's, which trails the live read: a debt the read no longer finds
  // gets a dash and the reason in the notice.
  const hfProv = dep.healthFactor;
  const hfRead = !v.chainHfStale && !!hfProv;
  const noDebtRead = hfRead && v.healthFactor == null && v.borrows.length > 0;
  const hfHead: PositionCardHead | null =
    hfProv && (hfRead || (detail && hfPending))
      ? {
          id: "health-factor",
          label: ratioLabel("pooled"),
          labelTip: detail && ratioLabel("pooled") === "Health factor" ? HF_TIP : undefined,
          pending: !hfRead,
          value: !hfRead ? null : noDebtRead ? null : v.healthFactor == null ? (
            <span className="text-rb-400">No debt</span>
          ) : (
            <Prov info={hfProv(v.market, v.atBlock)}>{hfLabel(v.healthFactor)}</Prov>
          ),
        }
      : null;

  const heads = [
    sideHead(
      "collateral",
      CARD_VOCAB.collateral,
      v.supplies,
      suppliesSplit.shown,
      collUsd,
      collPending,
      "Collateral",
      "supply",
    ),
    sideHead("debt", CARD_VOCAB.debt, v.borrows, borrowsSplit.shown, debtUsd, debtPending, "Borrowed", "debt"),
    ...(hfHead ? [hfHead] : []),
  ];

  // No Borrowing or Supply only tag (270): the figures say which it is. A
  // health factor below 1 is the one live state the tag names.
  const status: PositionCardStatus | null =
    v.status === "unread"
      ? { word: "Not loaded", tone: "muted" }
      : hfRead && v.borrows.length > 0 && v.healthFactor != null && v.healthFactor < 1
        ? { word: "Liquidatable", tone: "caution" }
        : null;

  const notice = noDebtRead ? (
    <div className="mb-2 text-xs text-rb-500">
      The Pool reads no debt{v.atBlock != null ? ` at block ${v.atBlock.toLocaleString("en-US")}` : ""}; the balances
      shown predate the account&rsquo;s latest events
    </div>
  ) : undefined;

  const common = { status, heads, identity, counters, notice };
  if (!detail) return { ...common, surface: "listing", menu: null };

  // ── Each side's reserve rows, and the panel: the supplied side's values
  //    on the left, the borrowed side's and the risk on the right.
  const reserveBreakdown = (
    side: "supply" | "debt",
    split: { shown: AaveV3ReserveAmount[]; dust: AaveV3ReserveAmount[] },
  ): AssetBreakdown => {
    const dustByValue = [...split.dust].sort((a, b) => (usdOf(b) ?? 0) - (usdOf(a) ?? 0));
    const lines = dust.open ? [...split.shown, ...dustByValue] : split.shown;
    return {
      assets: lines.map((r) => {
        const usd = r.decimalsUnread ? null : reserveUsd(v, r.address, r.amount);
        return {
          id: `${side}-${r.address.toLowerCase()}`,
          symbol: r.symbol,
          address: r.address,
          usd,
          amount: r.decimalsUnread ? (
            <TokenAmountNotLoaded address={r.address} label={r.symbol} />
          ) : (
            <Prov info={side === "supply" ? dep.supply(r.symbol, v.atBlock) : dep.debt(r.symbol, v.atBlock)}>
              <ExactSpan exact={formatUnitsExact(r.amountRaw, r.decimals)} symbol={r.symbol}>
                {formatCompact(r.amount)}
              </ExactSpan>
            </Prov>
          ),
          usdText:
            usd != null ? (
              <Prov info={dep.usd(`${side === "supply" ? "Supplied" : "Borrowed"} ${r.symbol}`)}>{formatUsd(usd)}</Prov>
            ) : undefined,
        };
      }),
      dust:
        split.dust.length > 0 ? (
          <DustToggle count={split.dust.length} open={dust.open} onToggle={dust.toggle} />
        ) : undefined,
    };
  };

  const interestRow = (side: "supply" | "debt"): PositionPanelRow | null => {
    const usd = side === "supply" ? captions?.supplyInterestUsd : captions?.debtInterestUsd;
    const since = side === "supply" ? captions?.supplyInterestSince : captions?.debtInterestSince;
    if (usd == null || usd < 0.01 || !dep.interestCaption) return null;
    return {
      id: `${side}-interest`,
      label: side === "supply" ? "Interest earned" : "Interest charged",
      tip:
        side === "supply"
          ? "The interest inside the supplied balance, in dollars: what the balance holds beyond its deposits and withdrawals since it last started from zero."
          : "The interest inside the debt, in dollars: what the debt holds beyond its draws and repayments since it last started from zero.",
      sub: since != null ? `since ${formatDate(since)}` : undefined,
      value: <Prov info={dep.interestCaption(side)}>{formatUsd(usd)}</Prov>,
    };
  };

  // The rate's receipt names the page's Pool and route when the page
  // declared one (a Base lender); Ethereum's market Pool, resolved from the
  // address the read hit, otherwise.
  const ratePool: V3PoolLane = lane.positionRoute
    ? { ...lane, address: captions?.pool || lane.address }
    : captions?.pool || lane.address;
  const rate = captions?.borrowRate;
  const rateRow: PositionPanelRow | null = rate
    ? {
        id: "borrow-rate",
        label: rate.avg ? "Average borrow rate" : "Borrow rate",
        tip: rate.avg
          ? "The variable borrow rates of the borrowed reserves, averaged by what each debt is worth, as the Pool gives them at the latest block."
          : `The variable borrow rate the Pool charges on ${rate.symbol ?? "the borrowed reserve"} at the latest block.`,
        value: (
          <Prov
            info={
              rate.avg
                ? avgBorrowRateProv(ratePool)
                : reserveDataProv("Variable borrow APR", "currentVariableBorrowRate", rate.symbol, ratePool)
            }
          >
            {rate.pct.toFixed(2)}%
          </Prov>
        ),
      }
    : null;

  // The room left to borrow: `availableBorrowsBase` from the page's Pool read,
  // on an account that borrows.
  const chainPool: V3PoolLane | null = chain
    ? lane.positionRoute
      ? { ...lane, address: chain.pool || lane.address }
      : chain.pool
    : null;
  const roomRow: PositionPanelRow | null =
    chain && chainPool && chain.totalDebtUsd > 0 && chain.totalCollateralUsd > 0
      ? {
          id: "borrow-room",
          label: "Room to borrow",
          tip: "How much more the account can borrow, in dollars, before it reaches its loan-to-value limit, as the Pool gives it at the latest block.",
          value: (
            <Prov info={accountDataProv("Available to borrow", "availableBorrowsBase", chainPool)}>
              {fmtUsd(chain.availableBorrowsUsd).display}
            </Prov>
          ),
        }
      : null;

  // The liquidation read, a pure function of the traced health factor: one
  // supplied reserve carrying ≥99.5% of the priced collateral anchors a
  // liquidation price; otherwise the drop the whole collateral can take.
  const liq = hfRead && !noDebtRead ? aaveV3LiquidationRead(v) : null;
  const liqRow: PositionPanelRow | null = !liq
    ? null
    : liq.sameAsset
      ? {
          id: "liquidation",
          label: "Liquidation",
          tip: "One token is supplied and borrowed, so its price stands on both sides of the health factor and cancels; only the interest gap can bring the account to liquidation.",
          value: (
            <span className="inline-flex items-center gap-1">
              <TokenChipIcon symbol={liq.sameAsset.symbol} size={14} filterable={false} />
              {liq.sameAsset.symbol} on both sides: only interest moves it
            </span>
          ),
        }
      : liq.single
        ? {
            id: "liquidates-at",
            label: "Liquidates at",
            tip: `The ${liq.single.symbol} price at which the health factor reaches 1 and the account can be liquidated: the price the Pool's oracle reports, divided by the health factor.`,
            value: (
              <span className="inline-flex items-center gap-1">
                <TokenChipIcon symbol={liq.single.symbol} size={14} filterable={false} />
                <Prov info={dep.liqPrice(liq.single.symbol)}>{fmtLiqPrice(liq.single.liqPrice)}</Prov>
              </span>
            ),
          }
        : liq.dropPct != null
          ? {
              id: "liquidation-drop",
              label: "Liquidates on a drop of",
              tip: "How far the dollar value of all the collateral can fall, the debt standing still, before the health factor reaches 1 and the account can be liquidated: 1 − 1 ÷ health factor.",
              value: `${liq.dropPct.toFixed(0)}%`,
            }
          : null;

  const emode = chain?.emode ?? null;
  const emodeRow: PositionPanelRow | null =
    emode && chainPool
      ? {
          id: "emode",
          label: "eMode",
          tip: "The efficiency-mode category the account has chosen: a reserve in it is borrowed against at the category's loan-to-value and liquidation threshold, as the Pool gives them at the latest block.",
          value: <Prov info={userEmodeProv(emode.label, chainPool)}>{emode.label}</Prov>,
        }
      : null;

  const present = (rows: (PositionPanelRow | null)[]): PositionPanelRow[] =>
    rows.filter((r): r is PositionPanelRow => r != null);

  // Each side's reserves open under its headline (the chevron by the icons);
  // the panel keeps the additive values.
  const withRows = heads.map((h) =>
    h.id === "collateral" && v.supplies.length > 1
      ? { ...h, breakdown: reserveBreakdown("supply", suppliesSplit) }
      : h.id === "debt" && v.borrows.length > 1
        ? { ...h, breakdown: reserveBreakdown("debt", borrowsSplit) }
        : h,
  );
  return {
    ...common,
    heads: withRows,
    surface: "detail",
    explainer,
    learnMore,
    menu: menuSlot,
    panel: [present([interestRow("supply"), emodeRow]), present([rateRow, interestRow("debt"), roomRow, liqRow])],
  };
}

function AaveV3PositionCardBody(props: Omit<AaveV3PositionCardProps, "deployment">) {
  return <PositionCard slots={useAaveV3CardSlots(props)} />;
}

/** The Aave V3 family's position card: its slots, drawn by the shared card. */
export function AaveV3PositionCard({ deployment, ...props }: AaveV3PositionCardProps) {
  if (deployment) {
    return (
      <AaveV3CardDeploymentProvider value={deployment}>
        <AaveV3PositionCardBody {...props} />
      </AaveV3CardDeploymentProvider>
    );
  }
  return <AaveV3PositionCardBody {...props} />;
}

function statusOf(hasOpen: boolean, liquidationCount: number): AaveV3PositionView["status"] {
  if (hasOpen) return "open";
  return liquidationCount > 0 ? "liquidated" : "closed";
}

/** Split a set of reserve rows into supplied + borrowed sides, scaled to display
 *  units and ranked by raw balance. Reused for both the OPEN balances (`reserves`)
 *  and the PEAK balances (`peakReserves`, which reuse the same shape — peak supply
 *  in supplyBalanceRaw, peak debt in debtBalanceRaw). Strict chain-state: every
 *  reserve with a non-zero raw balance is shown (no dust floor) — the exact figure
 *  rides the reveal; the compact headline never renders a non-zero as "0". */
function splitSides(reserves: AaveV3ReserveSummary[]): {
  supplies: AaveV3ReserveAmount[];
  borrows: AaveV3ReserveAmount[];
} {
  const supplies: (AaveV3ReserveAmount & { _rank: number })[] = [];
  const borrows: (AaveV3ReserveAmount & { _rank: number })[] = [];
  for (const r of reserves) {
    if (rawBigInt(r.supplyBalanceRaw) > BigInt(0))
      supplies.push({
        symbol: r.symbol,
        address: r.address,
        decimals: r.decimals,
        amount: scaleRaw(r.supplyBalanceRaw, r.decimals),
        amountRaw: r.supplyBalanceRaw,
        ...(r.decimalsUnread ? { decimalsUnread: true as const } : {}),
        _rank: scaleRaw(r.supplyBalanceRaw, r.decimals),
      });
    if (rawBigInt(r.debtBalanceRaw) > BigInt(0))
      borrows.push({
        symbol: r.symbol,
        address: r.address,
        decimals: r.decimals,
        amount: scaleRaw(r.debtBalanceRaw, r.decimals),
        amountRaw: r.debtBalanceRaw,
        ...(r.decimalsUnread ? { decimalsUnread: true as const } : {}),
        _rank: scaleRaw(r.debtBalanceRaw, r.decimals),
      });
  }
  supplies.sort((a, b) => b._rank - a._rank);
  borrows.sort((a, b) => b._rank - a._rank);
  const strip = ({ _rank, ...r }: AaveV3ReserveAmount & { _rank: number }): AaveV3ReserveAmount => {
    void _rank;
    return r;
  };
  return { supplies: supplies.map(strip), borrows: borrows.map(strip) };
}

/** Build a card view from a listing row — split the per-reserve balances (open +
 *  peak) into the supplied + borrowed sides. The view carries no health factor:
 *  the Ethereum position page merges its own live read over this (`chain`);
 *  the Base position pages build their view from the live read directly. */
export function viewFromSummary(row: AaveV3PositionRow): AaveV3PositionView {
  const { supplies, borrows } = splitSides(row.reserves);
  const { supplies: peakSupplies, borrows: peakBorrows } = splitSides(row.peakReserves ?? []);

  // Prefer the route's authoritative lifecycle status (mv_aave_v3_wallets); fall
  // back to deriving it from openness for older route responses.
  const hasOpen = supplies.length > 0 || borrows.length > 0;
  const status =
    row.status === "open" || row.status === "closed" || row.status === "liquidated" || row.status === "unread"
      ? row.status
      : statusOf(hasOpen, row.liquidationCount);
  return {
    wallet: row.wallet,
    market: row.market ?? "core",
    status,
    supplies,
    borrows,
    peakSupplies,
    peakBorrows,
    liquidationCount: row.liquidationCount,
    txCount: row.txCount,
    lastActivityAt: row.lastActivityAt,
    priceByAddress: row.priceByAddress,
    // A Base lender's row names the block its chain figures were read at.
    atBlock: row.chainBlock ?? undefined,
    // A listing view never carries a health factor (0018): the row's snapshot
    // HF is not read, and the position page's live read is the only one
    // the card shows.
    healthFactor: null,
    chainHfStale: true,
  };
}
