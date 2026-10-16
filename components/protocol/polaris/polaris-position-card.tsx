"use client";

// Polaris CDP card — one (market, cdpId): a slot builder for the shared
// position card (components/shared/position-card.tsx), as Liquity V2's is.
//
// THE GRAIN IS THE CDP NFT: the card is one CDP in one market — the id and
// the market are the identity, the holder a mutable fact shown beside them.
// UNITS ARE NATIVE: pETH collateral, the market's stablecoin as debt. USD
// appears once, as the collateral's value by the protocol's own price feed,
// labelled as a testnet figure.
//
// STATUS IS TWO-AXIS. The lifecycle pill says open / closed / liquidated; the
// liquidation history is the orthogonal axis — on this protocol an id is
// minted once, so a liquidated CDP is always terminal, but the meta cluster
// still carries the count the way every explorer does.
//
// THE RATIO COLUMN STATES ONE FIGURE PER LANE, and says which it is. On the
// chain lane it is the contract's own getICR(id) against the MCR in force
// (defensive-mode MCR when that mode is on) — stated flat. On the index lane
// it is an APPROXIMATION, marked ≈: the row's last emitted collateral and
// debt priced at the market's own feed, from the one market-board read the
// listing makes per page load (never one read per row). Interest since the
// last touch and the PSM's pending share settle only at the next touch, so
// the two can differ — the ≈, the tooltip and the receipt all say so. Without
// the board read the column stays a dash (a pulse while the fetch is in
// flight); it never states a ratio it cannot price.
//
// The card view builds from EITHER lane: `viewFromSummary` (the index row —
// the last CDPUpdated's resulting figures) or `viewFromChain` (the live
// overlay — the cdpManager's own entire figures at head, the primary truth on
// the detail page).

