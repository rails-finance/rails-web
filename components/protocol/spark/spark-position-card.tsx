"use client";

// SparkLend position card: a slot builder for the shared position card
// (components/shared/position-card.tsx, rails-ops TO-DO-position-card 322).
// `useSparkCardSlots` turns the account's view and the page's live Pool read
// into one `PositionCardSlots` object; `PositionCard` draws it on the position
// page and in the listing row.
//
// A SparkLend account is cross-collateralised: one wallet supplies and borrows
// many reserves. Each reserve's supplied / borrowed balance is the index's
// scaled-balance reduction (0008/0011): the current rebased figure, interest
// included, equal to the spToken / variableDebtToken `balanceOf` at the
// indexed head. The headlines are each side's oracle-USD total with its asset
// cluster, and the panel lists the reserves one row each. A listing card
// carries no health factor (rails-ops decision 0018): the position page's
// Pool.getUserAccountData read is the only health factor the card shows.

import { TitleTip } from "@/components/shared/reveal-tip";
import type { ReactNode } from "react";
import { useState } from "react";
import { Link2 } from "lucide-react";
import {
  PositionCard,
  type PositionCardExports,
  type PositionCardHead,
  type PositionCardOutcome,
  type PositionCardSlots,
  type PositionCardStatus,
  type PositionPanelColumns,
  type PositionPanelRow,
} from "@/components/shared/position-card";
import { formatDate, formatDateRange, formatDuration } from "@/lib/date";
import { useMountedNow } from "@/hooks/useMountedNow";
import { TipLabel } from "@/components/shared/tip-label";
import type { SparkLife } from "@/lib/spark/lives";
import { AssetAmount } from "@/components/shared/asset-amount";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import type { AssetBreakdown } from "@/components/shared/asset-donut";
import { TokenAmountNotLoaded, loadedSymbols } from "@/components/shared/not-loaded";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { WalletPill } from "@/components/shared/wallet-pill";
import { Icon } from "@/components/icons/icon";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { formatUnitsExact, formatUsdValue } from "@/lib/utils/format";
import { Prov } from "@/components/shared/provenance";
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
import { sparkPositionModal } from "@/lib/spark/event-templates";
import { formatUsd } from "@/lib/shared/format-event";
import { fmtLiqPrice, hfLabelV4 } from "@/lib/aave-v4/format";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import type { SparkPositionSummary, SparkReserveAmount } from "@/lib/sources/api/spark-positions";
import type { SparkPositionChainResponse } from "@/lib/api/fetch-spark-position";
import { ExactSpan } from "@/components/shared/amount-text";
import { splitDust, useDustLines } from "@/components/shared/dust-reserves";
import { formatCompact, formatCompactUsd } from "@/lib/shared/format-compact";
import { TokenFigure } from "@/components/shared/token-figure";
import { PanelFigure } from "@/components/shared/position-card-panel";

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
  /** The position's events, where the page knows them: the count's tip gives both. */
  eventTotal?: number | null;
  /** Unix seconds of the most recent event (activity-meta). */
  lastActivityAt: number;
  /** On-chain oracle USD (IAaveOracle, chain-derived) per reserve, keyed by
   *  lowercased token address. A reserve the oracle didn't price is absent
   *  (the side's total then omits). */
  priceByAddress?: Record<string, number>;
  atBlock?: number;
  /** The position page's live health factor (Pool.getUserAccountData, read on
   *  visit). Null = no debt when read; meaningless when `chainHfStale`. A
   *  listing view never carries one (0018). */
  healthFactor?: number | null;
  /** True when no live read stands behind `healthFactor`: every listing
   *  view, and the position page until its chain read lands. */
  chainHfStale?: boolean;
  /** The position page only, while `chainHfStale`: the live read is out
   *  ("reading") or failed ("unread"). */
  hfRead?: "reading" | "unread";
}

/** The count tip's reason for events outnumbering transactions. */
const LIQ_FEE_ROW_NOTE = "a liquidation's fee to the Spark treasury is a row of its own";

