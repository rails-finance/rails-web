"use client";

// SparkLend position card — the chain-state analog of the Aave / Morpho / Maker
// position cards, through the SAME shared grammar (OpenPositionStats + StatValue)
// so it lines up with the other explorers.
//
// A SparkLend account is cross-collateralised: one wallet supplies and borrows
// MANY reserves. Every headline value is read from the chain — each reserve's supplied /
// borrowed balance is the index's scaled-balance reduction (0008/0011): the
// current rebased figure, interest included, equal to the spToken /
// variableDebtToken `balanceOf` at the indexed head. A LISTING card carries no
// health factor (rails-ops decision 0018): a listing exists to find a position,
// and risk is read live on the position page — whose own Pool
// getUserAccountData read is the only HF this card ever shows.

import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { formatDate, formatDateRange, formatDuration } from "@/lib/date";
import { useMountedNow } from "@/hooks/useMountedNow";
import { TipLabel } from "@/components/shared/tip-label";
import type { SparkLife } from "@/lib/spark/lives";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { StatValue, StatDash } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { TokenAmountNotLoaded, loadedSymbols } from "@/components/shared/not-loaded";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { WalletPill } from "@/components/shared/wallet-pill";
import { formatUnitsExact, formatCompact } from "@/lib/utils/format";
import { Prov } from "@/components/shared/provenance";
import { RevealTip } from "@/components/shared/reveal-tip";
import { PositionCardShell } from "@/components/shared/position-card-shell";
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
import { sparkPositionContent } from "@/lib/spark/position-content";
import { formatUsd } from "@/lib/shared/format-event";
import { fmtLiqPrice, hfLabelV4 } from "@/lib/aave-v4/format";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import { LifecyclePill, UsdHeadline } from "@/components/shared/position-card-pills";
import {
  useReserveDisclosure,
  ReserveDisclosureToggle,
  ReserveDisclosureList,
} from "@/components/shared/reserve-disclosure";
import type { SparkPositionSummary, SparkReserveAmount } from "@/lib/sources/api/spark-positions";
import { ExactSpan } from "@/components/shared/amount-text";
import { splitDust, useDustLines } from "@/components/shared/dust-reserves";
import { PositionCardDetail } from "@/components/shared/position-card-disclosure";
import { ShareBar } from "@/components/shared/share-bar";

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
   *  lowercased token address. Feeds the card's USD footnotes; a reserve the
   *  oracle didn't price is simply absent (the total then omits). */
  priceByAddress?: Record<string, number>;
  atBlock?: number;
  /** The position page's live health factor (Pool.getUserAccountData, read on
   *  visit). Null = no debt when read; meaningless when `chainHfStale`. A
   *  listing view never carries one (0018). */
  healthFactor?: number | null;
  /** True when no live read stands behind `healthFactor` — every listing
   *  view, and the position page until its chain read lands — so the HF
   *  column is omitted rather than asserted. */
  chainHfStale?: boolean;
  /** The position page only, while `chainHfStale`: the live read is out
   *  ("reading") or failed ("unread"); the card says so in the health
   *  factor's place. */
  hfRead?: "reading" | "unread";
}

/** The count tip's reason for events outnumbering transactions. */
const LIQ_FEE_ROW_NOTE = "a liquidation's fee to the Spark treasury is a row of its own";

/** What the detail card's mode word means; the listing calls every such
 *  position Open. */
const MODE_TIPS: Record<string, string> = {
  Borrowing: "The account owes debt now. The listing shows it as Open.",
  "Supply only": "The account supplies assets and owes nothing. The listing shows it as Open.",
  Liquidatable: "The health factor is below 1, so anyone can liquidate the account. The listing shows it as Open.",
};

const COLLATERAL_TIP =
  "What the account supplies that backs its borrowing, valued at SparkLend's oracle prices (the price feed SparkLend liquidates with). A supply is held as spTokens, SparkLend's receipt token, whose balance grows as interest accrues.";

const NOT_COLLATERAL_TIP =
  "Supplied and earning the supply rate, but backing no borrowing: its collateral switch is off, or SparkLend gives it a liquidation threshold of 0 (USDC, USDT, USDS and PYUSD).";