import { TokenFigure } from "@/components/shared/token-figure";
import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, Copy, Image as ImageIcon, Link2 } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { AssetPopover } from "@/components/shared/asset-popover";
import { RevealTip } from "@/components/shared/reveal-tip";
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
import { StatValue } from "@/components/shared/stat-value";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { WalletPill } from "@/components/shared/wallet-pill";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import {
  formatCompact,
  formatExact,
  formatNumber,
  formatUnitsExact,
  formatUsdValue,
  withRealMinus,
} from "@/lib/utils/format";
import { Prov } from "@/components/shared/provenance";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import { latestStateProv, peakProv } from "@/lib/polaris/event-provenance";
import {
  listingIcrProv,
  liveEntireProv,
  liveEquityProv,
  liveIcrProv,
  liveMcrProv,
  liveModeProv,
  liveOwnerProv,
  livePendingProv,
  liveRateProv,
  liveRecordedDebtProv,
  liveUsdValueProv,
  liveDebtUsdProv,
  polarisAnnualCostProv,
} from "@/lib/polaris/live-provenance";
import { PETH, POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import { polarisPositionModal } from "@/lib/polaris/event-templates";
import { polarisCdpNftUrl, polarisPositionHref } from "@/lib/polaris/routes";
import { SEPOLIA_CHAIN_ID } from "@/lib/shared/chains";
import type { Provenance } from "@/components/shared/provenance";
import type { PolarisPositionSummary, PolarisPositionStatus } from "@/lib/sources/api/polaris-positions";
import type { PolarisChainResponse } from "@/lib/api/fetch-polaris-position";
// Type-only — lib/sources/chain/* is server-only, and an `import type` is
// erased before the client bundle is built (the markets view does the same).
import type { PolarisMarketsChainResponse } from "@/lib/sources/chain/polaris-position";
import { AmountText } from "@/components/shared/amount-text";
import { formatPolarisRatio } from "@/lib/polaris/ratio-format";

export interface PolarisPositionView {
  market: PolarisMarket;
  cdpId: string;
  stableSymbol: string;
  /** The current holder — null once the NFT is burned and no index row names
   *  the last one. */
  owner: string | null;
  status: PolarisPositionStatus;
  liquidated: boolean;
  /** Collateral (pETH) — the entire figure on the chain lane, the last
   *  CDPUpdated's resulting figure on the index lane. */
  coll: number;
  collRaw: string | null;
  debt: number;
  debtRaw: string | null;
  /** Collateral valued by the protocol's own feed — the position read on the
   *  chain lane, the market board's own legs on the index lane. */
  collUsd: number | null;
  /** The debt in USD: USDp at one dollar, GOLDp at the XAU/USD leg of the
   *  same read. */
  debtUsd: number | null;
  /** Chain lane only — entireColl × the feed's pETH-in-debt-unit price, minus
   *  the debt owed. A valuation at the block, not a profit — may be negative.
   *  An entire debt at or below zero owes nothing (the next touch settles it
   *  to zero), so it never adds to the equity. */
  equity: number | null;
  /** Chain lane only — the debt as recorded at the last touch, the base the
   *  entire debt's pending legs are added to. */
  recordedDebt: number | null;
  /** The collateral ratio as a fraction; null without debt, or without a
   *  price. On the chain lane it is getICR(id); on the index lane the row's
   *  own coll × the market's feed ÷ its own debt — an approximation, and the
   *  card marks it one. */
  icr: number | null;
  mcr: number | null;
  defensiveMode: boolean;
  /** The market-board read the ratio needs has not answered yet — the ratio
   *  slot holds a pulse rather than a dash. Never true once it has settled,
   *  answered or not. */
  pricePending: boolean;
  /** Chain lane only — the pending legs since the last touch. */
  pendingInterest: number | null;
  pendingStables: number | null;
  pendingReward: number | null;
  /** Chain lane only — the net PSM share pending on the debt, signed. */
  pendingPsmDebt: number | null;
  /** Chain lane only — the rate in force, fraction. */
  interestRate: number | null;
  /** Terminal-card headlines (lifetime maxima). */
  peakColl: number;
  peakDebt: number;
  /** The peaks count a liquidation's own seized state (the detail page reads
   *  the rows; the listing has only the index's maxima). */
  peaksCountLiquidation?: boolean;
  /** A liquidated CDP's collateral surplus, set aside for the owner to claim
   *  (the liquidation row's `_collSurplus`); the detail page reads it from
   *  the rows. */
  surplus?: number;
  lastActivityAt: number | null;
  eventCount: number;
  liqCount: number;
  transferCount: number;
  /** Which lane the figures assert. */
  basis: "chain" | "index";
  blockNumber: number | null;
}

const collProv = (v: PolarisPositionView): Provenance =>
  v.basis === "chain" ? liveEntireProv("coll", v.market) : latestStateProv("coll", v.market);
const debtProv = (v: PolarisPositionView): Provenance =>
  v.basis === "chain" ? liveEntireProv("debt", v.market) : latestStateProv("debt", v.market);

const pct = (f: number): string => `${(f * 100).toFixed(1)}%`;
/** A floor at the grain it is set in: "115%", "112.5%". */
const pctShort = (f: number): string => `${Number((f * 100).toFixed(1))}%`;

/** What the Debt label says on a CDP that owes nothing. */
const COLLATERAL_ONLY_TIP = "Owes nothing at this block. A Polaris CDP can hold collateral with no debt.";

/** A pETH price in the market's own stablecoin, at a readable grain: three
 *  decimals under 1, two under 100, whole numbers above (USDp's feed runs in
 *  the thousands, where a compact "5K" would hide the move). Shared with the
 *  "Since its last touch" block, which states the same quantity at both ends
 *  of its window. */
export const formatPethPrice = (p: number): string => {
  if (p < 0.01) return "<0.01";
  if (p < 1) return p.toFixed(3);
  if (p < 100) return p.toFixed(2);
  return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
};

/** What the ≈ on the listing's ratio means, in one sentence. Rides the shared
 *  RevealTip (hover on desktop, first tap on touch) beside the <Prov>
 *  receipt — the tooltip says what the figure IS, the receipt where it came
 *  from. */
const LISTING_ICR_TIP =
  "An estimate: the CDP's last stated collateral and debt, valued at the market's price feed as of the latest read. Interest since the last touch and any PSM share are not in it. The CDP's page states the contract's own ratio.";

/** RevealTip's bubble is sized for a number (nowrap, tabular figures); a
 *  sentence needs its own width and normal prose settings, declared on the
 *  child so they win over the bubble's own. */
const TIP_PROSE = "block w-64 whitespace-normal text-left font-normal normal-nums leading-snug";

/** Three decimals, trailing zeros kept ("2,035.800"), so the card's figures
 *  read at one grain; a magnitude too small for three decimals keeps
 *  formatNumber's non-zero rule. */
const cardFigure = (value: number): string =>
  value !== 0 && Math.abs(value) < 0.0005
    ? formatNumber(value)
    : value.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** A figure in the card's cost and debt-sum lines, at the card's grain:
 *  three decimals with trailing zeros kept ("24.040"), so the sum reads at the
 *  same grain as the Debt figure above it. A magnitude too small for three
 *  decimals keeps AmountText's floor and tooltip. */
export function CardSumAmount({ value }: { value: number }) {
  if (value !== 0 && Math.abs(value) < 0.0005) return <AmountText value={value} />;
  return <>{cardFigure(value)}</>;
}

/** A card figure at three decimals. `compact` is a headline's form (anatomy
 *  C10): from a thousand up it reads in the listing's compact form ("770.33K"),
 *  as AssetAmount's does. The exact decimal rides the tip and the inspector's
 *  `data-prov-exact`. The token stands beside it as an icon (`assets`). */
function CardFigure({
  value,
  symbol,
  exact,
  signed = false,
  compact = false,
}: {
  value: number;
  symbol: string;
  exact?: string;
  signed?: boolean;
  compact?: boolean;
}) {
  const full = signed ? withRealMinus(exact ?? formatExact(value)) : (exact ?? formatExact(value));
  const face = compact && Math.abs(value) >= 1_000 ? formatCompact(value) : cardFigure(value);
  const shown = signed ? withRealMinus(face) : face;
  return (
    <RevealTip tip={`${full} ${symbol}`} label={`${full} ${symbol}`}>
      <span data-prov-exact={full} data-prov-symbol={symbol}>
        {shown}
      </span>
    </RevealTip>
  );
}

/** A figure with the token named in words and by its glyph, for a cell that
 *  has no icon slot of its own (Surplus to claim). The word and the glyph wrap
 *  under the figure where the column is too narrow for all three. */
function CardAmount(props: { value: number; symbol: string; address: string; exact?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <CardFigure value={props.value} symbol={props.symbol} exact={props.exact} />
      <span data-prov-hidden="" className="inline-flex items-center gap-2">
        <span className="text-[0.55em] font-medium text-rb-500">{props.symbol}</span>
        <span className="inline-flex items-center justify-center rounded-full bg-raised p-0.5">
          <TokenChipIcon symbol={props.symbol} address={props.address} size={28} filterable={false} />
        </span>
      </span>
    </span>
  );
}

/** A headline's token icon; it opens the asset's popover with the exact figure. */
function assetIcon(symbol: string, address: string, figure: string): ReactNode {
  return (
    <AssetPopover symbol={symbol} address={address} chainId={SEPOLIA_CHAIN_ID} figure={`${figure} ${symbol}`}>
      <TokenChipIcon symbol={symbol} address={address} size={28} filterable={false} untitled />
    </AssetPopover>
  );
}

/** The CDP-grain identity on a listing row: market chip · CDP id, then the two
 *  things a reader wants to do with the id — take it away, and look at the NFT
 *  it names.
 *
 *  Both are <button>s, never <a>s: this row renders inside the driver's row
 *  <Link>, and a nested anchor is invalid HTML. So the NFT link is a button +
 *  window.open, and both handlers preventDefault/stopPropagation so a click
 *  copies or opens instead of navigating to the CDP's page. */
function CdpIdentity({ v }: { v: PolarisPositionView }) {
  const cfg = POLARIS_MARKET_CONFIG[v.market];
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-rb-500 tabular-nums">
      <TokenChipIcon symbol={cfg.stable.symbol} address={cfg.stable.address} size={14} filterable={false} />
      {cfg.stable.symbol}
      <span className="text-rb-400">·</span>
      CDP #{v.cdpId}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // The bare number, not "CDP #8" — what a reader pastes into a search
          // box, a URL or the contract's own getCDP(id).
          navigator.clipboard.writeText(v.cdpId);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label={copied ? "Copied" : "Copy CDP number"}
        title={copied ? "Copied!" : "Copy"}
        className="text-rb-500 hover:text-foreground cursor-pointer"
      >
        <Icon name={copied ? "check" : "copy"} size={12} />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          window.open(polarisCdpNftUrl(v.market, v.cdpId), "_blank", "noopener,noreferrer");
        }}
        aria-label="View the CDP NFT on Etherscan"
        title="View the CDP NFT on Etherscan"
        className="inline-flex items-center gap-1 text-rb-500 hover:text-foreground transition-colors cursor-pointer"
      >
        <ImageIcon size={12} />
        <Link2 size={12} className="-rotate-45" />
      </button>
    </span>
  );
}

