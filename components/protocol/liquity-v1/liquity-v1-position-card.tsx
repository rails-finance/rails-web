"use client";

// Liquity V1 Trove card: a slot builder for the shared position card
// (components/shared/position-card.tsx, rails-ops TO-DO-position-card 322).
// The Trove's slots go to the shared `PositionCard`, which draws the frame,
// the tag, the ⋮, the headlines, the panel, the (i) and the counters.
//
// A Liquity V1 position is one Trove per address: a single ETH collateral and a
// single LUSD debt, both emitted as absolutes by TroveUpdated. Every headline value
// is read from the chain: the Trove's latest emitted `_coll` / `_debt`, or on the
// detail page the live getEntireDebtAndColl once it lands. Liquity V1 is
// interest-free, so the debt is exact. The collateral ratio, the queue, the
// liquidation price and the room to borrow are live contract reads from the
// detail page (`chain`); a listing card has two headlines.

import { useState, type ReactNode } from "react";
import { Link2 } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import {
  PositionCard,
  type PositionCardExports,
  type PositionCardHead,
  type PositionCardOutcome,
  type PositionCardSlots,
  type PositionCardStatus,
} from "@/components/shared/position-card";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { AssetPopover } from "@/components/shared/asset-popover";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { Prov } from "@/components/shared/provenance";
import { WalletPill } from "@/components/shared/wallet-pill";
import {
  positionCollateralProv,
  positionDebtProv,
  peakCollateralProv,
  peakDebtProv,
} from "@/lib/liquity-v1/event-provenance";
import {
  entireCollateralProv,
  entireDebtProv,
  collateralUsdProv,
  debtUsdProv,
} from "@/lib/liquity-v1/position-provenance";
import { COLLATERAL_SYMBOL, DEBT_SYMBOL } from "@/lib/liquity-v1/asset-catalog";
import { liquityV1PositionModal, type LiquityV1EndedBy } from "@/lib/liquity-v1/event-templates";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import type { LiquityV1PositionSummary } from "@/lib/sources/api/liquity-v1-positions";
import type { LiquityV1Surplus } from "@/lib/liquity-v1/use-event-read";
import type { LiquityV1PositionChainResponse } from "@/lib/api/fetch-liquity-v1-position";
import { CLAIMABLE_BY_OWNER, CLAIMABLE_WHERE } from "@/lib/shared/liquity-coll-surplus-provenance";
import { surplusClaimableProv, surplusUsdProv } from "@/lib/liquity-v1/event-provenance";
import { formatUsdValue } from "@/lib/utils/format";
import { fmtEth, fmtLusd } from "@/lib/liquity-v1/event-figures";
import {
  LiquityV1RiskHeadline,
  liquityV1HasRisk,
  liquityV1Panel,
  liquityV1RecoveryNotice,
} from "@/components/protocol/liquity-v1/liquity-v1-risk-slot";
import { formatCompact } from "@/lib/shared/format-compact";

export interface LiquityV1PositionView {
  wallet: string;
  /** Trove-lifecycle index — which life of a reopened Trove this view shows. */
  epoch?: number;
  status: "open" | "closed" | "liquidated";
  /** ETH collateral (display units). */
  collateral: number;
  /** LUSD debt (display units). */
  debt: number;
  /** Highest recorded ETH collateral / LUSD debt over this life (display units). */
  peakCollateral: number;
  peakDebt: number;
  liquidationCount: number;
  redemptionCount: number;
  /** Non-liquidation transaction count (activity-meta). */
  txCount: number;
  /** Unix seconds of the most recent event (activity-meta). */
  lastActivityAt: number;
  atBlock?: number;
}

/** The figure with its exact value behind it: the compact number the card
 *  states, and `data-prov-exact` for the receipt's full-precision anchor. */
function Figure({ value, symbol, exact }: { value: number; symbol: string; exact: string }) {
  return (
    <>
      <span data-prov-exact={exact} data-prov-symbol={symbol}>
        {formatCompact(value)}
      </span>
      <span className="sr-only" data-prov-hidden="">
        {exact} {symbol}
      </span>
    </>
  );
}

const assetIcon = (symbol: string, exact: string, price?: string, priceSource?: string) => (
  <AssetPopover symbol={symbol} figure={`${exact} ${symbol}`} price={price} priceSource={priceSource}>
    <TokenChipIcon symbol={symbol} size={28} filterable={false} untitled />
  </AssetPopover>
);