const COLLATERAL_TIP =
  "What the account supplies that backs its borrowing, valued at SparkLend's oracle prices (the price feed SparkLend liquidates with). A supply is held as spTokens, SparkLend's receipt token, whose balance grows as interest accrues.";

const DEBT_TIP =
  "What the account owes SparkLend, valued at SparkLend's oracle prices, including the interest accrued at each asset's borrow rate. A borrow is held as variable debt tokens, whose balance grows as interest accrues.";

const NOT_COLLATERAL_TIP =
  "Supplied and earning the supply rate, but backing no borrowing: its collateral switch is off, or SparkLend gives it a liquidation threshold of 0 (USDC, USDT, USDS and PYUSD).";

const PEAK_NOT_COLLATERAL_TIP =
  "Supplied and earning the supply rate, but never backing borrowing: the account never turned its collateral switch on (SparkLend gives USDC, USDT, USDS and PYUSD a liquidation threshold of 0).";

const HF_TIP =
  "The collateral, each asset counted up to its liquidation threshold, divided by the debt, at SparkLend's oracle prices. At or below 1, anyone can liquidate the account.";

/** "24 days · 7 Oct - 31 Oct 2025", one line per life. */
function LivesLines({ lives }: { lives: readonly SparkLife[] }) {
  // An open life's length is read from the browser's clock once it arrives
  // (hooks/useMountedNow); the server render leaves it a placeholder.
  const now = useMountedNow();
  return (
    <div className="flex flex-col gap-0.5 text-xs text-rb-500 mt-2" data-spark-card-lives={lives.length}>
      {(lives.length > 3 ? [lives[0], lives[lives.length - 1]] : lives).map((l, i) => {
        const end = l.to ?? now;
        const when =
          l.to == null
            ? `since ${formatDate(l.from)}`
            : formatDate(l.from) === formatDate(l.to)
              ? formatDate(l.from)
              : formatDateRange(l.from, l.to);
        return (
          <div key={l.from}>
            {i === 1 && lives.length > 3 && <div>{lives.length - 2} more between</div>}
            <span className="text-sm font-semibold text-foreground" data-prov-exempt="">
              {end == null ? <span className="invisible">000 days</span> : formatDuration(l.from, end)}
            </span>{" "}
            {when}
          </div>
        );
      })}
    </div>
  );
}

/** On-chain oracle USD for one reserve; null when SparkLend didn't price it. */
function reserveUsd(v: SparkPositionView, address: string, amount: number): number | null {
  const p = v.priceByAddress?.[address.toLowerCase()];
  return typeof p === "number" && p > 0 ? amount * p : null;
}

/** Total USD across a set of reserves, null the moment any contributing
 *  reserve is unpriced, so a partial total is never asserted. */