/** The CDP's rows at the head of the card's ⋮: its number with a copy, its
 *  NFT, and a link to this page. */
function CdpMenuRows({ v }: { v: PolarisPositionView }) {
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
        title={`CDP #${v.cdpId}`}
        subtitle={copied === "id" ? "Copied" : "Copy the CDP number"}
        onClick={() => copy("id", v.cdpId)}
      />
      <ToolsMenuItem
        icon={<ImageIcon size={16} />}
        title="CDP NFT"
        subtitle="Open it on Etherscan"
        onClick={() => window.open(polarisCdpNftUrl(v.market, v.cdpId), "_blank", "noopener,noreferrer")}
      />
      <ToolsMenuItem
        icon={copied === "link" ? <Check size={16} /> : <Link2 size={16} className="-rotate-45" />}
        title="Link to this CDP"
        subtitle={copied === "link" ? "Copied" : "Copy the page's address"}
        onClick={() => copy("link", `${window.location.origin}${polarisPositionHref(v.market, v.cdpId)}`)}
      />
    </>
  );
}

/** The holder's receipt on the page's wallet row: on the chain lane the
 *  holder is the NFT's ownerOf at head. */
export function polarisOwnerWrap(v: PolarisPositionView): ((pill: ReactNode) => ReactNode) | undefined {
  if (v.basis !== "chain" || !v.owner) return undefined;
  const owner = v.owner;
  return (pill) => (
    <Prov info={liveOwnerProv(v.market)} value={owner}>
      {pill}
    </Prov>
  );
}