const PEAK_NOT_COLLATERAL_TIP =
  "Supplied and earning the supply rate, but never backing borrowing: the account never turned its collateral switch on (SparkLend gives USDC, USDT, USDS and PYUSD a liquidation threshold of 0).";

/** "24 days · 7 Oct - 31 Oct 2025", one line per life. */
function LivesLines({ lives }: { lives: readonly SparkLife[] }) {
  // An open life's length is read from the browser's clock once it arrives
  // (hooks/useMountedNow); the server render leaves it a placeholder.
  const now = useMountedNow();
  return (
    <div className="flex flex-col gap-0.5 text-xs text-rb-500" data-spark-card-lives={lives.length}>
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

const HF_TIP =
  "The collateral, each asset counted up to its liquidation threshold, divided by the debt, at SparkLend's oracle prices. At or below 1, anyone can liquidate the account. The bar beside it shows how far the collateral can fall before that.";

/** On-chain oracle USD for one reserve; null when SparkLend didn't price it. */
function reserveUsd(v: SparkPositionView, address: string, amount: number): number | null {
  const p = v.priceByAddress?.[address.toLowerCase()];
  return typeof p === "number" && p > 0 ? amount * p : null;
}

/** Total USD across a set of reserves, with the STRICT guard: null the moment any
 *  contributing reserve is unpriced, so a partial total is never asserted (it
 *  degrades to no footnote). */
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

/** Reserves sorted by oracle-USD value, largest first — so the capped icon
 *  cluster and the detail-page leg lines foreground worth, not naked token
 *  count. Falls back to the incoming raw-balance order the moment any leg is
 *  unpriced or `priceByAddress` is absent — a rank the oracle can't back is
 *  never asserted. */
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

/** Per-reserve token amounts, demoted beneath the USD headline — still the
 *  strict chain reads (each line traced, exact figure on hover), just no longer
 *  giving dust equal billing with the aggregate. */
function ReserveFootnoteLines({
  reserves,
  side,
  atBlock,
  usdOf,
}: {
  reserves: SparkReserveAmount[];
  side: "supply" | "debt";
  atBlock?: number;
  /** Prices each line for the dust rule (components/shared/dust-reserves). */
  usdOf: (r: SparkReserveAmount) => number | null;
}) {
  const { lines, control } = useDustLines(reserves, usdOf);
  if (reserves.length === 0) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500 tabular-nums space-y-0.5">
      {lines.map((r) => {
        if (r.decimalsUnread)
          return (
            <div key={r.address}>
              <TokenAmountNotLoaded address={r.address} label={r.symbol} />
            </div>
          );
        const exact = formatUnitsExact(r.amountRaw, r.decimals);
        return (
          <div key={r.address}>
            <Prov
              info={side === "supply" ? positionSupplyProv(r.symbol, atBlock) : positionDebtProv(r.symbol, atBlock)}
            >
              <ExactSpan exact={exact} symbol={r.symbol}>
                {formatCompact(r.amount)} {r.symbol}
              </ExactSpan>
            </Prov>
          </div>
        );
      })}
      {control}
    </div>
  );
}

/** The opened layer's per-reserve lines (ui-jobs 209): each amount traced as
 *  in `ReserveFootnoteLines`, with a bar for its share of the side's oracle
 *  USD. Drawn only where the side's total is priced (`total` from
 *  `totalUsd`, which is null the moment a reserve is unpriced or unread). */
function ReserveShareLines({
  reserves,
  side,
  atBlock,
  usdOf,
  total,
}: {
  reserves: SparkReserveAmount[];
  side: "supply" | "debt";
  atBlock?: number;
  usdOf: (r: SparkReserveAmount) => number | null;
  total: number;
}) {
  const { lines, control } = useDustLines(reserves, usdOf);
  if (reserves.length === 0) return null;
  return (
    <div className="mt-1.5 grid max-w-72 grid-cols-[auto_minmax(3rem,1fr)] items-center gap-x-3 gap-y-1 text-xs text-rb-500 tabular-nums">
      {lines.map((r) => (
        <div key={r.address} className="contents">
          <div className="whitespace-nowrap">
            <Prov
              info={side === "supply" ? positionSupplyProv(r.symbol, atBlock) : positionDebtProv(r.symbol, atBlock)}
            >
              <ExactSpan exact={formatUnitsExact(r.amountRaw, r.decimals)} symbol={r.symbol}>
                {formatCompact(r.amount)} {r.symbol}
              </ExactSpan>
            </Prov>
          </div>
          <ShareBar share={(usdOf(r) ?? 0) / total} side={side === "supply" ? "collateral" : "debt"} />
        </div>
      ))}
      {control && <div className="col-span-2">{control}</div>}
    </div>
  );
}

/** "incl. $X interest since 12 Sep 2026" — the interest inside the column's
 *  balance above: added since the balance last started from zero
 *  (computeSparkCardCaptions). Hidden below a cent — dust isn't worth a line. */
function InterestCaption({
  side,
  usd,
  since,
}: {
  side: "supply" | "debt";
  usd: number | null | undefined;
  since?: number | null;
}) {
  if (usd == null || usd < 0.01) return null;
  const words = `interest${since != null ? ` since ${formatDate(since)}` : ""}`;
  const tip = `The ${side === "supply" ? "supply" : "borrow"} interest added since the balance last started from zero. Lifetime interest is in the Lifetime flows panel.`;
  return (
    <div className="text-xs mt-0.5 text-rb-500">
      incl. <Prov info={sparkInterestCaptionProv(side)}>{formatUsd(usd)}</Prov>{" "}
      <RevealTip tip={tip} label={`${words}. ${tip}`} focusable className="focus-ring rounded-sm">
        <span className="underline decoration-dotted decoration-rb-400 underline-offset-2" data-spark-interest-tip="">
          {words}
        </span>
      </RevealTip>
    </div>
  );
}

/** "X% borrow rate" — the live Pool rate on the single borrowed reserve, or the
 *  debt-USD-weighted average across several (computeSparkCardCaptions gates). */
function BorrowRateCaption({ rate }: { rate: SparkCardCaptions["borrowRate"] | undefined }) {
  if (!rate) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500">
      <Prov
        info={
          rate.avg
            ? avgBorrowRateProv()
            : reserveDataProv("Variable borrow APR", "currentVariableBorrowRate", rate.symbol)
        }
      >
        {rate.pct.toFixed(2)}%
      </Prov>{" "}
      {rate.avg ? "avg borrow rate" : "borrow rate"}
    </div>
  );
}