function totalUsd(v: SparkPositionView, reserves: SparkReserveAmount[]): number | null {
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

/** Reserves sorted by oracle-USD value, largest first, so the capped icon
 *  cluster and the panel rows lead with worth. Keeps the incoming order the
 *  moment any reserve is unpriced: a rank the oracle can't back is never
 *  asserted. */
function rankByValue(v: SparkPositionView, reserves: SparkReserveAmount[]): SparkReserveAmount[] {
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
  (v: SparkPositionView) =>
  (r: SparkReserveAmount): number | null =>
    r.decimalsUnread ? null : reserveUsd(v, r.address, r.amount);

/** One reserve's amount, traced to its balance read; `withIcon` puts the
 *  asset's icon after it (a panel row), where the breakdown's row draws its
 *  own. */
function ReserveAmountText({
  r,
  side,
  atBlock,
  withIcon = false,
}: {
  r: SparkReserveAmount;
  side: "supply" | "debt";
  atBlock?: number;
  withIcon?: boolean;
}) {
  if (r.decimalsUnread) return <TokenAmountNotLoaded address={r.address} label={r.symbol} />;
  const exact = formatUnitsExact(r.amountRaw, r.decimals);
  const amount = (
    <Prov info={side === "supply" ? positionSupplyProv(r.symbol, atBlock) : positionDebtProv(r.symbol, atBlock)}>
      <ExactSpan exact={exact} symbol={r.symbol}>
        {formatCompact(r.amount)}
      </ExactSpan>
    </Prov>
  );
  return withIcon ? (
    <TokenFigure symbol={r.symbol} address={r.address} figure={`${exact} ${r.symbol}`}>
      {amount}
    </TokenFigure>
  ) : (
    amount
  );
}

/** A side's reserves as the headline, where the side's USD total cannot be
 *  stated (a reserve unpriced or unread). The detail card keeps the dust
 *  control; the listing row shows the lines alone. */
function TokenStack({
  reserves,
  side,
  atBlock,
  usdOf,
  inert,
}: {
  reserves: SparkReserveAmount[];
  side: "supply" | "debt";
  atBlock?: number;
  usdOf: (r: SparkReserveAmount) => number | null;
  inert: boolean;
}) {
  const dust = useDustLines(reserves, usdOf);
  const lines = inert ? splitDust(reserves, usdOf).shown : dust.lines;
  return (
    <span className="flex flex-col gap-1">
      {lines.map((r) => (
        <span key={r.address}>
          {r.decimalsUnread ? (
            <TokenAmountNotLoaded address={r.address} label={r.symbol} />
          ) : (
            <Prov
              info={side === "supply" ? positionSupplyProv(r.symbol, atBlock) : positionDebtProv(r.symbol, atBlock)}
            >
              <AssetAmount value={r.amount} symbol={r.symbol} exact={formatUnitsExact(r.amountRaw, r.decimals)} />
            </Prov>
          )}
        </span>
      ))}
      {!inert && dust.control}
    </span>
  );
}

/** Per-reserve PEAK amounts (highest recorded), each traced to its receipt:
 *  the scaled-delta reducer's largest running claim, valued at the index of
 *  the moment it stood. No USD: the peaks are maxima at different moments, so
 *  pricing them at one block would assert a portfolio that never existed. */
function PeakLines({
  reserves,
  side,
  iconSize,
}: {
  reserves: SparkReserveAmount[];
  side: "supply" | "debt";
  /** The icon's size: a headline's default, 16 in a panel row. */
  iconSize?: number;
}) {
  return (
    <span className="flex flex-col gap-1">
      {reserves.map((r) => (
        <span key={r.address}>
          <Prov info={side === "supply" ? sparkPeakSupplyProv(r.symbol) : sparkPeakBorrowProv(r.symbol)}>
            {r.decimalsUnread ? (
              <TokenAmountNotLoaded address={r.address} label={r.symbol} />
            ) : (
              <AssetAmount
                value={r.amount}
                symbol={r.symbol}
                exact={formatUnitsExact(r.amountRaw, r.decimals)}
                iconSize={iconSize}
              />
            )}
          </Prov>
        </span>
      ))}
    </span>
  );
}

/** The ⋮'s identity row: a link to this account's page. */
function SparkMenuRows({ wallet }: { wallet: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <ToolsMenuItem
      icon={copied ? <Icon name="check" size={16} /> : <Link2 size={16} className="-rotate-45" />}
      title="Link to this position"
      subtitle={copied ? "Copied" : "Copy the page's address"}
      onClick={() => {
        void navigator.clipboard.writeText(`${window.location.origin}/ethereum/spark/${wallet}`).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    />
  );
}

/** Neutral HF headline (Rails doesn't color-code risk): "∞" above 100, where
 *  the figure stops meaning anything as a ratio, else the family's format
 *  (four decimals below 1.1, as the event tiles and the prose). */
function hfLabel(hf: number): string {
  return hf >= 100 ? "∞" : hfLabelV4(hf);
}

/** "$12.34 since 12 Sep 2026": the interest inside a side's balance, added
 *  since the balance last started from zero (computeSparkCardCaptions). Null
 *  below a cent. */
function interestRow(
  side: "supply" | "debt",
  usd: number | null | undefined,
  since: number | null | undefined,
): PositionPanelRow | null {
  if (usd == null || usd < 0.01) return null;
  return {
    id: side === "supply" ? "supply-interest" : "borrow-interest",
    label: side === "supply" ? "Supply interest" : "Borrow interest",
    sub: since != null ? `since ${formatDate(since)}` : undefined,
    value: <Prov info={sparkInterestCaptionProv(side)}>{formatCompactUsd(usd)}</Prov>,
    tip: `The ${side === "supply" ? "supply" : "borrow"} interest added since the balance last started from zero; lifetime interest is in the Lifetime flows panel.`,
  };
}

/** What a SparkLend page or listing hands the card. */
export interface SparkPositionCardProps {
  v: SparkPositionView;
  /** `detail` on the position page (receipts, panel, (i), ⋮); `listing` in a row. */
  surface: "detail" | "listing";
  /** Detail: the accrued interest per side and the borrow rate, from the
   *  event stream and the live Pool read (computeSparkCardCaptions). */
  captions?: SparkCardCaptions;
  /** Detail: the live Pool read, for the room left to borrow. */
  chain?: SparkPositionChainResponse | null;
  /** Lowercased reserves the account supplies (or, closed, supplied) that back
   *  no borrowing: the card lists them apart from the collateral. Unset until
   *  the page has read the switches. */
  notCollateral?: ReadonlySet<string> | null;
  /** The account's lives, where it emptied and started again; a closed card
   *  with two or more counts each. */
  lives?: readonly SparkLife[] | null;
  /** A liquidated card's Outcome date: its last liquidation, where the page
   *  holds it. The last activity otherwise. */
  outcomeAt?: number;
  /** The (i) pane's prose. */
  explanation?: ReactNode;
  /** The pane's copy-this-view link: the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** The ⋮'s export shapes; `null` leaves the link and the provenance row. */
  exports?: PositionCardExports | null;
}

/** SparkLend's slots for the shared position card. */
export function useSparkCardSlots({
  v,
  surface,
  captions,
  chain,
  notCollateral,
  lives,
  outcomeAt,
  explanation,
  viewHref,
  exports,
}: SparkPositionCardProps): PositionCardSlots {
  const detail = surface === "detail";
  const isOther = (r: SparkReserveAmount) => notCollateral?.has(r.address.toLowerCase()) === true;
  const collSupplies = v.supplies.filter((r) => !isOther(r));
  const otherSupplies = v.supplies.filter(isOther);
  const collUsd = totalUsd(v, collSupplies);
  const otherUsd = totalUsd(v, otherSupplies);
  const debtUsd = totalUsd(v, v.borrows);
  const usdOf = dustUsdOf(v);
  const suppliesRanked = rankByValue(v, collSupplies);
  const borrowsRanked = rankByValue(v, v.borrows);
  const othersRanked = rankByValue(v, otherSupplies);
  // The panel's reserve rows under the dust rule: dust sits behind the
  // "Show dust" control, drawn as a "Dust" row.
  const supplyLines = useDustLines(suppliesRanked, usdOf);
  const debtLines = useDustLines(borrowsRanked, usdOf);

  const counters = {
    lastActivityAt: v.lastActivityAt,
    eventCount: v.txCount,
    eventTotal: v.eventTotal,
    liquidationCount: v.liquidationCount,
    countNote: v.liquidationCount > 0 ? LIQ_FEE_ROW_NOTE : undefined,
    ...(detail ? { order: "age-last" as const } : {}),
  };
  // The protocol name is redundant inside the SparkLend explorer (one
  // market), so the listing row names the wallet; the position page names it
  // in the top row.
  const identity = detail ? undefined : (
    <WalletPill wallet={v.wallet} ensName={null} filterProtocol="spark" bookmarkProtocol="spark" />
  );
  const ended = v.status === "closed" || v.status === "liquidated";
  const status: PositionCardStatus | null =
    v.status === "liquidated"
      ? { word: "Liquidated", tone: "danger" }
      : v.status === "closed"
        ? { word: "Closed", tone: "muted" }
        : null;

  let heads: PositionCardHead[];
  let outcome: PositionCardOutcome | undefined;
  let notice: ReactNode;
  // A closed card's panel: the peaks of reserves that never backed borrowing.
  let closedPanel: PositionPanelColumns | undefined;
  if (ended) {
    // The wallet holds no open reserves, so the headline is what each asset
    // held at its height.
    const peakOthers = v.peakSupplies.filter(isOther);
    heads = [
      {
        id: "peak-collateral",
        label: CARD_VOCAB.peakCollateral,
        value: v.peakSupplies.some((r) => !isOther(r)) ? (
          <PeakLines reserves={v.peakSupplies.filter((r) => !isOther(r))} side="supply" />
        ) : null,
      },
      {
        id: "peak-debt",
        label: CARD_VOCAB.peakDebt,
        value: v.peakBorrows.length > 0 ? <PeakLines reserves={v.peakBorrows} side="debt" /> : null,
      },
    ];
    if (peakOthers.length > 0) {
      closedPanel = [
        [
          {
            id: "peak-not-collateral",
            label: "Supplied, not collateral",
            tip: PEAK_NOT_COLLATERAL_TIP,
            value: (
              <span data-spark-not-collateral="">
                <PeakLines reserves={peakOthers} side="supply" iconSize={16} />
              </span>
            ),
          },
        ],
        [],
      ];
    }
    outcome = {
      word: v.status === "liquidated" ? "Liquidated" : "Closed",
      dates: [{ at: v.status === "liquidated" && outcomeAt != null ? outcomeAt : v.lastActivityAt }],
      extra: lives && lives.length > 1 ? { label: "Time open", value: <LivesLines lives={lives} /> } : undefined,
    };
  } else {
    const side = (
      id: "collateral" | "debt",
      reserves: SparkReserveAmount[],
      ranked: SparkReserveAmount[],
      usd: number | null,
    ): PositionCardHead => {
      // One reserve: its amount with its icon, the dollars beneath (the
      // Liquity V2 headline).
      const one = reserves.length === 1 && !reserves[0].decimalsUnread ? reserves[0] : null;
      if (one)
        return {
          id,
          label: id === "collateral" ? CARD_VOCAB.collateral : CARD_VOCAB.debt,
          labelTip: detail ? (id === "collateral" ? COLLATERAL_TIP : DEBT_TIP) : undefined,
          value: (
            <Prov
              info={
                id === "collateral"
                  ? positionSupplyProv(one.symbol, v.atBlock)
                  : positionDebtProv(one.symbol, v.atBlock)
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
          usd:
            usd != null ? (
              <Prov info={sparkUsdProvOnchain(id === "collateral" ? "Collateral" : "Borrowed")}>
                <span className="font-bold text-green-400">{formatUsdValue(usd)}</span>
              </Prov>
            ) : null,
        };
      return {
        id,
        label: id === "collateral" ? CARD_VOCAB.collateral : CARD_VOCAB.debt,
        labelTip: detail ? (id === "collateral" ? COLLATERAL_TIP : DEBT_TIP) : undefined,
        assets:
          reserves.length > 0 ? (
            <InlineAssetCluster symbols={loadedSymbols(splitDust(ranked, usdOf).shown)} />
          ) : undefined,
        total:
          usd != null ? { usd, info: sparkUsdProvOnchain(id === "collateral" ? "Collateral" : "Borrowed") } : undefined,
        // One oracle-USD figure leads each side; where a reserve is unpriced the
        // token amounts are the headline, so a partial total is never asserted.
        value:
          reserves.length === 0 ? null : usd != null ? (
            <TitleTip title={formatUsdValue(usd)}>
              <Prov info={sparkUsdProvOnchain(id === "collateral" ? "Collateral" : "Borrowed")}>
                {formatCompactUsd(usd)}
              </Prov>
            </TitleTip>
          ) : (
            <TokenStack
              reserves={ranked}
              side={id === "collateral" ? "supply" : "debt"}
              atBlock={v.atBlock}
              usdOf={usdOf}
              inert={!detail}
            />
          ),
      };
    };
    heads = [
      side("collateral", collSupplies, suppliesRanked, collUsd),
      side("debt", v.borrows, borrowsRanked, debtUsd),
    ];
    // The live health factor: the position page's chain read. Absent on every
    // listing (0018); pending while the page's read is out.
    if (!v.chainHfStale || v.hfRead) {
      const noDebtRead = !v.chainHfStale && v.healthFactor == null && v.borrows.length > 0;
      heads.push({
        id: "health-factor",
        label: ratioLabel("pooled"),
        labelTip: HF_TIP,
        pending: v.chainHfStale && v.hfRead === "reading",
        value: v.chainHfStale ? (
          <span className="text-sm font-normal text-rb-400" data-spark-hf={v.hfRead}>
            not read, reload to try again
          </span>
        ) : noDebtRead ? null : v.healthFactor == null ? (
          <span className="text-rb-400">No debt</span>
        ) : (
          <Prov info={accountDataProv("Health factor", "healthFactor")}>{hfLabel(v.healthFactor)}</Prov>
        ),
      });
      // The index's balances trail the live read: the Pool can read no debt
      // where the card still shows some.
      if (noDebtRead)
        notice = (
          <div className="mb-2 text-xs text-rb-500" data-spark-pool-no-debt="">
            The Pool reads no debt{v.atBlock != null ? ` at block ${v.atBlock.toLocaleString("en-US")}` : ""}; the
            balances shown predate the account&rsquo;s latest events
          </div>
        );
    }
  }

  const common = { status, heads, identity, notice, counters, outcome };
  if (!detail) return { ...common, surface: "listing", menu: null };

  const detailCommon = {
    ...common,
    surface: "detail" as const,
    explainer: { body: explanation ?? null, viewHref },
    learnMore: ended ? sparkPositionModal(v.status) : sparkPositionModal(v.status, v.borrows.length > 0),
    menu: { leading: () => <SparkMenuRows wallet={v.wallet} />, exports: exports ?? null },
  };
  if (outcome) return { ...detailCommon, outcome, panel: closedPanel };

  // ── Each side's reserve rows, and the panel: the supply side's values on
  //    the left, the debt's and its risk on the right. A side whose total is
  //    unpriced has its reserves as the headline and no reserve rows.

  // Each priced side's reserves open under its headline (the chevron by the
  // icons); the panel keeps the additive values.
  const breakdownOf = (
    lines: { lines: SparkReserveAmount[]; control: ReactNode },
    s: "supply" | "debt",
  ): AssetBreakdown => ({
    assets: lines.lines.map((r) => {
      const usd = r.decimalsUnread ? null : reserveUsd(v, r.address, r.amount);
      return {
        id: `${s}-${r.address.toLowerCase()}`,
        symbol: r.symbol,
        address: r.address,
        usd,
        amount: <ReserveAmountText r={r} side={s} atBlock={v.atBlock} />,
        usdText:
          usd != null ? (
            <Prov info={sparkUsdProvOnchain(`${r.symbol} ${s === "supply" ? "supplied" : "borrowed"}`)}>
              {formatUsd(usd)}
            </Prov>
          ) : undefined,
      };
    }),
    dust: lines.control ?? undefined,
  });
  const headsWithRows = heads.map((h) =>
    h.id === "collateral" && collUsd != null && v.supplies.length > 1
      ? { ...h, breakdown: breakdownOf(supplyLines, "supply") }
      : h.id === "debt" && debtUsd != null && v.borrows.length > 1
        ? { ...h, breakdown: breakdownOf(debtLines, "debt") }
        : h,
  );
  const left: PositionPanelRow[] = [];
  const supplyInterest = interestRow("supply", captions?.supplyInterestUsd, captions?.supplyInterestSince);
  if (supplyInterest) left.push(supplyInterest);
  if (otherSupplies.length > 0) {
    left.push({
      id: "not-collateral",
      label: "Supplied, not collateral",
      value: (
        <span className="flex flex-col gap-0.5" data-spark-not-collateral="">
          {otherUsd != null && (
            <Prov info={sparkUsdProvOnchain("Supplied, not collateral")}>
              <PanelFigure>{formatCompactUsd(otherUsd)}</PanelFigure>
            </Prov>
          )}
          {othersRanked.map((r) => (
            <span key={r.address}>
              <ReserveAmountText r={r} side="supply" atBlock={v.atBlock} withIcon />
            </span>
          ))}
        </span>
      ),
      tip: NOT_COLLATERAL_TIP,
    });
  }

  const right: PositionPanelRow[] = [];
  const rate = captions?.borrowRate;
  if (rate) {
    right.push({
      id: "borrow-rate",
      label: rate.avg ? "Average borrow rate" : "Borrow rate",
      value: (
        <Prov
          info={
            rate.avg
              ? avgBorrowRateProv()
              : reserveDataProv("Variable borrow APR", "currentVariableBorrowRate", rate.symbol)
          }
        >
          {rate.pct.toFixed(2)}%
        </Prov>
      ),
      tip: rate.avg
        ? "The variable borrow rates on the borrowed reserves now, weighted by each debt's oracle USD value."
        : `The variable borrow rate SparkLend's Pool charges on ${rate.symbol ?? "the borrowed reserve"} now, read from the reserve's data.`,
    });
  }
  const borrowInterest = interestRow("debt", captions?.debtInterestUsd, captions?.debtInterestSince);
  if (borrowInterest) right.push(borrowInterest);
  if (chain && chain.totalDebtUsd > 0 && chain.totalCollateralUsd > 0) {
    right.push({
      id: "room-to-borrow",
      label: "Room to borrow",
      value: (
        <Prov info={accountDataProv("Available to borrow", "availableBorrowsBase")}>
          {formatCompactUsd(chain.availableBorrowsUsd)}
        </Prov>
      ),
      tip: "How much more, in USD, the account can borrow before it reaches its loan-to-value limit, from the Pool's account read.",
    });
  }
  // The liquidation read, from the live health factor: one supplied reserve
  // carrying ≥99.5% of the priced collateral anchors a liquidation price
  // (oracle price ÷ HF); otherwise the 1 − 1/HF drop of the whole collateral.
  if (!v.chainHfStale) {
    const read = sparkLiquidationRead(v);
    if (read.single) {
      right.push({
        id: "liquidates-at",
        label: "Liquidates at",
        value: (
          <span className="inline-flex items-center gap-1">
            <TokenChipIcon symbol={read.single.symbol} size={14} filterable={false} />
            <Prov info={sparkLiqPriceProv(read.single.symbol)}>{fmtLiqPrice(read.single.liqPrice)}</Prov>
          </span>
        ),
        tip: `The ${read.single.symbol} price at which the health factor reaches 1, with the debt held as it is.`,
      });
    } else if (read.dropPct != null) {
      right.push({
        id: "liquidates-on-drop",
        label: "Liquidates on a drop of",
        value: `${read.dropPct.toFixed(0)}%`,
        tip: "How far the collateral's value at SparkLend's oracle prices can fall before the health factor reaches 1.",
      });
    }
  }

  return { ...detailCommon, heads: headsWithRows, outcome: undefined, panel: [left, right] };
}

/** The SparkLend position card: its slots, drawn by the shared card. */
export function SparkPositionCard(props: SparkPositionCardProps) {
  return <PositionCard slots={useSparkCardSlots(props)} />;
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
