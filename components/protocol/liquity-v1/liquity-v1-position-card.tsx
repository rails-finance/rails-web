"use client";

// Liquity V1 Trove card — the chain-state analog of the Aave / Spark / Compound
// position cards, through the SAME shared grammar (OpenPositionStats + StatValue) so
// it lines up with the other explorers.
//
// A Liquity V1 position is one Trove per address: a single ETH collateral and a
// single LUSD debt, both emitted as absolutes by TroveUpdated. Every headline value
// is read from the chain — the Trove's latest emitted `_coll` / `_debt`. Liquity V1 is
// interest-free, so the debt is EXACT (not a principal approximation). The detail
// page's risk surfaces (ratio, runway, queue) are live contract reads, not columns here.

import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { StatValue, StatFootnote, StatDash } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { Prov } from "@/components/shared/provenance";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { WalletPill } from "@/components/shared/wallet-pill";
import {
  positionCollateralProv,
  positionDebtProv,
  peakCollateralProv,
  peakDebtProv,
} from "@/lib/liquity-v1/event-provenance";
import { entireCollateralProv, entireDebtProv } from "@/lib/liquity-v1/position-provenance";
import { COLLATERAL_SYMBOL, DEBT_SYMBOL } from "@/lib/liquity-v1/asset-catalog";
import { liquityV1PositionContent, type LiquityV1EndedBy } from "@/lib/liquity-v1/position-content";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { LifecyclePill } from "@/components/shared/position-card-pills";
import type { LiquityV1PositionSummary } from "@/lib/sources/api/liquity-v1-positions";
import type { LiquityV1Surplus } from "@/lib/liquity-v1/use-event-read";
import { CLAIMABLE_WHERE } from "@/lib/shared/liquity-coll-surplus-provenance";
import { surplusClaimableProv, surplusUsdProv } from "@/lib/liquity-v1/event-provenance";
import { formatUsdValue } from "@/lib/utils/format";

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

