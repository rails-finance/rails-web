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
// the room to borrow and the liquidation read; the eMode category sits on the
// identity line beside the market badge. A LISTING
// card carries no health factor (rails-ops decision 0018): a listing exists to
// find a position, and risk is read live on the position page — whose Pool
// getUserAccountData read is the only HF this card ever shows.

import { positionName } from "@/lib/shared/position-name";
import { POSITION_NOUN } from "@/lib/shared/protocols";
import { ListingTag } from "@/components/shared/listing-tag";
import { SkeletonBar } from "@/components/shared/skeleton-card";
import { useState, type ReactNode } from "react";
import { Link2 } from "lucide-react";
import {
  PositionCard,
  type PositionCardExports,
  type PositionCardHead,
  type PositionCardSlots,
  type PositionCardStatus,
  type PositionPanelRow,
  assetsHead,
} from "@/components/shared/position-card";
import { Icon } from "@/components/icons/icon";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { RevealTip } from "@/components/shared/reveal-tip";
import { AssetAmount } from "@/components/shared/asset-amount";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { mainAssetFigure, useClosedPeaks, withPeaks, type ClosedPeakFlows } from "@/components/shared/closed-peak";
import { pickMainAsset, splitSupplied } from "@/lib/shared/main-asset";
import { HeadingTip } from "@/components/shared/tip-label";
import { AssetBreakdownPanel, type AssetBreakdown } from "@/components/shared/asset-donut";
import { TokenFigure } from "@/components/shared/token-figure";
import { TokenAmountNotLoaded, loadedMarks } from "@/components/shared/not-loaded";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { WalletPill } from "@/components/shared/wallet-pill";
import { ExactSpan } from "@/components/shared/amount-text";
import { DustToggle, splitDust, useDustOpen } from "@/components/shared/dust-reserves";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { formatDate } from "@/lib/date";
import { formatUnitsExact } from "@/lib/utils/format";
import { formatUsd } from "@/lib/shared/format-event";
import { formatUsdValue } from "@/lib/utils/format";
import { fmtLiqPrice } from "@/lib/aave-v4/format";
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
import {
  aaveV3LiquidationRead,
  aaveV3SameAssetOfView,
  aaveV3SingleCollateral,
  type AaveV3CardCaptions,
} from "@/lib/aave-v3/chain-truth-tower";
import {
  AaveV3CardDeploymentProvider,
  useAaveV3CardDeployment,
  type AaveV3CardDeployment,
} from "@/lib/aave-v3/card-deployment";
import { aaveV3PositionModal, type AaveV3Deployment } from "@/lib/aave-v3/event-templates";
import type { AaveV3PositionRow, AaveV3ReserveSummary } from "@/lib/api/fetch-aave-v3-positions";
import type { AaveV3PositionChainResponse, PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";
import { formatCompact, formatCompactUsd } from "@/lib/shared/format-compact";
import { shownUsd } from "@/lib/shared/holder-usd-receipt";
import { aaveV3PriceOf, aaveV3UsdOf, type AaveV3UsdRows } from "@/lib/aave-v3/usd-receipt";
import type { AaveV3Face } from "@/lib/aave-v3/price-notes";
import { positionLink } from "@/lib/shared/position-link";

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

/** The listing row's mark where its account has an event after the refresh. */
const AAVE_V3_CHANGED_SINCE_REFRESH = "changed since the refresh";

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
  /** Set where the server withheld the account's peaks (more than its
   *  transaction cap, out of budget, a failed read, a plumbing wallet): the
   *  closed face reads "not recorded". */
  peakWithheld?: boolean;
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
  /** The block `priceByAddress` was read at, where the read named one: the
   *  card's block on a position page, the latest when a listing was served. */
  priceBlock?: number | null;
  /** The block each price merged in later was read at (null: the read named
   *  none), by lowercased address; `priceBlock` for the rest (ui-jobs 743). */
  priceBlockByAddress?: Record<string, number | null>;
  atBlock?: number;
  /** The listing row's newest event: the block the index's balances stand at
   *  (mv_aave_v3_positions, refreshed about hourly). */
  indexBlock?: number;
  /** A listing row whose account has an event after `indexBlock`: the newest
   *  event's block (ui-jobs 806 follow-up). */
  changedAfterIndex?: number;
  /** The position page holds the balances back: the event tail has an event
   *  after `indexBlock` and the Pool read has not answered yet (ui-jobs 806). */
  figuresHeld?: boolean;
  /** The Pool read failed while the event tail is ahead of the index: the
   *  balances shown are the index's, and the card names both blocks. */
  indexTrails?: { indexBlock: number; tailBlock: number };
  /** rails-server's head read and the block it read at, where it answered the page's read. */
  readBy?: PositionHeadStamp & { block: number };
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

/** On-chain oracle USD for one reserve, the amount × the price as its receipt
 *  shows them (lib/aave-v3/usd-receipt.ts); null when this market didn't
 *  price it. */
function reserveUsd(v: AaveV3PositionView, address: string, amount: number): number | null {
  const p = aaveV3PriceOf(v.priceByAddress, address);
  return p != null ? shownUsd(amount, p) : null;
}

/** The rows a side's dollar receipt is built from. */
const usdRows = (v: AaveV3PositionView, reserves: AaveV3ReserveAmount[], face: AaveV3Face): AaveV3UsdRows => ({
  reserves,
  prices: v.priceByAddress,
  priceBlock: v.priceBlock,
  balanceBlock: v.atBlock,
  face,
});

/** Total USD across a set of reserves, the sum of the products its receipt
 *  shows, with the STRICT guard from Aave's on-chain USD: null the moment any
 *  contributing reserve is unpriced, so a partial total is never asserted (the
 *  side then shows its token amounts). */
function totalUsd(v: AaveV3PositionView, reserves: AaveV3ReserveAmount[]): number | null {
  return aaveV3UsdOf(usdRows(v, reserves, "cents"));
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

/** The headlines' read-mores on a detail card. */
const SIDE_TIP = {
  supply:
    "What the position supplies to the Pool, in dollars at the Pool's oracle prices, earning each asset's supply rate. The assets enabled as collateral back its borrowing.",
  debt: "What the position owes the Pool, in dollars at the Pool's oracle prices, including the interest accrued at each asset's variable borrow rate.",
} as const;
const HF_TIP =
  "The collateral, each asset counted up to its liquidation threshold, divided by the debt. Below 1 the position can be liquidated.";
/** The Collateral headline's read-more where the supplies are split. */
const COLLATERAL_TIP =
  "What the position supplies that backs its borrowing, in dollars at the Pool's oracle prices, earning each asset's supply rate.";
const NOT_COLLATERAL_TIP =
  "Supplied and earning the supply rate, but backing no borrowing: its collateral switch is off, or the Pool gives it a liquidation threshold of 0.";
const PEAK_NOT_COLLATERAL_TIP =
  "Supplied and earning the supply rate, but never backing borrowing: the wallet never turned its collateral switch on.";

/** A side's oracle-USD total as a compact headline figure, its cents on
 *  hover. */
function UsdFigure({ usd, info }: { usd: number; info: Provenance }) {
  return (
    <RevealTip tip={formatUsdValue(usd)}>
      <Prov info={info}>{formatCompactUsd(usd)}</Prov>
    </RevealTip>
  );
}

/** A headline's reserves as token amounts, one per line, each traced: an
 *  unpriced side's figure, and in a closed account's dropdown its highest
 *  recorded balances (no USD there: the peaks are maxima at different moments,
 *  so pricing them at one block would assert a portfolio that never existed;
 *  the head's peak value is one day's sum, components/shared/closed-peak.tsx). */
function ReserveAmounts({
  reserves,
  receipt,
  iconSize,
}: {
  reserves: AaveV3ReserveAmount[];
  receipt: (r: AaveV3ReserveAmount) => Provenance;
  /** The icon's size: a headline's default, 16 in an overlay. */
  iconSize?: number;
}) {
  return (
    <span className="flex flex-col gap-1">
      {reserves.map((r) => (
        <Prov key={r.address} info={receipt(r)}>
          {r.decimalsUnread ? (
            <TokenAmountNotLoaded address={r.address} label={r.symbol} />
          ) : (
            <AssetAmount
              value={r.amount}
              symbol={r.symbol}
              address={r.address}
              exact={formatUnitsExact(r.amountRaw, r.decimals)}
              iconSize={iconSize}
            />
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
        void navigator.clipboard.writeText(positionLink(pagePath)).then(() => {
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
  if (session === "aave-v3-arbitrum") return `/arbitrum/aave-v3/${v.wallet}`;
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
  /** Detail-page figures (accrued interest, borrow rate) — computed from the
   *  event stream + live Pool read (computeAaveV3CardCaptions). */
  captions?: AaveV3CardCaptions;
  /** The page's live Pool read: the room to borrow and the eMode category. */
  chain?: AaveV3PositionChainResponse | null;
  /** The page is still waiting on its live Pool read: the health factor holds
   *  its place with a still bar until the read lands. */
  hfPending?: boolean;
  /** Which deployment the row describes — its session, market label and the
   *  receipts behind every figure. Ethereum's indexed lane by default; a Base
   *  lender passes its own (lib/aave-v3/card-deployment.tsx). */
  deployment?: AaveV3CardDeployment;
  /** Whether this lane records "highest recorded" balances at all. The
   *  Arbitrum listing carries none, so its closed cards say so instead of
   *  showing a dash as if nothing was ever held. */
  peaks?: boolean;
  /** The page is still reading the oracle prices: the USD headlines hold a bar in
   *  place, so nothing moves when the dollars land. */
  pricesPending?: boolean;
  /** The ⋮'s export shapes (`aaveV3Exports`); `null` leaves the ⋮ with the
   *  link to the position and the provenance row. */
  exports?: PositionCardExports | null;
  /** Lowercased reserves the account supplies (or, closed, supplied) that back
   *  no borrowing (lib/aave-v3/collateral-split.ts): the card states them apart
   *  from the collateral. Unset until read; every supply then heads Collateral. */
  notCollateral?: ReadonlySet<string> | null;
  /** The page's Lifetime flows timeline and its read: a closed card's peak
   *  value per side (components/shared/closed-peak.tsx). */
  flows?: ClosedPeakFlows;
}

/** The Aave V3 family's slots for the shared position card. */
export function useAaveV3CardSlots({
  v,
  receipts = false,
  explanation,
  captions,
  chain,
  hfPending = false,
  peaks = true,
  pricesPending = false,
  exports,
  notCollateral,
  flows,
}: Omit<AaveV3PositionCardProps, "deployment">): PositionCardSlots {
  const dep = useAaveV3CardDeployment();
  const lane = useV3Pool();
  const dust = useDustOpen();
  const detail = receipts;
  // A closed side's assets as the heads list them: the collateral without
  // the supplies that back no borrowing, where the switches are read.
  const peakOf = useClosedPeaks(flows, v.status !== "open", {
    // The supply side's peak counts every supplied reserve, as the face does.
    collateral: v.peakSupplies.map((r) => ({ symbol: r.symbol, key: r.address })),
    debt: v.peakBorrows.map((r) => ({ symbol: r.symbol, key: r.address })),
  });

  const marketLabel = dep.marketLabel(v.market);
  // What the market label is, on hover (270 item 6: it carries information).
  const marketTitle = marketLabel
    ? `${marketLabel} is one of the Aave V3 markets on Ethereum. Each market is a separate account with a separate health factor.`
    : undefined;
  // The market in the tag on both surfaces (ui-jobs 807); the position page
  // keeps its tip.
  const tag = !marketLabel ? undefined : (
    <ListingTag
      market={
        detail ? (
          <span
            className="header-badge-tip focus-ring rounded-sm"
            title={marketTitle}
            data-tooltip={marketTitle}
            tabIndex={0}
          >
            {marketLabel}
          </span>
        ) : (
          marketLabel
        )
      }
    />
  );
  // The listing names the wallet on the left (its controls are buttons, which
  // can sit inside the row's <Link>); the position page names the wallet in
  // its top row (ui-jobs 228).
  const identity = detail ? undefined : (
    <WalletPill wallet={v.wallet} ensName={null} filterProtocol={dep.session} bookmark />
  );
  // The position's name (ui-jobs 703): the market and the account's wallet.
  const name = positionName({ market: marketLabel, noun: POSITION_NOUN[dep.session], id: v.wallet });

  const counters = {
    lastActivityAt: v.lastActivityAt,
    eventCount: v.txCount,
    eventTotal: v.eventTotal,
    liquidationCount: v.liquidationCount,
    countNote: v.countNote,
    countRule: v.countRule,
    liquidationRule: v.liquidationRule,
    ...(detail ? { order: "age-last" as const } : {}),
    // A listing row whose account moved after the hourly refresh says so; the
    // position page reads the account at head.
    ...(!detail && v.changedAfterIndex != null
      ? {
          extra: (
            <span className="text-xs text-rb-500" data-row-changed-after={v.changedAfterIndex}>
              {AAVE_V3_CHANGED_SINCE_REFRESH}
            </span>
          ),
        }
      : {}),
  };

  // The "?" every state panel owns — the same content function serves Aave V3
  // on Ethereum, Aave V3 on Base, and Seamless; only the deployment named by
  // the card's session changes the prose.
  const positionDeployment: AaveV3Deployment =
    dep.session === "aave-v3-base" || dep.session === "aave-v3-arbitrum" || dep.session === "seamless"
      ? dep.session
      : "aave-v3";
  const learnMore = aaveV3PositionModal(v.status, positionDeployment, v.borrows.length > 0);
  const menuSlot = {
    leading: () => <AaveV3MenuRows pagePath={pagePathOf(dep.session, v)} />,
    exports: exports ?? null,
  };
  const explainer = { body: explanation ?? null };
  const isOther = (r: AaveV3ReserveAmount) => notCollateral?.has(r.address.toLowerCase()) === true;

  // The Pool read failed while the event tail is ahead of the index row.
  const trailNotice =
    detail && v.indexTrails ? (
      <div className="mb-2 text-xs text-rb-500" data-index-trails={v.indexTrails.indexBlock}>
        Balances from the index at block {v.indexTrails.indexBlock.toLocaleString("en-US")}. The account has a later
        event at block {v.indexTrails.tailBlock.toLocaleString("en-US")}; the Pool read did not answer.
      </div>
    ) : undefined;

  // Closed / liquidated: the account holds no open reserves, so the headline is
  // what each asset held at its height — highest recorded per-reserve supply +
  // debt (chain-state MAX over the account's life, per asset; no USD).
  if (v.status === "closed" || v.status === "liquidated") {
    // No peaks on the lane (Arbitrum's listing), withheld by the server, or
    // none on either side: every head reads "not recorded". A side never held
    // beside one with peaks keeps its dash.
    const unrecorded = !peaks || !!v.peakWithheld || (v.peakSupplies.length === 0 && v.peakBorrows.length === 0);
    const notRecorded = unrecorded ? notRecordedNote("position") : undefined;
    // Each side leads with its main asset at its highest recorded balance,
    // picked from the listing's prices (`pickMainAsset`): the same face on
    // the listing row and the position page where the listing carries the
    // account's peaks (Ethereum and Base). Arbitrum's listing carries none,
    // so its rows read "not recorded" while the page shows the face.
    // The other assets sit on the small line, and every peak opens behind the
    // press under the peak label (C19).
    const peakHead = (
      id: string,
      label: string,
      peakLabel: string,
      reserves: AaveV3ReserveAmount[],
      receipt: (symbol: string) => Provenance,
      /** The dropdown's body, given each line's receipt. */
      panel: (receiptOf: (r: AaveV3ReserveAmount) => Provenance) => ReactNode,
    ): PositionCardHead => {
      const pick = pickMainAsset(
        reserves.map((r) => ({ ...r, key: r.address })),
        v.priceByAddress,
      );
      const figure = pick
        ? mainAssetFigure({
            main: { ...pick.main, exact: formatUnitsExact(pick.main.amountRaw, pick.main.decimals) },
            receipt: receipt(pick.main.symbol),
            block: v.priceBlock,
            skipped: pick.skipped,
            side: id === "peak-debt" ? "debt" : "supply",
          })
        : undefined;
      // The main asset's line carries the ranking row its figure carries.
      const receiptOf = (r: AaveV3ReserveAmount) =>
        figure && pick && r.address === pick.main.address ? figure.info : receipt(r.symbol);
      return {
        id,
        label,
        value: null,
        sub: notRecorded,
        ...(!unrecorded && reserves.length > 0
          ? assetsHead(
              peakLabel,
              reserves.map((r) => ({ symbol: r.symbol, address: r.address })),
              panel(receiptOf),
              figure,
            )
          : {}),
      };
    };
    const liquidated = v.status === "liquidated";
    const status: PositionCardStatus = liquidated
      ? { word: "Liquidated", tone: "danger" }
      : { word: "Closed", tone: "muted" };
    // The face holds every supplied peak under "Peak supplied", as the listing row
    // does, so it never moves when the collateral switches land; read, they
    // order the supply dropdown: the collateral peaks first, then the
    // supplies that backed no borrowing under "Supplied, not collateral".
    const lines = (reserves: AaveV3ReserveAmount[], receiptOf: (r: AaveV3ReserveAmount) => Provenance) => (
      <ReserveAmounts reserves={reserves} receipt={receiptOf} iconSize={16} />
    );
    const { first, others } = splitSupplied(v.peakSupplies, notCollateral != null ? isOther : undefined);
    const supplyHead = peakHead(
      "peak-supplied",
      CARD_VOCAB.headSupplied,
      CARD_VOCAB.peakSupplied,
      v.peakSupplies,
      dep.peakSupply,
      (receiptOf) => (
        <span className="flex flex-col gap-3 text-sm font-semibold tabular-nums text-foreground">
          {first.length > 0 && lines(first, receiptOf)}
          {others.length > 0 && (
            <span className="flex flex-col gap-1" data-aave-peak-not-collateral="">
              <span className="text-xs font-medium text-rb-500">
                <HeadingTip text="Supplied, not collateral" tip={PEAK_NOT_COLLATERAL_TIP} />
              </span>
              {lines(others, receiptOf)}
            </span>
          )}
        </span>
      ),
    );
    const debtHead = peakHead(
      "peak-debt",
      CARD_VOCAB.headDebt,
      CARD_VOCAB.peakDebt,
      v.peakBorrows,
      dep.peakDebt,
      (receiptOf) => (
        <span className="text-sm font-semibold tabular-nums text-foreground">{lines(v.peakBorrows, receiptOf)}</span>
      ),
    );
    const common = {
      name,
      status,
      heads: withPeaks([supplyHead, debtHead], peakOf, detail),
      identity,
      tag,
      counters,
      outcome: {
        word: liquidated ? "Liquidated" : "Closed",
        dates: v.lastActivityAt ? [{ at: v.lastActivityAt }] : undefined,
      },
    };
    if (!detail) return { ...common, surface: "listing", menu: null };
    return {
      ...common,
      surface: "detail",
      explainer,
      learnMore,
      menu: menuSlot,
      notice: trailNotice,
      panel: undefined,
    };
  }

  // The supplies that back borrowing head Collateral; the rest are a stat.
  const collSupplies = v.supplies.filter((r) => !isOther(r));
  const otherSupplies = v.supplies.filter(isOther);
  const collUsd = totalUsd(v, collSupplies);
  const otherUsd = totalUsd(v, otherSupplies);
  const debtUsd = totalUsd(v, v.borrows);
  // Prices still loading: the side's figure holds a bar where the dollars will be.
  const collPending = pricesPending && collUsd == null;
  const debtPending = pricesPending && debtUsd == null;
  // Value order for the cluster and the panel rows — the three visible icons
  // are the three largest by oracle USD. Dust reserves (under a cent) leave the
  // icon stack and its "+N"; the panel puts them behind the dust row.
  const usdOf = dustUsdOf(v);
  const suppliesRanked = rankByValue(v, collSupplies);
  const borrowsRanked = rankByValue(v, v.borrows);
  const othersRanked = rankByValue(v, otherSupplies);
  const suppliesSplit = splitDust(suppliesRanked, usdOf);
  const borrowsSplit = splitDust(borrowsRanked, usdOf);
  const othersSplit = splitDust(othersRanked, usdOf);

  const sideTip = (side: "supply" | "debt") =>
    side === "supply" && notCollateral != null ? COLLATERAL_TIP : SIDE_TIP[side];
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
    // The receipt that rebuilds the side's dollars from its rows.
    const usdInfo = dep.usd(usdWhat, side, usdRows(v, reserves, one ? "cents" : "compact"), v.market)?.prov;
    if (one)
      return {
        id,
        label,
        labelTip: detail ? sideTip(side) : undefined,
        value: (
          <Prov
            info={
              side === "supply"
                ? dep.supply(one.symbol, v.atBlock, v.readBy)
                : dep.debt(one.symbol, v.atBlock, v.readBy)
            }
          >
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
          usd != null && usdInfo ? (
            <Prov info={usdInfo}>
              <span className="font-bold text-green-400">{formatUsdValue(usd)}</span>
            </Prov>
          ) : pending ? (
            <SkeletonBar width={64} height={12} />
          ) : null,
      };
    return {
      id,
      label,
      labelTip: detail ? sideTip(side) : undefined,
      value:
        reserves.length === 0 ? null : usd != null && usdInfo ? (
          <UsdFigure usd={usd} info={usdInfo} />
        ) : (
          // A partial USD total is never asserted: an unpriced side shows its
          // token amounts.
          <ReserveAmounts
            reserves={reserves}
            receipt={(r) =>
              side === "supply" ? dep.supply(r.symbol, v.atBlock, v.readBy) : dep.debt(r.symbol, v.atBlock, v.readBy)
            }
          />
        ),
      pending: v.figuresHeld === true || (reserves.length > 0 && pending),
      total: usd != null && usdInfo ? { usd, info: usdInfo } : undefined,
      assets: reserves.length > 0 && usd != null ? <InlineAssetCluster assets={loadedMarks(shown)} /> : undefined,
    };
  };

  // The health factor: the position page's live read. Omitted on every
  // listing view and on a deployment with no live HF receipt — an unasserted
  // layer, per the chain-state charter; pending on a page still reading. A
  // read wallet with no debt draws a dash, as Debt does (HF is undefined, ∞ in
  // protocol terms) — but only when the card shows no debt either. The balances are
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
          value: !hfRead ? null : noDebtRead ? null : v.healthFactor == null ? null : (
            <Prov info={hfProv(v.market, v.atBlock, v.readBy)}>{hfLabel(v.healthFactor)}</Prov>
          ),
        }
      : null;

  // An account none of whose supplies back borrowing heads them "Supplied",
  // with the not-collateral tip, and draws no stat row for them (ui-jobs 806).
  const othersHead = collSupplies.length === 0 && otherSupplies.length > 0;
  const heads = [
    othersHead
      ? {
          ...sideHead(
            "collateral",
            "Supplied",
            otherSupplies,
            othersSplit.shown,
            otherUsd,
            pricesPending && otherUsd == null,
            "Supplied",
            "supply",
          ),
          labelTip: detail ? NOT_COLLATERAL_TIP : undefined,
        }
      : sideHead(
          "collateral",
          CARD_VOCAB.collateral,
          collSupplies,
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
  ) : (
    trailNotice
  );

  const common = { status, heads, identity, tag, counters, notice, name };
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
            <Prov
              info={
                side === "supply" ? dep.supply(r.symbol, v.atBlock, v.readBy) : dep.debt(r.symbol, v.atBlock, v.readBy)
              }
            >
              <ExactSpan exact={formatUnitsExact(r.amountRaw, r.decimals)} symbol={r.symbol}>
                {formatCompact(r.amount)}
              </ExactSpan>
            </Prov>
          ),
          usdText: (() => {
            const info =
              usd != null
                ? dep.usd(
                    `${side === "supply" ? "Supplied" : "Borrowed"} ${r.symbol}`,
                    side,
                    usdRows(v, [r], "dollars"),
                    v.market,
                  )?.prov
                : undefined;
            return usd != null && info ? <Prov info={info}>{formatUsd(usd)}</Prov> : undefined;
          })(),
        };
      }),
      dust:
        split.dust.length > 0 ? (
          <DustToggle count={split.dust.length} open={dust.open} onToggle={dust.toggle} />
        ) : undefined,
    };
  };

  const interestRow = (side: "supply" | "debt"): PositionPanelRow | null => {
    const since = side === "supply" ? captions?.supplyInterestSince : captions?.debtInterestSince;
    const legs = side === "supply" ? captions?.supplyInterestLegs : captions?.debtInterestLegs;
    // The figure is the sum of the products its receipt shows.
    const receipt =
      legs && dep.interestCaption
        ? dep.interestCaption(
            side,
            {
              reserves: legs,
              prices: v.priceByAddress,
              priceBlock: v.priceBlock,
              balanceBlock: v.atBlock,
              face: "compact",
            },
            v.market,
          )
        : null;
    const usd = receipt?.usd;
    if (!receipt || usd == null || usd < 0.01) return null;
    return {
      id: `${side}-interest`,
      label: side === "supply" ? "Interest earned" : "Interest charged",
      tip:
        side === "supply"
          ? "The interest inside the supplied balance, in dollars: what the balance holds beyond its deposits and withdrawals since it last started from zero."
          : "The interest inside the debt, in dollars: what the debt holds beyond its draws and repayments since it last started from zero.",
      sub: since != null ? `since ${formatDate(since)}` : undefined,
      value: <Prov info={receipt.prov}>{formatCompactUsd(usd)}</Prov>,
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
          tip: "How much more the position can borrow, in dollars, before it reaches its Max LTV, as the Pool gives it at the latest block.",
          value: (
            <Prov info={accountDataProv("Available to borrow", "availableBorrowsBase", chainPool, v.readBy)}>
              {formatCompactUsd(chain.availableBorrowsUsd)}
            </Prov>
          ),
        }
      : null;

  // The liquidation read, a pure function of the traced health factor and the
  // oracle prices: one supplied reserve carrying ≥99.5% of the priced
  // collateral (aaveV3SingleCollateral) anchors a liquidation price; otherwise
  // the drop the whole collateral can take.
  const liq = hfRead && !noDebtRead ? aaveV3LiquidationRead(v) : null;
  const liqRow: PositionPanelRow | null = !liq
    ? null
    : liq.sameAsset
      ? {
          id: "liquidation",
          label: "Liquidation",
          tip: "One token is supplied and borrowed, so its price stands on both sides of the health factor and cancels; only the interest gap can bring the position to liquidation.",
          value: (
            <span className="inline-flex items-center gap-1">
              <TokenChipIcon symbol={liq.sameAsset.symbol} size={14} filterable={false} />
              on both sides: only interest moves it
            </span>
          ),
        }
      : liq.single
        ? {
            id: "liquidates-at",
            label: "Liquidates at",
            tip: `The ${liq.single.symbol} price at which the health factor reaches 1 and the position can be liquidated: the price the Pool's oracle reports, divided by the health factor.`,
            value: (
              <span className="inline-flex items-center gap-1">
                <TokenChipIcon symbol={liq.single.symbol} size={14} filterable={false} />
                <Prov
                  info={
                    dep.liqPrice(
                      {
                        symbol: liq.single.symbol,
                        price: liq.single.price,
                        priceBlock: v.priceBlock,
                        hf: v.healthFactor as number,
                        hfBlock: v.readBy?.block ?? v.atBlock,
                      },
                      v.market,
                    ).prov
                  }
                >
                  {fmtLiqPrice(liq.single.liqPrice)}
                </Prov>
              </span>
            ),
          }
        : liq.dropPct != null
          ? {
              id: "liquidation-drop",
              label: "Liquidates on a drop of",
              tip: "How far the dollar value of all the collateral can fall, the debt standing still, before the health factor reaches 1 and the position can be liquidated: 1 − 1 ÷ health factor.",
              value: <Prov info={dep.liqDrop(v.market)}>{liq.dropPct.toFixed(0)}%</Prov>,
            }
          : null;

  // The E-Mode category the account has chosen, on the identity line beside
  // the market badge (as the Aave V3 Optimism card draws it).
  const emode = chain?.emode ?? null;
  const emodeIdentity =
    emode && chainPool ? (
      <span className="flex items-center gap-2">
        <span className="text-xs font-semibold text-rb-500" data-emode={emode.id}>
          E-Mode: <Prov info={userEmodeProv(emode.label, chainPool)}>{emode.label}</Prov>
        </span>
      </span>
    ) : (
      identity
    );

  // The supplies that back no borrowing: many and priced, their total and
  // icons open the breakdown (C19); otherwise each line under the total.
  const otherInfo =
    otherUsd != null
      ? dep.usd("Supplied, not collateral", "supply", usdRows(v, otherSupplies, "compact"), v.market)?.prov
      : undefined;
  const notCollRow: PositionPanelRow | null =
    otherSupplies.length === 0 || othersHead
      ? null
      : otherSupplies.length > 1 && otherUsd != null && otherInfo
        ? {
            id: "not-collateral",
            label: "Supplied, not collateral",
            tip: NOT_COLLATERAL_TIP,
            value: <Prov info={otherInfo}>{formatCompactUsd(otherUsd)}</Prov>,
            breakdown: {
              assets: loadedMarks(othersSplit.shown),
              total: { usd: otherUsd, info: otherInfo },
              panel: (
                <AssetBreakdownPanel
                  id="aave-v3-not-collateral-breakdown"
                  name="Supplied, not collateral"
                  side="collateral"
                  breakdown={reserveBreakdown("supply", othersSplit)}
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
                {othersRanked.map((r) => (
                  <span key={r.address}>
                    {r.decimalsUnread ? (
                      <TokenAmountNotLoaded address={r.address} label={r.symbol} />
                    ) : (
                      <TokenFigure
                        symbol={r.symbol}
                        address={r.address}
                        figure={`${formatUnitsExact(r.amountRaw, r.decimals)} ${r.symbol}`}
                      >
                        <Prov info={dep.supply(r.symbol, v.atBlock, v.readBy)}>
                          <ExactSpan exact={formatUnitsExact(r.amountRaw, r.decimals)} symbol={r.symbol}>
                            {formatCompact(r.amount)}
                          </ExactSpan>
                        </Prov>
                      </TokenFigure>
                    )}
                  </span>
                ))}
                {/* The dollars under the amounts, in the headline's green. */}
                {otherUsd != null && otherInfo && (
                  <Prov info={otherInfo}>
                    <span className="text-xs font-bold tabular-nums text-green-400">{formatUsdValue(otherUsd)}</span>
                  </Prov>
                )}
              </span>
            ),
          };

  const present = (rows: (PositionPanelRow | null)[]): PositionPanelRow[] =>
    rows.filter((r): r is PositionPanelRow => r != null);

  // While the live Pool read is out, a borrowing position's rows from it hold
  // their cells with placeholder bars (the loading grammar, skeleton-card.tsx),
  // so the panel takes its settled height from first paint. The bars carry no
  // figure. The oracle prices land after the Pool read: the average rate of
  // several borrows weighs by them, and they decide between a liquidation
  // price and a drop, so those rows stay held until the prices are in too.
  // The held liquidation label follows the read's rule: the ≥99.5% share
  // (aaveV3SingleCollateral) once every supplied reserve is priced, and before
  // that the one supplied reserve that passes it whatever its price. Once the
  // reads settle, a liquidation row the read leaves empty keeps its cell with
  // words in it, so the row does not vanish: "liquidatable now" at a health
  // factor of 1 or under, "no liquidation price" at 100 or over, "health
  // factor unavailable" when the Pool read is missing. A Pool read of no debt
  // drops the row, and the notice above the card says why.
  const readPending = detail && hfPending && v.borrows.length > 0;
  const pricePending = detail && pricesPending && v.borrows.length > 0;
  const sameAsset = aaveV3SameAssetOfView(v) != null;
  const anchor = aaveV3SingleCollateral(v);
  const anchored = anchor === undefined ? v.supplies.filter((r) => r.amount > 0).length === 1 : anchor != null;
  const liqHoldsCell = detail && v.borrows.length > 0 && !noDebtRead;
  const hfNow = hfRead ? v.healthFactor : null;
  const liqSettled = (id: string, label: string): PositionPanelRow =>
    hfNow != null && hfNow <= 1
      ? { id, label, value: "liquidatable now" }
      : {
          id,
          label,
          value: null,
          unavailable: !hfRead
            ? "health factor unavailable"
            : hfNow != null && hfNow >= 100
              ? "no liquidation price"
              : true,
        };
  const heldOf: [id: string, label: string, hold: boolean][] = [
    [
      "borrow-rate",
      v.borrows.length > 1 ? "Average borrow rate" : "Borrow rate",
      rateRow == null && (readPending || (pricePending && v.borrows.length > 1)),
    ],
    ["borrow-room", "Room to borrow", roomRow == null && readPending],
    sameAsset
      ? ["liquidation", "Liquidation", readPending]
      : anchored
        ? ["liquidates-at", "Liquidates at", readPending || pricePending]
        : ["liquidation-drop", "Liquidates on a drop of", readPending || pricePending],
  ];
  const [rateHeld, roomHeld, liqHeld] = [rateRow, roomRow, liqRow].map((row, i): PositionPanelRow | null => {
    const [id, label, hold] = heldOf[i];
    if (hold) return { id, label, value: null, pending: true };
    if (row == null && i === 2 && liqHoldsCell) return liqSettled(id, label);
    return row;
  });

  // Each side's reserves open under its headline (the chevron by the icons);
  // the panel keeps the additive values.
  const withRows = heads.map((h) =>
    h.id === "collateral" && collSupplies.length > 1
      ? { ...h, breakdown: reserveBreakdown("supply", suppliesSplit) }
      : h.id === "debt" && v.borrows.length > 1
        ? { ...h, breakdown: reserveBreakdown("debt", borrowsSplit) }
        : h,
  );
  return {
    ...common,
    identity: emodeIdentity,
    heads: withRows,
    surface: "detail",
    explainer,
    learnMore,
    menu: menuSlot,
    panel: [present([notCollRow, interestRow("supply")]), present([rateHeld, interestRow("debt"), roomHeld, liqHeld])],
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
    peakWithheld: row.peakWithheld,
    liquidationCount: row.liquidationCount,
    txCount: row.txCount,
    lastActivityAt: row.lastActivityAt,
    priceByAddress: row.priceByAddress,
    priceBlock: row.priceBlock ?? null,
    // A Base lender's row names the block its chain figures were read at.
    atBlock: row.chainBlock ?? undefined,
    indexBlock: row.lastBlockNumber,
    ...(row.latestEventBlock != null && row.latestEventBlock > row.lastBlockNumber
      ? { changedAfterIndex: row.latestEventBlock }
      : {}),
    // A listing view never carries a health factor (0018): the row's snapshot
    // HF is not read, and the position page's live read is the only one
    // the card shows.
    healthFactor: null,
    chainHfStale: true,
  };
}

/** A listing row's collateral split, where the row read one. */
export function notCollateralOf(row: AaveV3PositionRow): ReadonlySet<string> | null {
  return row.notCollateral ? new Set(row.notCollateral) : null;
}