/** Compact liquidation read beneath the Health Factor stat — the V4 spoke-card
 *  treatment: the tangible restatement of HF, not a peer of it. One supplied
 *  reserve carrying ≥99.5% of the oracle-priced collateral anchors a
 *  single-asset liquidation price (oracle price ÷ HF — both legs on-chain, so
 *  it survives the gate); otherwise the 1 − 1/HF combined-collateral drop.
 *  Nothing when there's no debt, HF ≤ 1 (the headline already says
 *  liquidatable), or HF reads ∞. */
function LiquidationFootnote({ v }: { v: SparkPositionView }) {
  const read = sparkLiquidationRead(v);
  if (read.single) {
    return (
      <div className="text-xs mt-0.5 text-rb-500 inline-flex items-center gap-1">
        <RevealTip
          tip={`The ${read.single.symbol} price at which the health factor reaches 1, with the debt held as it is.`}
          label="Liquidates at"
          focusable
        >
          Liquidates at
        </RevealTip>
        <TokenChipIcon symbol={read.single.symbol} size={14} filterable={false} />
        <Prov info={sparkLiqPriceProv(read.single.symbol)}>{fmtLiqPrice(read.single.liqPrice)}</Prov>
      </div>
    );
  }
  if (read.dropPct == null) return null;
  // Multi-collateral: 1 − 1/HF, a pure function of the traced HF above.
  return <div className="text-xs mt-0.5 text-rb-500">Liquidates on a {read.dropPct.toFixed(0)}% drop</div>;
}

/** Neutral HF headline (Rails doesn't color-code risk): "∞" above 100 — the
 *  figure stops meaning anything as a ratio there — else the family's format
 *  (four decimals below 1.1, as the event tiles and the prose). */
function hfLabel(hf: number): string {
  return hf >= 100 ? "∞" : hfLabelV4(hf);
}