export function LiquityV1PositionCard({
  v,
  receipts = false,
  rowExtra,
  explanation,
  live = false,
  viewHref,
  surplus,
  priceUsd,
  endedBy,
}: {
  v: LiquityV1PositionView;
  receipts?: boolean;
  /** Context content riding the shell's heading-button row (the detail page
   *  passes the compact liquidation runway). */
  rowExtra?: React.ReactNode;
  /** The card's Explanation section (the V4/trove "About this position" home) —
   *  narration bullets + the risk strips describing the Trove NOW. */
  explanation?: React.ReactNode;
  /** True when v.collateral / v.debt carry the LIVE chain read
   *  (getEntireDebtAndColl — the detail page merges it in once it lands, the
   *  0006 carve-out): the face receipts then state the chain basis rather
   *  than the captured index's last emitted absolute. Listing cards stay on
   *  the index and keep the default. */
  live?: boolean;
  /** Copy-this-view control, forwarded straight through to `PositionCardShell` —
   *  the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** A closed life's ETH left in the CollSurplusPool (a full redemption, or a
   *  capped Recovery Mode liquidation), read at the head. Unclaimed, it leads
   *  the card, as on Liquity V2. */
  surplus?: LiquityV1Surplus | null;
  /** The PriceFeed price now, to value the claimable ETH. */
  priceUsd?: number | null;
  /** How a closed life ended, from its final event: the owner closed it, or a
   *  redemption cancelled the last of its debt. Unset reads as an owner close. */
  endedBy?: LiquityV1EndedBy | null;
}) {
  // The protocol name is redundant inside the Liquity V1 explorer, so the
  // wallet pill leads (facehash + copy + bookmark — buttons, not anchors, so
  // it lives safely inside the listing card's <Link>).
  const walletId = (
    <WalletPill wallet={v.wallet} ensName={null} filterProtocol="liquity-v1" bookmarkProtocol="liquity-v1" />
  );
  // Right-hand activity-meta cluster: time-ago, transaction count, the pink
  // redemption triangle (Liquity-family), and liquidation.
  const meta = (
    <PositionCardMeta
      lastActivityAt={v.lastActivityAt}
      eventCount={v.txCount}
      liquidationCount={v.liquidationCount}
      redemptionCount={v.redemptionCount}
    />
  );

  // Closed / liquidated: the Trove now reads 0, so the headline is what it held at
  // its height — highest recorded collateral + debt (chain-state MAX over its life).
  // The explanation threads through (the detail page passes the past-tense
  // closed-epoch narration); rowExtra deliberately does not — the compact live
  // strips describe the chain NOW and never ride a past life's card.
  if (v.status === "closed" || v.status === "liquidated") {
    const claimable = surplus && surplus.claimable > 1e-9 ? surplus : null;
    const claimableUsd = claimable && priceUsd != null && priceUsd > 0 ? claimable.claimable * priceUsd : null;
    return (
      <PositionCardShell
        receipts={receipts}
        explanation={explanation}
        viewHref={viewHref}
        learnMore={liquityV1PositionContent({ status: v.status, endedBy })}
      >
        <ClosedPositionStats
          outcome={v.status}
          outcomeLabel={v.status === "closed" && endedBy === "redemption" ? "Fully redeemed" : undefined}
          leadingIdentity={walletId}
          identity={meta}
          closedAt={v.lastActivityAt}
          collateralLabel={claimable ? "Claimable collateral" : undefined}
          outcomeFollows={!!claimable}
          collateralFootnote={
            claimable ? (
              <>
                {claimableUsd != null && (
                  <div className="text-xs mt-0.5 min-h-[1rem]">
                    <span className="inline-flex items-center font-bold text-green-400 border-l-2 border-r-2 border-green-400 rounded-sm px-1 py-0">
                      <Prov info={surplusUsdProv(claimable.claimable, priceUsd as number)}>
                        {formatUsdValue(claimableUsd)}
                      </Prov>
                    </span>
                  </div>
                )}
                <div className="text-xs text-rb-500 mt-0.5">{CLAIMABLE_WHERE}</div>
              </>
            ) : undefined
          }
          collateral={
            claimable ? (
              <StatValue>
                <Prov info={surplusClaimableProv(claimable)}>
                  <AssetAmount value={claimable.claimable} symbol={COLLATERAL_SYMBOL} />
                </Prov>
              </StatValue>
            ) : v.peakCollateral > 0 ? (
              <StatValue>
                <Prov info={peakCollateralProv()}>
                  <AssetAmount value={v.peakCollateral} symbol={COLLATERAL_SYMBOL} />
                </Prov>
              </StatValue>
            ) : (
              <StatDash />
            )
          }
          debt={
            claimable ? undefined : v.peakDebt > 0 ? (
              <StatValue>
                <Prov info={peakDebtProv()}>
                  <AssetAmount value={v.peakDebt} symbol={DEBT_SYMBOL} />
                </Prov>
              </StatValue>
            ) : (
              <StatDash />
            )
          }
        />
      </PositionCardShell>
    );
  }

  return (
    <PositionCardShell
      receipts={receipts}
      rowExtra={rowExtra}
      explanation={explanation}
      viewHref={viewHref}
      learnMore={liquityV1PositionContent({ status: v.status })}
    >
      <OpenPositionStats
        // Detail render (receipts): the V4 spoke-card header grammar — a
        // neutral mode-word pill (an open Trove always carries debt). The
        // LISTING render keeps the lifecycle pill; the wallet pill renders on
        // both surfaces.
        statusPill={
          receipts ? (
            <span className="font-bold px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
              Borrowing
            </span>
          ) : (
            <LifecyclePill status={v.status} />
          )
        }
        leadingIdentity={walletId}
        identity={meta}
        columns={[
          {
            label: CARD_VOCAB.collateral,
            value:
              v.collateral > 0 ? (
                <StatValue>
                  <Prov info={live ? entireCollateralProv(v.atBlock) : positionCollateralProv(v.atBlock)}>
                    <AssetAmount value={v.collateral} symbol={COLLATERAL_SYMBOL} />
                  </Prov>
                </StatValue>
              ) : (
                <StatDash />
              ),
          },
          {
            label: CARD_VOCAB.debt,
            value:
              v.debt > 0 ? (
                <StatValue>
                  <Prov info={live ? entireDebtProv(v.atBlock) : positionDebtProv(v.atBlock)}>
                    <AssetAmount value={v.debt} symbol={DEBT_SYMBOL} />
                  </Prov>
                </StatValue>
              ) : (
                <StatDash />
              ),
            footnote: v.debt > 0 ? <StatFootnote>interest-free · exact</StatFootnote> : undefined,
          },
        ]}
      />
    </PositionCardShell>
  );
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