/** What a Polaris page or listing hands the card. */
export interface PolarisPositionCardProps {
  v: PolarisPositionView;
  /** `detail` on the CDP's page (receipts, panel, (i)); `listing` in a row. */
  surface?: "listing" | "detail";
  /** The (i) pane's prose. */
  explanation?: ReactNode;
  /** Open the Explanation pane on first mount, and hear about every toggle.
   *  The detail page passes a stored per-CDP flag through them
   *  (hooks/usePolarisUiState.ts); the listing render passes neither. */
  explanationDefaultOpen?: boolean;
  onExplanationToggle?: (open: boolean) => void;
  /** Copy-this-view link: the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** The ⋮'s export shapes (`polarisExports`). Absent: the ⋮ holds the CDP's
   *  rows and the provenance row alone. */
  exports?: PositionCardExports;
}

/** The Polaris slots for the shared position card: the headlines, the panel,
 *  the tag, the ⋮ and the counters, from the CDP's view. */
export function polarisCardSlots({
  v,
  surface = "detail",
  explanation,
  explanationDefaultOpen,
  onExplanationToggle,
  viewHref,
  exports,
}: PolarisPositionCardProps): PositionCardSlots {
  const detail = surface === "detail";
  const cfg = POLARIS_MARKET_CONFIG[v.market];
  const stable = v.stableSymbol;
  const stableAddress = cfg.stable.address;
  const index = v.basis === "index";

  const status: PositionCardStatus | null =
    v.status === "liquidated"
      ? { word: "Liquidated", tone: "danger" }
      : v.status === "closed"
        ? { word: "Closed", tone: "muted" }
        : null;

  const counters = {
    lastActivityAt: v.lastActivityAt,
    eventCount: v.eventCount,
    liquidationCount: v.liqCount > 0 ? v.liqCount : null,
    // The foot strip reads transactions, warnings, then the age.
    ...(detail ? { order: "age-last" as const } : {}),
  };

  // The listing names the holder and the CDP; the detail page's wallet row
  // names the holder, the card's ⋮ the CDP and the page heading the testnet,
  // so the card states the market.
  const identity = detail ? (
    <span className="text-xs text-rb-500">{stable} market</span>
  ) : (
    <span className="flex items-center gap-2">
      {v.owner && <WalletPill wallet={v.owner} ensName={null} filterProtocol="polaris" bookmarkProtocol="polaris" />}
      <CdpIdentity v={v} />
    </span>
  );

  const ended = v.status === "closed" || v.status === "liquidated";
  let heads: PositionCardHead[];
  let outcome: PositionCardOutcome | undefined;

  if (ended) {
    // One sentence each (Miles, 16 Oct 2026); why a peak can exceed the
    // deposits, and what a liquidation writes in, is the receipt's to say.
    const peakTip = (what: "coll" | "debt") =>
      `The most ${what === "coll" ? `pETH the CDP held` : `${stable} the CDP owed`} after any transaction on it${
        v.peaksCountLiquidation ? ", its liquidation included" : ""
      }.`;
    heads = [
      {
        id: "peak-collateral",
        label: CARD_VOCAB.peakCollateral,
        labelTip: peakTip("coll"),
        labelIcon: assetIcon(PETH.symbol, PETH.address, formatExact(v.peakColl)),
        value:
          v.peakColl > 0 ? (
            <Prov info={peakProv("coll", v.market, v.peaksCountLiquidation)}>
              <span className="text-rb-500">
                <CardFigure value={v.peakColl} symbol={PETH.symbol} compact />
              </span>
            </Prov>
          ) : null,
      },
      {
        id: "peak-debt",
        label: CARD_VOCAB.peakDebt,
        labelTip: peakTip("debt"),
        labelIcon: assetIcon(stable, stableAddress, formatExact(v.peakDebt)),
        value:
          v.peakDebt > 0 ? (
            <Prov info={peakProv("debt", v.market, v.peaksCountLiquidation)}>
              <span className="text-rb-500">
                <CardFigure value={v.peakDebt} symbol={stable} compact />
              </span>
            </Prov>
          ) : null,
      },
    ];
    outcome = {
      word: v.status === "liquidated" ? "Liquidated" : "Closed",
      dates: v.lastActivityAt ? [{ at: v.lastActivityAt }] : undefined,
      extra:
        v.status === "liquidated" && v.surplus != null && v.surplus > 0
          ? {
              label: "Surplus to claim",
              value: (
                <>
                  <StatValue>
                    <CardAmount value={v.surplus} symbol={PETH.symbol} address={PETH.address} />
                  </StatValue>
                  <div className="text-xs mt-0.5 text-rb-500">
                    set aside at the liquidation for the owner to claim; this page does not show claims
                  </div>
                </>
              ),
            }
          : undefined,
    };
  } else {
    const mcrInForce = v.mcr;
    const belowMin = v.icr != null && mcrInForce != null && v.icr < mcrInForce;
    heads = [
      {
        id: "collateral",
        label: CARD_VOCAB.collateral,
        value:
          v.coll > 0 ? (
            <Prov info={collProv(v)}>
              <CardFigure
                value={v.coll}
                symbol={PETH.symbol}
                compact
                exact={v.collRaw != null ? formatUnitsExact(v.collRaw, 18) : undefined}
              />
            </Prov>
          ) : null,
        assets:
          v.coll > 0
            ? assetIcon(
                PETH.symbol,
                PETH.address,
                v.collRaw != null ? formatUnitsExact(v.collRaw, 18) : formatExact(v.coll),
              )
            : undefined,
        usd:
          v.collUsd != null && v.collUsd > 0 ? (
            <Prov info={liveUsdValueProv("Collateral", index)} value={formatUsdValue(v.collUsd)}>
              <span className="font-bold text-green-400">{formatUsdValue(v.collUsd)}</span>
            </Prov>
          ) : v.pricePending && v.coll > 0 ? (
            // The USD value needs the same price read the ratio does, so it
            // holds a pulse while that is in flight.
            <span className="inline-block h-3 w-16 rounded-md bg-rb-200 dark:bg-rb-700 animate-pulse" />
          ) : null,
      },
      {
        id: "debt",
        label: CARD_VOCAB.debt,
        labelTip: v.debt <= 0 && v.coll > 0 ? COLLATERAL_ONLY_TIP : undefined,
        value:
          v.debt > 0 ? (
            <Prov info={debtProv(v)}>
              <CardFigure
                value={v.debt}
                symbol={stable}
                compact
                exact={v.debtRaw != null ? formatUnitsExact(v.debtRaw, 18) : undefined}
              />
            </Prov>
          ) : v.coll > 0 ? (
            // A CDP holding collateral and no debt states the word; a dash
            // would read as a missing figure.
            <span className="text-rb-500">none</span>
          ) : null,
        assets:
          v.debt > 0
            ? assetIcon(
                stable,
                stableAddress,
                v.debtRaw != null ? formatUnitsExact(v.debtRaw, 18) : formatExact(v.debt),
              )
            : undefined,
        usd:
          v.debtUsd != null && v.debtUsd > 0 ? (
            <Prov info={liveDebtUsdProv(v.market, index)} value={formatUsdValue(v.debtUsd)}>
              <span className="font-bold text-green-400">{formatUsdValue(v.debtUsd)}</span>
            </Prov>
          ) : v.pricePending && v.debt > 0 ? (
            <span className="inline-block h-3 w-16 rounded-md bg-rb-200 dark:bg-rb-700 animate-pulse" />
          ) : null,
      },
      {
        id: "collateral-ratio",
        label: ratioLabel("cdp"),
        value:
          v.icr != null ? (
            <span data-figure="collateral-ratio">
              {index ? (
                // The index lane's ratio is an approximation and wears the ≈:
                // the receipt says where the two legs come from, the tooltip
                // what the figure is and is not.
                <Prov info={listingIcrProv(v.market)} value={`≈ ${pct(v.icr)}`}>
                  <RevealTip tip={<span className={TIP_PROSE}>{LISTING_ICR_TIP}</span>}>
                    <span className={belowMin ? "text-red-500" : undefined}>
                      {"≈"}&nbsp;{formatPolarisRatio(v.icr, 1, mcrInForce ?? undefined)}
                    </span>
                  </RevealTip>
                </Prov>
              ) : (
                <Prov info={liveIcrProv(v.market)} value={pct(v.icr)}>
                  <span className={belowMin ? "text-red-500" : undefined}>
                    {formatPolarisRatio(v.icr, 1, mcrInForce ?? undefined)}
                  </span>
                </Prov>
              )}
            </span>
          ) : null,
        pending: v.icr == null && v.pricePending && v.debt > 0,
        sub:
          mcrInForce != null ? (
            <Prov info={liveMcrProv(v.defensiveMode, v.market, index)} value={pct(mcrInForce)}>
              <span>Minimum ratio {pctShort(mcrInForce)}</span>
            </Prov>
          ) : undefined,
      },
    ];
    // The rate the market charges, on a CDP whose debt accrues it.
    const owesRecorded = index ? v.debt > 0 : (v.recordedDebt ?? 0) > 0;
    if (owesRecorded)
      heads.push({
        id: "interest-rate",
        label: "Interest rate",
        labelTip: "The yearly rate the market charges on debt, set by the market and read at this block.",
        value:
          v.interestRate != null ? (
            <Prov info={liveRateProv("combined", v.market, index)}>
              <span>{(v.interestRate * 100).toFixed(2)}%</span>
            </Prov>
          ) : null,
        pending: v.interestRate == null && v.pricePending,
      });
  }

  // A CDP under the minimum ratio carries its warning above the headlines. The
  // testnet is said once, by the pill in the page heading (ProtocolIdentity).
  const notice =
    detail && !ended && v.basis === "chain" && v.icr != null && v.mcr != null && v.icr < v.mcr ? (
      <div className="notice-caution flex items-start gap-2 p-3 mb-3 text-sm text-caution-700 dark:text-caution-400">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          Below the minimum ratio — {(v.icr * 100).toFixed(1)}% against {(v.mcr * 100).toFixed(0)}%; anyone may
          liquidate it
        </p>
      </div>
    ) : undefined;

  const common = { status, heads, identity, notice, counters };
  if (!detail) return { ...common, notice: undefined, surface: "listing", menu: null, outcome };

  const menu: PositionCardMenu = { leading: () => <CdpMenuRows v={v} />, exports: exports ?? null };
  const detailCommon = {
    ...common,
    surface: "detail" as const,
    explainer: {
      body: explanation ?? null,
      defaultOpen: explanationDefaultOpen,
      onToggle: onExplanationToggle,
      viewHref,
    },
    learnMore: polarisPositionModal(v.status),
    menu,
  };
  if (outcome) return { ...detailCommon, outcome };

  // The panel: the CDP's valuation and the market's mode on the left, what
  // the debt costs and what is pending on the right.
  const left: PositionPanelRow[] = [];
  const right: PositionPanelRow[] = [];
  if (v.basis === "chain" && v.equity != null && v.coll > 0) {
    left.push({
      id: "equity",
      label: "Equity at the feed",
      tip: "The collateral at the market's price feed less the debt owed, read at this block; it moves with the feed and can be negative.",
      value: (
        <TokenFigure symbol={stable} address={stableAddress}>
          <Prov info={liveEquityProv(v.market)}>
            <span>
              <CardFigure value={v.equity} symbol={stable} signed />
            </span>
          </Prov>
        </TokenFigure>
      ),
    });
  }
  if (v.mcr != null) {
    if (v.defensiveMode) {
      left.push({
        id: "defensive-mode",
        label: "Defensive mode",
        tip: "The market's reserve is thin against its debt, so the minimum ratio stands at its higher floor until the reserve recovers.",
        value: (
          <Prov info={liveModeProv(v.market, index)}>
            <span>On</span>
          </Prov>
        ),
      });
    }
  }
  const annualCost =
    v.basis === "chain" && v.recordedDebt != null && v.recordedDebt > 0 && v.interestRate != null
      ? v.recordedDebt * v.interestRate
      : null;
  if (annualCost != null) {
    right.push({
      id: "annual-cost",
      label: "Costs per year",
      tip: "A year of interest at today's rate on the debt recorded at the last touch, the base the contract accrues on; the rate moves.",
      value: (
        <TokenFigure symbol={stable} address={stableAddress}>
          <Prov info={polarisAnnualCostProv(v.market)} value={String(annualCost)} symbol={stable}>
            <span>
              ~<CardSumAmount value={annualCost} />
            </span>
          </Prov>
        </TokenFigure>
      ),
    });
  }
  if (v.pendingReward != null && v.pendingReward > 0) {
    right.push({
      id: "pending-reward",
      label: "Reward pending",
      tip: "pETH the CDP has earned from the protocol's fees and not yet settled; it joins the collateral at the next touch.",
      value: (
        <TokenFigure symbol={PETH.symbol} address={PETH.address}>
          <Prov info={livePendingProv("bcTokenGain", v.market)}>
            <span>
              <AmountText value={v.pendingReward} />
            </span>
          </Prov>
        </TokenFigure>
      ),
    });
  }

  return { ...detailCommon, outcome: undefined, panel: [left, right] };
}