/** A vertical stack of the wallet's reserves on one side, each traced. */
function ReserveStack({
  reserves,
  side,
  atBlock,
  usdOf,
}: {
  reserves: SparkReserveAmount[];
  side: "supply" | "debt";
  atBlock?: number;
  /** Prices each line for the dust rule (components/shared/dust-reserves). */
  usdOf: (r: SparkReserveAmount) => number | null;
}) {
  const { lines, control } = useDustLines(reserves, usdOf);
  if (reserves.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {lines.map((r) => (
        <StatValue key={r.address}>
          <Prov info={side === "supply" ? positionSupplyProv(r.symbol, atBlock) : positionDebtProv(r.symbol, atBlock)}>
            {r.decimalsUnread ? (
              <TokenAmountNotLoaded address={r.address} label={r.symbol} />
            ) : (
              <AssetAmount value={r.amount} symbol={r.symbol} exact={formatUnitsExact(r.amountRaw, r.decimals)} />
            )}
          </Prov>
        </StatValue>
      ))}
      {control}
    </div>
  );
}

/** A vertical stack of per-reserve PEAK amounts (highest recorded), each traced
 *  to its own receipt — the scaled-delta reducer's largest running claim
 *  (spToken transfers included on the supply side), valued at the index of the
 *  moment it stood, interest to then included. No USD: the peaks are maxima at
 *  different moments, so pricing them at one block would assert a portfolio
 *  that never existed. */
function PeakStack({ reserves, side }: { reserves: SparkReserveAmount[]; side: "supply" | "debt" }) {
  if (reserves.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {reserves.map((r) => (
        <StatValue key={r.address}>
          <Prov info={side === "supply" ? sparkPeakSupplyProv(r.symbol) : sparkPeakBorrowProv(r.symbol)}>
            {r.decimalsUnread ? (
              <TokenAmountNotLoaded address={r.address} label={r.symbol} />
            ) : (
              <AssetAmount value={r.amount} symbol={r.symbol} exact={formatUnitsExact(r.amountRaw, r.decimals)} />
            )}
          </Prov>
        </StatValue>
      ))}
    </div>
  );
}