/** The ⋮'s link to this Trove's page. */
function TroveLinkRow({ pagePath }: { pagePath: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <ToolsMenuItem
      icon={copied ? <Icon name="check" size={16} /> : <Link2 size={16} className="-rotate-45" />}
      title="Link to this Trove"
      subtitle={copied ? "Copied" : "Copy the page's address"}
      onClick={() => {
        void navigator.clipboard.writeText(`${window.location.origin}${pagePath}`).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    />
  );
}

export interface LiquityV1PositionCardProps {
  v: LiquityV1PositionView;
  /** `detail` on the Trove page (receipts, panel, (i), ⋮); `listing` in a row. */
  surface: "detail" | "listing";
  /** True when v.collateral / v.debt carry the LIVE chain read
   *  (getEntireDebtAndColl, the detail page merges it in once it lands, the
   *  0006 carve-out): the face receipts then state the chain basis rather
   *  than the captured index's last emitted absolute. */
  live?: boolean;
  /** The detail page's live contract read, for the open Trove: the collateral
   *  ratio, the panel and Recovery Mode. */
  chain?: LiquityV1PositionChainResponse | null;
  /** The chain read is still out: the collateral ratio waits. */
  riskPending?: boolean;
  /** The card's Explanation section: narration bullets describing the Trove now. */
  explanation?: ReactNode;
  /** The pane's copy-this-view link: the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** A closed life's ETH left in the CollSurplusPool (a full redemption, or a
   *  capped Recovery Mode liquidation), read at the head. Unclaimed, it takes a
   *  line under Outcome. */
  surplus?: LiquityV1Surplus | null;
  /** The PriceFeed price now, to value the claimable ETH. */
  priceUsd?: number | null;
  /** How a closed life ended, from its final event: the owner closed it, or a
   *  redemption cancelled the last of its debt. Unset reads as an owner close. */
  endedBy?: LiquityV1EndedBy | null;
  /** The ⋮'s export shapes. */
  exports?: PositionCardExports | null;
}

/** The Liquity V1 Trove's slots for the shared position card. */
export function liquityV1CardSlots({
  v,
  surface,
  live = false,
  chain,
  riskPending = false,
  explanation,
  viewHref,
  surplus,
  priceUsd,
  endedBy,
  exports,
}: LiquityV1PositionCardProps): PositionCardSlots {
  const detail = surface === "detail";
  const ended = v.status === "closed" || v.status === "liquidated";
  const redeemed = v.status === "closed" && endedBy === "redemption";
  const status: PositionCardStatus | null =
    v.status === "liquidated"
      ? { word: "Liquidated", tone: "danger" }
      : redeemed
        ? { word: "Redeemed", tone: "caution" }
        : v.status === "closed"
          ? { word: "Closed", tone: "muted" }
          : null;

  // The listing names the owner: the wallet pill (facehash, copy, bookmark;
  // all buttons, so it sits inside the row's <Link>). The detail page
  // draws it on the wallet row above the card (ui-jobs 228).
  const identity = detail ? undefined : (
    <WalletPill wallet={v.wallet} ensName={null} filterProtocol="liquity-v1" bookmarkProtocol="liquity-v1" />
  );
  const counters = {
    lastActivityAt: v.lastActivityAt,
    eventCount: v.txCount,
    liquidationCount: v.liquidationCount,
    redemptionCount: v.redemptionCount,
    ...(detail ? { order: "age-last" as const } : {}),
  };

  let heads: PositionCardHead[];
  let outcome: PositionCardOutcome | undefined;
  if (ended) {
    // The Trove now reads 0, so the heads are what it held at its height: the
    // highest recorded collateral and debt (chain-state MAX over its life).
    heads = [
      {
        id: "peak-collateral",
        label: CARD_VOCAB.peakCollateral,
        labelIcon: assetIcon(COLLATERAL_SYMBOL, fmtEth(v.peakCollateral)),
        value:
          v.peakCollateral > 0 ? (
            <Prov info={peakCollateralProv()}>
              <span className="text-rb-500">
                <Figure value={v.peakCollateral} symbol={COLLATERAL_SYMBOL} exact={fmtEth(v.peakCollateral)} />
              </span>
            </Prov>
          ) : null,
      },
      {
        id: "peak-debt",
        label: CARD_VOCAB.peakDebt,
        labelIcon: assetIcon(DEBT_SYMBOL, fmtLusd(v.peakDebt)),
        value:
          v.peakDebt > 0 ? (
            <Prov info={peakDebtProv()}>
              <span className="text-rb-500">
                <Figure value={v.peakDebt} symbol={DEBT_SYMBOL} exact={fmtLusd(v.peakDebt)} />
              </span>
            </Prov>
          ) : null,
      },
    ];
    // Unclaimed ETH takes a line under Outcome while there is something to
    // claim; once claimed it goes, and the claim stays on the timeline.
    const claimable = surplus && surplus.claimable > 1e-9 ? surplus : null;
    const claimableUsd = claimable && priceUsd != null && priceUsd > 0 ? claimable.claimable * priceUsd : null;
    outcome = {
      word: redeemed ? "Fully redeemed" : v.status === "liquidated" ? "Liquidated" : "Closed",
      dates: v.lastActivityAt ? [{ at: v.lastActivityAt }] : undefined,
      footnote: claimable ? (
        <div className="text-xs mt-0.5 text-rb-500">
          <Prov info={surplusClaimableProv(claimable)}>
            <span className="font-semibold text-foreground/80 tabular-nums">{fmtEth(claimable.claimable)}</span>
          </Prov>{" "}
          {COLLATERAL_SYMBOL}
          {claimableUsd != null && (
            <>
              {" "}
              (
              <Prov info={surplusUsdProv(claimable.claimable, priceUsd as number)}>{formatUsdValue(claimableUsd)}</Prov>
              )
            </>
          )}{" "}
          {CLAIMABLE_BY_OWNER}
          <div>{CLAIMABLE_WHERE}</div>
        </div>
      ) : undefined,
    };
  } else {
    const collPrice = detail && live && priceUsd != null && priceUsd > 0 ? priceUsd : null;
    heads = [
      {
        id: "collateral",
        label: CARD_VOCAB.collateral,
        value:
          v.collateral > 0 ? (
            <Prov info={live ? entireCollateralProv(v.atBlock) : positionCollateralProv(v.atBlock)}>
              <Figure value={v.collateral} symbol={COLLATERAL_SYMBOL} exact={fmtEth(v.collateral)} />
            </Prov>
          ) : null,
        assets:
          v.collateral > 0
            ? assetIcon(
                COLLATERAL_SYMBOL,
                fmtEth(v.collateral),
                collPrice != null ? formatUsdValue(collPrice) : undefined,
                collPrice != null ? "The protocol's PriceFeed" : undefined,
              )
            : undefined,
        usd:
          collPrice != null && v.collateral > 0 ? (
            <Prov info={collateralUsdProv(v.collateral, collPrice)}>
              <span className="font-bold text-green-400">{formatUsdValue(v.collateral * collPrice)}</span>
            </Prov>
          ) : null,
      },
      {
        id: "debt",
        label: CARD_VOCAB.debt,
        value:
          v.debt > 0 ? (
            <Prov info={live ? entireDebtProv(v.atBlock) : positionDebtProv(v.atBlock)}>
              <Figure value={v.debt} symbol={DEBT_SYMBOL} exact={fmtLusd(v.debt)} />
            </Prov>
          ) : null,
        assets: v.debt > 0 ? assetIcon(DEBT_SYMBOL, fmtLusd(v.debt)) : undefined,
        usd:
          v.debt > 0 ? (
            <Prov info={debtUsdProv(v.debt)}>
              <span className="font-bold text-green-400">{formatUsdValue(v.debt)}</span>
            </Prov>
          ) : null,
        sub: v.debt > 0 ? "interest-free" : undefined,
      },
    ];
    // The collateral ratio rides the detail page's live read; the listing
    // carries none, so a listing card has two headlines.
    if (detail) {
      const risk = chain && liquityV1HasRisk(chain) ? chain : null;
      heads.push({
        id: "collateral-ratio",
        label: ratioLabel("cdp"),
        value: risk ? <LiquityV1RiskHeadline chain={risk} /> : null,
        pending: !risk && riskPending,
      });
    }
  }

  const common = { status, heads, identity, counters, outcome };
  if (!detail) return { ...common, surface: "listing", menu: null };

  const pagePath = `/ethereum/liquity-v1/${v.wallet}${v.epoch != null ? `?epoch=${v.epoch}` : ""}`;
  const detailCommon = {
    ...common,
    surface: "detail" as const,
    explainer: { body: explanation ?? null, viewHref },
    learnMore: liquityV1PositionModal(v.status, endedBy),
    menu: {
      leading: () => <TroveLinkRow pagePath={pagePath} />,
      exports,
    },
  };
  if (outcome) return { ...detailCommon, outcome };

  const risk = chain && liquityV1HasRisk(chain) ? chain : null;
  return {
    ...detailCommon,
    outcome: undefined,
    notice: risk ? (liquityV1RecoveryNotice(risk) ?? undefined) : undefined,
    panel: risk ? liquityV1Panel(risk) : [[], []],
  };
}

/** The Liquity V1 Trove card: its slots, drawn by the shared card. */
export function LiquityV1PositionCard(props: LiquityV1PositionCardProps) {
  return <PositionCard slots={liquityV1CardSlots(props)} />;
}

/** Build a card view from the listing summary row. */
export function viewFromSummary(s: LiquityV1PositionSummary): LiquityV1PositionView {
  return {
    wallet: s.wallet,
    epoch: s.epoch,
    status: s.status,
    collateral: s.collateral,
    debt: s.debt,
    peakCollateral: s.peakCollateral,
    peakDebt: s.peakDebt,
    liquidationCount: s.liquidationCount,
    redemptionCount: s.redemptionCount,
    txCount: s.txCount,
    lastActivityAt: s.lastActivityAt,
  };
}