/** The Polaris CDP card: its slots, drawn by the shared card. */
export function PolarisPositionCard(props: PolarisPositionCardProps) {
  return <PositionCard slots={polarisCardSlots(props)} />;
}

/** A debt in USD: USDp is a dollar by construction, GOLDp a troy ounce at the
 *  XAU/USD leg of the market's price read. */
function debtInUsd(market: PolarisMarket, debt: number, xauUsd: number | null): number | null {
  if (market === "usdp") return debt;
  return xauUsd != null && xauUsd > 0 ? debt * xauUsd : null;
}

/** Build a card view from the listing summary row (the index).
 *
 *  `markets` is the listing's ONE market-board read for the whole page (the
 *  Liquity V2 pattern: side-fetched once on mount, never per row). Given it,
 *  the row can state a ratio, the floor in force, the price that floor is
 *  reached at, the rate the market charges and the collateral's value — all
 *  on the row's own last emitted figures, so all approximate, and the card
 *  marks the ratio as such. `pending` says the read is still in flight, which
 *  is a pulse rather than a dash. */
export function viewFromSummary(
  s: PolarisPositionSummary,
  markets?: PolarisMarketsChainResponse | null,
  pending = false,
): PolarisPositionView {
  const board = markets && !markets.chainStale ? markets.markets.find((m) => m.market === s.market) : undefined;
  const mcrInForce = board ? (board.defensiveMode ? board.defensiveMcr : board.mcr) : null;
  const priced = board != null && s.coll > 0 && s.debt > 0;
  return {
    market: s.market,
    cdpId: s.cdpId,
    stableSymbol: s.stableSymbol,
    // A timeline-derived summary of a never-transferred, burned CDP has no
    // holder to name — null, never an empty pill.
    owner: s.owner || null,
    status: s.status,
    liquidated: s.liquidated,
    coll: s.coll,
    collRaw: s.collRaw,
    debt: s.debt,
    debtRaw: s.debtRaw,
    collUsd: board && s.coll > 0 ? s.coll * board.price.pethUsd : null,
    debtUsd: board && s.debt > 0 ? debtInUsd(s.market, s.debt, board.price.xauUsd) : null,
    equity: null,
    recordedDebt: null,
    icr: priced && board ? (s.coll * board.price.pethInDebt) / s.debt : null,
    mcr: mcrInForce,
    defensiveMode: board?.defensiveMode ?? false,
    pricePending: pending,
    pendingInterest: null,
    pendingStables: null,
    pendingReward: null,
    pendingPsmDebt: null,
    interestRate: board?.interestRate ?? null,
    peakColl: s.peakColl,
    peakDebt: s.peakDebt,
    lastActivityAt: s.lastTs,
    // The foot strip counts transactions; an index without tx_count gives the
    // CDPUpdated rows.
    eventCount: s.txCount ?? s.eventCount,
    liqCount: s.liqCount,
    transferCount: s.transferCount,
    basis: "index",
    blockNumber: s.lastBlock,
  };
}