export function SparkPositionCard({
  v,
  receipts = false,
  rowExtra,
  explanation,
  viewHref,
  captions,
  outcomeAt,
  notCollateral,
  lives,
  disclosureKey,
  debtDetail,
  riskDetail,
}: {
  v: SparkPositionView;
  /** Opt in to the closed/opened card (ui-jobs 209), keyed per position —
   *  forwarded to `PositionCardShell`. Closed, the card is its header and
   *  three headlines; opened, each headline's detail and the Explanation. */
  disclosureKey?: string;
  /** Opened-layer lines under Debt from the page's Pool read (the room left
   *  to borrow). Only drawn on a disclosing card. */
  debtDetail?: React.ReactNode;
  /** Opened-layer lines under Health factor from the page's Pool read (the
   *  distance bar). Only drawn on a disclosing card. */
  riskDetail?: React.ReactNode;
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
  receipts?: boolean;
  /** Context content riding the shell's heading-button row (the detail page
   *  passes the compact liquidation runway). */
  rowExtra?: React.ReactNode;
  /** The card's Explanation section (the V4/trove "About this position" home) —
   *  narration bullets + the risk strips describing the position NOW. */
  explanation?: React.ReactNode;
  /** Copy-this-view control, forwarded straight through to `PositionCardShell`
   *  — the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** Detail-page stat captions (accrued interest, borrow rate) — computed from
   *  the event stream + live Pool read (computeSparkCardCaptions). Listing
   *  cards omit them; the liquidation caption needs neither and always rides. */
  captions?: SparkCardCaptions;
}) {
  const isOther = (r: SparkReserveAmount) => notCollateral?.has(r.address.toLowerCase()) === true;
  const collSupplies = v.supplies.filter((r) => !isOther(r));
  const otherSupplies = v.supplies.filter(isOther);
  const collUsd = totalUsd(v, collSupplies);
  const otherUsd = totalUsd(v, otherSupplies);
  const debtUsd = totalUsd(v, v.borrows);
  // `receipts` is the render-site switch (listing defaults false; only the
  // detail page passes it) — computed here (not just below) because the
  // reserve-list disclosure hooks must run on every render, before the
  // closed/liquidated early return. A priced side's list only exists on the
  // detail page (the footnote lines); an unpriced side's list is the
  // headline itself and collapses on every surface.
  const isDetail = receipts;
  // The closed/opened card (ui-jobs 209): the per-side reserve chevrons give
  // way to the card's one header chevron, and every line under a headline
  // moves into the opened layer (<PositionCardDetail>).
  const disclosing = receipts && !!disclosureKey;
  // Value order for the cluster and the leg lines. Dust reserves (under a
  // cent) leave the icon stack, its "+N" and the list count; the lines put
  // them behind the "N dust reserves hidden" control.
  const usdOf = dustUsdOf(v);
  const suppliesRanked = rankByValue(v, collSupplies);
  const borrowsRanked = rankByValue(v, v.borrows);
  const suppliesShown = splitDust(suppliesRanked, usdOf).shown;
  const borrowsShown = splitDust(borrowsRanked, usdOf).shown;
  const supplyListCount = collUsd == null ? suppliesShown.length : isDetail ? suppliesShown.length : 0;
  const debtListCount = debtUsd == null ? borrowsShown.length : isDetail ? borrowsShown.length : 0;
  const supplyDisclosure = useReserveDisclosure(supplyListCount);
  const debtDisclosure = useReserveDisclosure(debtListCount);

  // Closed / liquidated: the wallet holds no open reserves, so the headline is
  // what each asset held at its height — highest recorded per-reserve supply +
  // debt (chain-state MAX over the wallet's life, per asset; no USD).
  if (v.status === "closed" || v.status === "liquidated") {
    return (
      <PositionCardShell
        receipts={receipts}
        explanation={explanation}
        viewHref={viewHref}
        learnMore={sparkPositionContent({ status: v.status })}
        disclosureKey={disclosureKey}
      >
        <ClosedPositionStats
          // A disclosing card's closed layer is the header and the outcome;
          // the highest recorded balances are its opened layer.
          detailGate={disclosing ? PositionCardDetail : undefined}
          outcome={v.status}
          leadingIdentity={
            receipts ? undefined : (
              <WalletPill wallet={v.wallet} ensName={null} filterProtocol="spark" bookmarkProtocol="spark" />
            )
          }
          identity={
            <PositionCardMeta
              lastActivityAt={v.lastActivityAt}
              eventCount={v.txCount}
              eventTotal={v.eventTotal}
              liquidationCount={v.liquidationCount}
              countNote={v.liquidationCount > 0 ? LIQ_FEE_ROW_NOTE : undefined}
            />
          }
          closedAt={v.status === "liquidated" && outcomeAt != null ? outcomeAt : v.lastActivityAt}
          collateral={<PeakStack reserves={v.peakSupplies.filter((r) => !isOther(r))} side="supply" />}
          collateralFootnote={
            v.peakSupplies.some(isOther) ? (
              <div className="mt-2" data-spark-not-collateral="">
                <div className="text-rb-500 text-xs font-semibold">
                  <TipLabel text="Supplied, not collateral" tip={PEAK_NOT_COLLATERAL_TIP} />
                </div>
                <PeakStack reserves={v.peakSupplies.filter(isOther)} side="supply" />
              </div>
            ) : undefined
          }
          extra={lives && lives.length > 1 ? { label: "Time open", value: <LivesLines lives={lives} /> } : undefined}
          debt={<PeakStack reserves={v.peakBorrows} side="debt" />}
        />
      </PositionCardShell>
    );
  }

  // Detail render (receipts): the V4 spoke-card header grammar — a neutral
  // mode-word pill (what the account is doing NOW: Borrowing / Supply only /
  // Liquidatable, not a lifecycle word) plus the wallet pill (facehash +
  // copyable address). The LISTING render keeps the lifecycle pill + plain
  // text address: status is the listing's filter axis, and the whole card sits
  // inside a row <Link> where the pill's buttons would fight the navigation.
  const modeWord =
    v.borrows.length > 0
      ? v.healthFactor != null && v.healthFactor < 1
        ? "Liquidatable"
        : "Borrowing"
      : "Supply only";

  // `isDetail` (== `receipts`) doubles as the surface discriminator: the
  // listing omits the per-leg lines (V4 spoke-card parity — USD headline +
  // capped cluster only), the detail page keeps the full traced list.

  // Supplied but backing no borrowing: listed apart beneath Collateral (in
  // the opened layer on a disclosing card).
  const notCollateralBlock =
    otherSupplies.length > 0 ? (
      <div className="mt-2" data-spark-not-collateral="">
        <div className="text-rb-500 text-xs font-semibold">
          <TipLabel text="Supplied, not collateral" tip={NOT_COLLATERAL_TIP} />
        </div>
        {otherUsd != null ? (
          <>
            <div className="text-sm font-semibold tabular-nums">
              <Prov info={sparkUsdProvOnchain("Supplied, not collateral")}>{formatUsd(otherUsd)}</Prov>
            </div>
            {isDetail && (
              <ReserveFootnoteLines
                reserves={rankByValue(v, otherSupplies)}
                side="supply"
                atBlock={v.atBlock}
                usdOf={usdOf}
              />
            )}
          </>
        ) : (
          <ReserveStack reserves={otherSupplies} side="supply" atBlock={v.atBlock} usdOf={usdOf} />
        )}
      </div>
    ) : null;

  return (
    <PositionCardShell
      receipts={receipts}
      rowExtra={rowExtra}
      explanation={explanation}
      viewHref={viewHref}
      learnMore={sparkPositionContent({ status: v.status, hasDebt: v.borrows.length > 0 })}
      disclosureKey={disclosureKey}
    >
      <OpenPositionStats
        stackOnPhone={disclosing}
        statusPill={
          receipts ? (
            <RevealTip tip={MODE_TIPS[modeWord]} label={`${modeWord}. ${MODE_TIPS[modeWord]}`} focusable>
              <span className="font-bold px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
                {modeWord}
              </span>
            </RevealTip>
          ) : (
            <LifecyclePill status={v.status} />
          )
        }
        // The protocol name is redundant inside the SparkLend explorer (one
        // market), so the wallet leads — WalletPill on both surfaces (buttons,
        // not anchors, so it lives safely inside the listing card's <Link>),
        // stays copy-selectable).
        leadingIdentity={
          receipts ? undefined : (
            <WalletPill wallet={v.wallet} ensName={null} filterProtocol="spark" bookmarkProtocol="spark" />
          )
        }
        // Right-hand activity-meta cluster: time-ago, transaction count, liquidation.
        identity={
          <PositionCardMeta
            lastActivityAt={v.lastActivityAt}
            eventCount={v.txCount}
            eventTotal={v.eventTotal}
            liquidationCount={v.liquidationCount}
            countNote={v.liquidationCount > 0 ? LIQ_FEE_ROW_NOTE : undefined}
          />
        }
        columns={[
          // The V4 spoke-card grammar: ONE oracle-USD figure leads each side
          // (the asset cluster carries the identities), the per-reserve token
          // amounts demote to traced footnote lines. When any contributing
          // reserve is unpriced the token stack stays the headline — a partial
          // USD total is never asserted.
          {
            label: CARD_VOCAB.collateral,
            labelTip: isDetail ? COLLATERAL_TIP : undefined,
            assetIcons:
              collSupplies.length > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <InlineAssetCluster symbols={loadedSymbols(suppliesShown)} />
                  {disclosing ? null : (
                    <ReserveDisclosureToggle disclosure={supplyDisclosure} count={suppliesShown.length} />
                  )}
                </span>
              ) : undefined,
            value:
              collUsd != null ? (
                <UsdHeadline usd={collUsd} info={sparkUsdProvOnchain("Collateral")} />
              ) : supplyDisclosure.collapsible && !disclosing ? null : (
                <ReserveStack reserves={collSupplies} side="supply" atBlock={v.atBlock} usdOf={usdOf} />
              ),
            footnote: disclosing ? (
              <PositionCardDetail>
                {collUsd != null && (
                  <ReserveShareLines
                    reserves={suppliesRanked}
                    side="supply"
                    atBlock={v.atBlock}
                    usdOf={usdOf}
                    total={collUsd}
                  />
                )}
                {notCollateralBlock}
              </PositionCardDetail>
            ) : (
              <>
                {collUsd == null && supplyDisclosure.collapsible && (
                  <ReserveDisclosureList disclosure={supplyDisclosure}>
                    <ReserveStack reserves={collSupplies} side="supply" atBlock={v.atBlock} usdOf={usdOf} />
                  </ReserveDisclosureList>
                )}
                {isDetail && collUsd != null && (
                  <ReserveDisclosureList disclosure={supplyDisclosure}>
                    <ReserveFootnoteLines reserves={suppliesRanked} side="supply" atBlock={v.atBlock} usdOf={usdOf} />
                  </ReserveDisclosureList>
                )}
                <InterestCaption
                  side="supply"
                  usd={captions?.supplyInterestUsd}
                  since={captions?.supplyInterestSince}
                />
                {notCollateralBlock}
              </>
            ),
          },
          {
            label: CARD_VOCAB.debt,
            assetIcons:
              v.borrows.length > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <InlineAssetCluster symbols={loadedSymbols(borrowsShown)} />
                  {disclosing ? null : (
                    <ReserveDisclosureToggle disclosure={debtDisclosure} count={borrowsShown.length} />
                  )}
                </span>
              ) : undefined,
            value:
              debtUsd != null ? (
                <UsdHeadline usd={debtUsd} info={sparkUsdProvOnchain("Borrowed")} />
              ) : debtDisclosure.collapsible && !disclosing ? null : (
                <ReserveStack reserves={v.borrows} side="debt" atBlock={v.atBlock} usdOf={usdOf} />
              ),
            footnote: disclosing ? (
              <PositionCardDetail>
                {debtUsd != null && (
                  <ReserveShareLines
                    reserves={borrowsRanked}
                    side="debt"
                    atBlock={v.atBlock}
                    usdOf={usdOf}
                    total={debtUsd}
                  />
                )}
                <BorrowRateCaption rate={captions?.borrowRate} />
                {debtDetail}
              </PositionCardDetail>
            ) : (
              <>
                {debtUsd == null && debtDisclosure.collapsible && (
                  <ReserveDisclosureList disclosure={debtDisclosure}>
                    <ReserveStack reserves={v.borrows} side="debt" atBlock={v.atBlock} usdOf={usdOf} />
                  </ReserveDisclosureList>
                )}
                {isDetail && debtUsd != null && (
                  <ReserveDisclosureList disclosure={debtDisclosure}>
                    <ReserveFootnoteLines reserves={borrowsRanked} side="debt" atBlock={v.atBlock} usdOf={usdOf} />
                  </ReserveDisclosureList>
                )}
                <BorrowRateCaption rate={captions?.borrowRate} />
                <InterestCaption side="debt" usd={captions?.debtInterestUsd} since={captions?.debtInterestSince} />
              </>
            ),
          },
          // The live HF — the position page's own chain read. Omitted (not
          // dashed) on every listing view and until the page's read lands
          // (`chainHfStale`) — an unasserted layer, per the chain-truth
          // charter. A read wallet with no debt reads "No debt" (HF is
          // undefined, ∞ in protocol terms) — only when the card shows no debt
          // either: the balances are the index's, which trails the live read.
          v.chainHfStale
            ? v.hfRead
              ? {
                  label: ratioLabel("pooled"),
                  labelTip: HF_TIP,
                  value: (
                    <StatValue color="text-rb-400">
                      <span className="text-sm font-normal" data-spark-hf={v.hfRead}>
                        {v.hfRead === "reading" ? "reading…" : "not read, reload to try again"}
                      </span>
                    </StatValue>
                  ),
                }
              : null
            : {
                label: ratioLabel("pooled"),
                labelTip: HF_TIP,
                value:
                  v.healthFactor == null && v.borrows.length > 0 ? (
                    <StatDash />
                  ) : v.healthFactor == null ? (
                    <StatValue color="text-rb-400">No debt</StatValue>
                  ) : (
                    <StatValue>
                      <Prov info={accountDataProv("Health factor", "healthFactor")}>{hfLabel(v.healthFactor)}</Prov>
                    </StatValue>
                  ),
                // The liquidation read beneath HF — its tangible restatement
                // (single collateral → oracle liq price, multi → 1 − 1/HF drop).
                footnote:
                  v.healthFactor == null && v.borrows.length > 0 ? (
                    <div className="text-xs mt-0.5 text-rb-500">
                      The Pool reads no debt{v.atBlock != null ? ` at block ${v.atBlock.toLocaleString("en-US")}` : ""};
                      the balances shown predate the account&rsquo;s latest events
                    </div>
                  ) : disclosing ? (
                    <PositionCardDetail>
                      <LiquidationFootnote v={v} />
                      {riskDetail}
                    </PositionCardDetail>
                  ) : (
                    <LiquidationFootnote v={v} />
                  ),
              },
        ]}
      />
    </PositionCardShell>
  );
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