/** Build a card view from the live overlay — the detail page's primary
 *  truth. The lifecycle can only say what head state shows: an open CDP, or a
 *  burned one (closed or liquidated — which of the two is an indexed fact and
 *  arrives by merge; alone, the burn reads "closed"). */
export function viewFromChain(c: PolarisChainResponse): PolarisPositionView {
  return {
    market: c.market,
    cdpId: c.cdpId,
    stableSymbol: POLARIS_MARKET_CONFIG[c.market].stable.symbol,
    owner: c.owner,
    status: c.isOpen ? "open" : "closed",
    liquidated: false,
    coll: c.entireColl,
    collRaw: c.entireCollRaw,
    debt: c.entireDebt,
    debtRaw: c.entireDebtRaw,
    collUsd: c.price ? c.entireColl * c.price.pethUsd : null,
    debtUsd: c.price && c.entireDebt > 0 ? debtInUsd(c.market, c.entireDebt, c.price.xauUsd) : null,
    equity: c.price ? c.entireColl * c.price.pethInDebt - Math.max(0, c.entireDebt) : null,
    recordedDebt: c.recordedDebt,
    icr: c.icr,
    mcr: c.defensiveMode ? c.defensiveMcr : c.mcr,
    defensiveMode: c.defensiveMode,
    pricePending: false,
    pendingInterest: c.accruedInterest,
    pendingStables: c.accruedStables,
    pendingReward: c.bcTokenGain,
    pendingPsmDebt: c.mintRedeemDebtChange,
    interestRate: c.interestRate,
    peakColl: 0,
    peakDebt: 0,
    lastActivityAt: c.lastTouchTime > 0 ? c.lastTouchTime : null,
    eventCount: 0,
    liqCount: 0,
    transferCount: 0,
    basis: "chain",
    blockNumber: c.blockNumber,
  };
}

/** Merge the indexed summary into a chain-first view: the chain keeps every
 *  head figure; the index contributes what head state cannot say — which
 *  terminal state a burned CDP reached, the peaks, the counts, the last
 *  holder. Apart from the terminal word, the chain's lifecycle wins. */
export function mergeChainAndSummary(chain: PolarisPositionView, summary: PolarisPositionSummary): PolarisPositionView {
  return {
    ...chain,
    owner: chain.owner ?? (summary.owner || null),
    status: chain.status === "open" ? "open" : summary.status === "liquidated" ? "liquidated" : "closed",
    liquidated: summary.liquidated,
    peakColl: summary.peakColl,
    peakDebt: summary.peakDebt,
    lastActivityAt: summary.lastTs || chain.lastActivityAt,
    eventCount: summary.txCount ?? summary.eventCount,
    liqCount: summary.liqCount,
    transferCount: summary.transferCount,
  };
}
