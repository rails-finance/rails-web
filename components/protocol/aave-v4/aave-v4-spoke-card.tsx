"use client";

// Aave V4 spoke selector card. This surface only ships aave-v4 (no shared
// aave-v3 / spark code path), so the import paths point at the v4-namespaced
// versions of constants / spoke-meta.

import { CardSelectorShell, positionCardSurface } from "@/components/shared/card-selector-shell";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { StatValue, StatDash } from "@/components/shared/stat-value";
import { type HubTier, HUB_TIER_LABEL } from "@/components/protocol/aave-v4/aave-v4-spoke-constants";
import { type AaveSpokeCardInfo, liquidationBuffer } from "@/lib/aave-v4/spoke-cards";
import { AaveV4LiquidationFootnote } from "@/components/protocol/aave-v4/aave-v4-liquidation-footnote";
import { bucketForHealth } from "@/lib/aave-v4/health-bucket";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { WalletPill } from "@/components/shared/wallet-pill";
import { fmtUsd, hfLabel, hfColorClass } from "@/lib/aave-v4/format";
import {
  AaveV4PositionExplanation,
  AaveV4ClosedExplanation,
} from "@/components/protocol/aave-v4/aave-v4-position-explanation";
import type { ExternalActorSummary } from "@/lib/shared/external-actor";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { usdProv, usdProvOnchain, accumProv, healthFactorProv, interestProv } from "@/lib/aave-v4/position-provenance";
import { listSymbols, NO_PRICE_HINT, PARTIAL_LABEL_SUFFIX, partialSumProv } from "@/lib/aave-v4/unpriced";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";

// The borrow-rate / peak / interest figures are accumulated over this spoke's
// indexed event stream.
const borrowRateProv = () =>
  accumProv("The latest borrow rate recorded on this spoke", { formula: "most recent on-chain borrow index → APR" });
const supplyInterestProv = () => interestProv("Accrued supply interest");
const borrowInterestProv = () => interestProv("Accrued borrow interest");
const peakCollProv = () =>
  accumProv("The peak collateral this position has held", {
    formula: "max(Σ collateral × price)",
    inputs: [
      {
        label: "collateral",
        kind: "chain",
        pclass: "indexed",
        note: "the position's balance at each event, from the indexed stream",
      },
      {
        label: "price",
        kind: "offchain",
        note: "each event at the price stored for its block — what Aave's oracle answered there, so the figure stays at the value of the day",
      },
    ],
  });
const peakDebtProv = () =>
  accumProv("The peak debt this position has carried", {
    formula: "max(Σ debt × price)",
    inputs: [
      {
        label: "debt",
        kind: "chain",
        pclass: "indexed",
        note: "the position's balance at each event, from the indexed stream",
      },
      {
        label: "price",
        kind: "offchain",
        note: "each event at the price stored for its block — what Aave's oracle answered there, so the figure stays at the value of the day",
      },
    ],
  });
const COLL_USD_PROV = usdProv("Current collateral", { amountLabel: "collateral balance", amountKind: "chain" });
const DEBT_USD_PROV = usdProv("Current debt", { amountLabel: "debt balance", amountKind: "chain" });
const SUPPLY_USD_PROV = usdProv("Currently supplied", { amountLabel: "supply balance", amountKind: "chain" });
const NONCOLL_USD_PROV = usdProv("Supplied, not collateral", { amountLabel: "supply balance", amountKind: "chain" });

/**
 * A headline USD stat (collateral / debt / supplied) that tells the truth in
 * both views. In the default (derived) view it shows the DefiLlama figure tagged
 * `usdProv` (off-chain price → middots under On-chain-values). When On-chain-values
 * is active AND an on-chain-oracle total is available (every contributing asset
 * is oracle-priced), it shows THAT value tagged `usdProvOnchain` (chain-derived
 * → survives the gate). If the on-chain total is unavailable — no chain balances,
 * no oracle price, or a partial (some asset unpriced) — it keeps the DefiLlama
 * figure, which middots under the gate; an incomplete on-chain number is never
 * asserted. That fallback figure is itself partial where an asset has no price
 * source at all: it is marked so, and `UnpricedFootnote` names what is missing.
 */
function HeadlineUsd({
  defillamaUsd,
  onchainUsd,
  derivedProv,
  onchainLabel,
  unpricedSymbols,
  color,
}: {
  defillamaUsd: number;
  onchainUsd: number | null | undefined;
  derivedProv: Provenance;
  onchainLabel: string;
  /** Assets held here that no price source covers. Only bears on the fallback
   *  figure — the on-chain total is null unless every contributing asset is
   *  oracle-priced, so when it shows there is nothing left out. */
  unpricedSymbols: string[];
  color: string;
}) {
  // Oracle-default: show the on-chain-oracle total whenever it's available
  // (every contributing asset oracle-priced), tagged chain-derived — matching
  // the listing, which prices from the same oracle at the backend. Fall back to
  // the DefiLlama figure only when the oracle total is partial/unavailable.
  // (Previously this was gated behind On-chain-values mode; now it's the default
  // so listing and detail agree — both chain-true by default.)
  const useOnchain = onchainUsd != null;
  const v = fmtUsd(useOnchain ? onchainUsd : defillamaUsd);
  // RULE: Rails never invents a price (lib/aave-v4/unpriced.ts). The fallback
  // figure sums only the assets a price covers, so when one is missing the
  // number is marked partial and the receipt names it.
  const excluded = useOnchain ? [] : unpricedSymbols;
  const info: Provenance = useOnchain
    ? usdProvOnchain(onchainLabel)
    : partialSumProv(derivedProv, onchainLabel, excluded);
  return (
    <StatValue color={color} title={excluded.length > 0 ? `${v.title}${PARTIAL_LABEL_SUFFIX}` : v.title}>
      <Prov info={info}>{v.display}</Prov>
    </StatValue>
  );
}

/** "excl. XAUt · no price source" — the assets a headline total could not
 *  include, in the card's own footnote grammar. Renders only when the shown
 *  figure is the fallback one, since the on-chain total is whole or absent. */
function UnpricedFootnote({ spoke, onchainUsd }: { spoke: AaveSpokeCardInfo; onchainUsd: number | null | undefined }) {
  if (onchainUsd != null || spoke.unpricedSymbols.length === 0) return null;
  const names = listSymbols(spoke.unpricedSymbols);
  return (
    <div className="text-xs mt-0.5 text-rb-500" title={`${names} is held here but no source prices it`}>
      excl. {names} · {NO_PRICE_HINT}
    </div>
  );
}

export type { AaveSpokeCardInfo };

function SpokeIdentity({ name, hub }: { name: string; hub: HubTier }) {
  return (
    <span className="flex items-center gap-1.5 leading-none text-foreground">
      <span className="text-xs font-semibold">{name}</span>
      <span className="text-xs font-bold uppercase tracking-wide">{HUB_TIER_LABEL[hub]}</span>
    </span>
  );
}

/** Supply-side interest earned, shown under the Collateral / Supplied stat.
 *  Deliberately the supply leg ONLY — it never merges in borrow-interest paid, so
 *  the collateral footnote can't show a debt-driven negative. Earned supply
 *  interest is already part of the collateral balance shown above (it grew it),
 *  so it reads as an "incl." figure with no sign rather than a separate signed
 *  gain — parallel to the debt side. Hidden when it rounds below a cent — dust
 *  isn't worth a line. Renders nothing without the chain overlay. */
function SupplyInterestFootnote({ spoke }: { spoke: AaveSpokeCardInfo }) {
  const pnl = spoke.interestPnl;
  if (!pnl || !pnl.hasData) return null;
  const earnedUsd = pnl.assets.reduce((sum, a) => sum + a.supplyInterestUsd, 0);
  if (earnedUsd < 0.01) return null;
  const v = fmtUsd(earnedUsd);
  return (
    <div
      className="text-xs mt-0.5 font-medium text-rb-500"
      title={`${v.title} of the collateral is accrued supply interest to date — from on-chain balances vs. indexed deposits`}
    >
      incl. <Prov info={supplyInterestProv()}>{v.display}</Prov> interest
    </div>
  );
}

/** Debt-stat footnote: the latest borrow rate plus, when non-dust, the accrued
 *  borrow interest. Accrued interest GREW the debt — it's already part of the
 *  debt balance shown above — so it reads as "incl. $X interest" with no sign. A
 *  leading minus here would misread as the debt being reduced (it isn't); the
 *  cost stays under Debt because that's the balance it accrued into. */
function DebtFootnote({ spoke }: { spoke: AaveSpokeCardInfo }) {
  const rate = spoke.latestBorrowRate;
  const pnl = spoke.interestPnl;
  const paidUsd = pnl?.hasData ? pnl.assets.reduce((sum, a) => sum + a.borrowInterestUsd, 0) : 0;
  const interest = paidUsd >= 0.01 ? fmtUsd(paidUsd) : null;
  if (rate === null && !interest) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500 space-y-0.5">
      {rate !== null && (
        <div>
          <Prov info={borrowRateProv()}>{rate.toFixed(2)}%</Prov> borrow rate
        </div>
      )}
      {interest && (
        <div
          title={`${interest.title} of the debt is accrued borrow interest to date — from on-chain balances vs. indexed deposits`}
        >
          incl. <Prov info={borrowInterestProv()}>{interest.display}</Prov> interest
        </div>
      )}
    </div>
  );
}

/** "+ $X supplied · not collateral" — the market value of supplies NOT enabled as
 *  collateral (they can't be seized and don't move HF), shown under the Collateral
 *  stat. Truthful in both views like HeadlineUsd: the DefiLlama figure tagged
 *  off-chain (middots under On-chain-values) unless the on-chain-oracle
 *  non-collateral total is available — supply − collateral, and only when BOTH are
 *  strictly priced — which shows chain-derived. Never renders a bare, untagged price. */
function NonCollateralFootnote({ spoke }: { spoke: AaveSpokeCardInfo }) {
  const defillamaUsd = spoke.supplyBreakdown.nonCollateralUsd;
  if (defillamaUsd <= 0) return null;
  // supply − collateral, both null-guarded: a non-collateral supply is always part
  // of `supply`, so a single unpriced supplied reserve collapses the on-chain figure
  // to null and we fall back to the middotting DefiLlama tag rather than assert a
  // partial total (the same strict-completeness rule HeadlineUsd / computeOnchainUsd use).
  const onc = spoke.onchainUsd;
  const onchainNonColl: number | null =
    onc && onc.supply != null && onc.collateral != null ? onc.supply - onc.collateral : null;
  const useOnchain = onchainNonColl != null;
  const v = fmtUsd(useOnchain ? onchainNonColl : defillamaUsd);
  const info: Provenance = useOnchain ? usdProvOnchain("Supplied, not collateral") : NONCOLL_USD_PROV;
  return (
    <div className="text-xs mt-0.5 text-rb-500" title={v.title}>
      + <Prov info={info}>{v.display}</Prov> supplied · not collateral
    </div>
  );
}

function AaveV4SpokeCard({
  spoke,
  isSelected,
  noHover,
  staticCard,
  onClick,
  wallet,
  ensName,
  rowExtra,
  externalActivity,
}: {
  spoke: AaveSpokeCardInfo;
  isSelected: boolean;
  noHover?: boolean;
  staticCard?: boolean;
  onClick: () => void;
  /** When set, a wallet pill (facehash + addr/ENS + copy) renders alongside
   *  the spoke identity. The detail page passes this; multi-spoke selectors
   *  inside a wallet-scoped view omit it (the page header already names the
   *  wallet). */
  wallet?: string;
  ensName?: string | null;
  /** Inline context riding the info area's heading-button row (the V2 trove
   *  treatment — the detail page passes the risk slot: the collateral-exposure
   *  cluster + compact liquidation runway, right-aligned after the buttons).
   *  Only renders where the info area does. */
  rowExtra?: React.ReactNode;
  /** Who executed this spoke position's events, reduced over the page's
   *  spoke-scoped history — feeds the explanation's operator bullet. Only the
   *  detail page has an event stream to reduce, so it is the only caller that
   *  passes this. */
  externalActivity?: ExternalActorSummary;
}) {
  const { isClosed } = spoke;
  // The info area renders by placement: the static detail card, or a
  // non-selected card in a hoverless selector. Open positions carry the
  // expandable explanation; closed positions have none, and their figures are
  // traced through the page-level inspector like every other card's.
  const showInfo = (noHover && !isSelected) || !!staticCard;
  // Supply-only collapses the card to a single "Supplied" stat (hiding the
  // Debt / HF columns). Which question decides it depends on the card's mode:
  //   - Closed card = history view: peak debt is the headline, so supply-only
  //     means the position NEVER carried real debt (peakDebt < $1).
  //   - Open card = live view: ANY live debt counts as borrowing — there is no
  //     dust floor here. A sub-dollar leftover borrow still shows its Debt + HF
  //     columns, so the headline agrees with the "Borrowing" pill and the
  //     liquidation runway beneath it (both key off debt > 0). An earlier `< $1`
  //     collapse made those three disagree: a ~$0.57 loan read as a lone
  //     "Supplied" up top while the pill + runway called it an active loan.
  const supplyOnly = isClosed ? spoke.peakDebtUsd < 1 : spoke.totalDebtUsd <= 0;
  const bucket = bucketForHealth(spoke.healthFactor);
  const walletPill = wallet ? (
    <WalletPill wallet={wallet} ensName={ensName ?? null} filterProtocol="aave-v4" bookmarkProtocol="aave-v4" />
  ) : null;

  // Collateral USD lags when the supply asset's price is still resolving:
  // stablecoin debt prices in instantly via the categorical-price fallback, but
  // WETH / LST collateral comes from the async price provider. Rather than flash
  // a misleading "< $0.01" and then jolt to the real number, hold a skeleton
  // until the price lands. A real collateralized position is never worth
  // sub-cent, and core/plus collateral is always priceable, so
  // sub-cent-with-supplies reliably means "price still loading". The skeleton
  // sits inside a StatValue so its line-box matches the real value exactly —
  // the swap is a fade, not a reflow.
  const supplyUsdPending = spoke.supplyingSymbols.length > 0 && spoke.totalSupplyUsd < 0.01;
  const supplyValueSkeleton = (
    <StatValue color="text-foreground/80">
      <span
        className="inline-block h-[0.7em] w-20 rounded-md bg-skeleton animate-pulse align-middle"
        aria-hidden="true"
      />
    </StatValue>
  );
  return (
    <div
      onClick={onClick}
      className={`w-full text-left rounded-lg transition-all ${staticCard ? "cursor-default" : "cursor-pointer"} ${positionCardSurface(isClosed ? "closed" : "open", { noHover, staticCard, isSelected })}`}
    >
      <div className="px-5 py-4">
        {isClosed ? (
          <ClosedPositionStats
            // The ending, not the scar: a life partially liquidated and later
            // wound down by the owner is "closed" (its scar rides the meta
            // triangle below). Only a life whose FINAL event is the seizure
            // wears "liquidated" — the same terminal-event rule the backend's
            // status column (migration 057) and the listing card apply.
            outcome={spoke.endedByLiquidation ? "liquidated" : "closed"}
            identity={<PositionCardMeta eventCount={spoke.txCount} liquidationCount={spoke.liquidationCount} />}
            collateralAssetIcons={
              spoke.supplyingSymbols.length > 0 ? <InlineAssetCluster symbols={spoke.supplyingSymbols} /> : undefined
            }
            debtAssetIcons={
              !supplyOnly && spoke.borrowingSymbols.length > 0 ? (
                <InlineAssetCluster symbols={spoke.borrowingSymbols} />
              ) : undefined
            }
            leadingIdentity={
              <>
                {walletPill}
                <SpokeIdentity name={spoke.name} hub={spoke.hub} />
              </>
            }
            collateralLabel={supplyOnly ? CARD_VOCAB.peakSupply : CARD_VOCAB.peakCollateral}
            collateral={(() => {
              const v = fmtUsd(spoke.peakSupplyUsd);
              return (
                <StatValue color="text-rb-500" title={v.title}>
                  <Prov info={peakCollProv()}>{v.display}</Prov>
                </StatValue>
              );
            })()}
            debt={
              supplyOnly
                ? undefined
                : (() => {
                    const v = fmtUsd(spoke.peakDebtUsd);
                    return (
                      <StatValue color="text-rb-500" title={v.title}>
                        <Prov info={peakDebtProv()}>{v.display}</Prov>
                      </StatValue>
                    );
                  })()
            }
          />
        ) : (
          <OpenPositionStats
            statusPill={
              <span className={`font-bold px-2 py-0.5 rounded-sm text-xs ${bucket.pillClass}`}>{bucket.pillLabel}</span>
            }
            leadingIdentity={
              <>
                {walletPill}
                <SpokeIdentity name={spoke.name} hub={spoke.hub} />
              </>
            }
            identity={
              // Activity-meta cluster (top-right, shared across every protocol's
              // position cards): the owner transaction count, then the red
              // liquidation triangle when present. No time-ago on the detail card —
              // the page is already scoped to one wallet. txCount counts distinct
              // non-liquidation transactions, so it isn't inflated by the
              // supply+enable merge and doesn't double-count the triangle beside it.
              <PositionCardMeta eventCount={spoke.txCount} liquidationCount={spoke.liquidationCount} />
            }
            columns={
              supplyOnly
                ? [
                    {
                      label: "Supplied",
                      assetIcons:
                        spoke.supplyingSymbols.length > 0 ? (
                          <InlineAssetCluster symbols={spoke.supplyingSymbols} />
                        ) : undefined,
                      value: supplyUsdPending ? (
                        supplyValueSkeleton
                      ) : (
                        <HeadlineUsd
                          defillamaUsd={spoke.totalSupplyUsd}
                          onchainUsd={spoke.onchainUsd?.supply}
                          derivedProv={SUPPLY_USD_PROV}
                          onchainLabel="Currently supplied"
                          unpricedSymbols={spoke.unpricedSymbols}
                          color="text-foreground/80"
                        />
                      ),
                      footnote: (
                        <>
                          <UnpricedFootnote spoke={spoke} onchainUsd={spoke.onchainUsd?.supply} />
                          <SupplyInterestFootnote spoke={spoke} />
                        </>
                      ),
                    },
                    null,
                    null,
                  ]
                : [
                    {
                      // "Collateral" is the full (un-LT-weighted) market value of
                      // the supplies ENABLED as collateral — what actually backs
                      // the loan. Supplied-but-not-collateral assets are excluded
                      // (they can't be seized and don't move HF) and shown as a
                      // separate footnote. The LT weighting lives in HF + borrowing
                      // power, not in this number.
                      label: CARD_VOCAB.collateral,
                      assetIcons:
                        spoke.supplyBreakdown.collateralSymbols.length > 0 ? (
                          <InlineAssetCluster symbols={spoke.supplyBreakdown.collateralSymbols} />
                        ) : undefined,
                      value: supplyUsdPending ? (
                        supplyValueSkeleton
                      ) : (
                        <HeadlineUsd
                          defillamaUsd={spoke.supplyBreakdown.collateralUsd}
                          onchainUsd={spoke.onchainUsd?.collateral}
                          derivedProv={COLL_USD_PROV}
                          onchainLabel="Current collateral"
                          unpricedSymbols={spoke.unpricedSymbols}
                          color="text-foreground/80"
                        />
                      ),
                      footnote: (
                        <>
                          <UnpricedFootnote spoke={spoke} onchainUsd={spoke.onchainUsd?.collateral} />
                          <NonCollateralFootnote spoke={spoke} />
                          <SupplyInterestFootnote spoke={spoke} />
                        </>
                      ),
                    },
                    {
                      label: CARD_VOCAB.debt,
                      assetIcons:
                        spoke.borrowingSymbols.length > 0 ? (
                          <InlineAssetCluster symbols={spoke.borrowingSymbols} />
                        ) : undefined,
                      value: (
                        <HeadlineUsd
                          defillamaUsd={spoke.totalDebtUsd}
                          onchainUsd={spoke.onchainUsd?.debt}
                          derivedProv={DEBT_USD_PROV}
                          onchainLabel="Current debt"
                          unpricedSymbols={spoke.unpricedSymbols}
                          color="text-foreground/80"
                        />
                      ),
                      footnote: (
                        <>
                          <UnpricedFootnote spoke={spoke} onchainUsd={spoke.onchainUsd?.debt} />
                          <DebtFootnote spoke={spoke} />
                        </>
                      ),
                    },
                    {
                      label: ratioLabel("pooled"),
                      value:
                        spoke.healthFactor !== null ? (
                          <StatValue color={hfColorClass(spoke.healthFactor)}>
                            <Prov info={healthFactorProv()}>{hfLabel(spoke.healthFactor)}</Prov>
                          </StatValue>
                        ) : (
                          <StatDash>{"∞"}</StatDash>
                        ),
                      // The liquidation read sits beneath HF as its tangible
                      // restatement (single collateral → price, multi → 1 − 1/HF
                      // buffer), not as a peer column — it's derived from HF.
                      // Borrowing power stays omitted (it's the gap to a 1.00 HF,
                      // which misreads as a safe-to-borrow stat).
                      footnote: <AaveV4LiquidationFootnote buf={liquidationBuffer(spoke)} />,
                    },
                  ]
            }
          />
        )}
        {/* The card's info area at the bottom-left: (i) Explanation beside
            route-icon Provenance (the receipts list for every traced value in
            the surrounding scope — the detail page wraps the whole position
            panel in one). */}
        {showInfo && (
          <div className="mt-3" onClick={(e) => e.stopPropagation()}>
            <ProvenanceInfoTabs
              // A terminal life gets the past-tense closed narration — never no
              // pane. rowExtra (the live risk strip) stays open-only: it
              // describes the chain NOW and never rides a past life.
              explanation={
                isClosed ? (
                  <AaveV4ClosedExplanation spoke={spoke} embedded />
                ) : (
                  <AaveV4PositionExplanation spoke={spoke} embedded externalActivity={externalActivity} />
                )
              }
              rowExtra={isClosed ? undefined : rowExtra}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export interface AaveV4SpokeCardSelectorProps {
  spokes: AaveSpokeCardInfo[];
  selected: string | undefined;
  onSelect: (spokeName: string) => void;
  /** When set, every rendered card carries a wallet pill alongside the spoke
   *  identity (facehash + ENS-or-short-addr + copy). Detail page passes this
   *  so the card matches the listing-card identity row; multi-spoke selectors
   *  inside a wallet-scoped page omit it. */
  wallet?: string;
  ensName?: string | null;
  /** Compact context for the info area's heading-button row (detail page only —
   *  the single static card; see AaveV4SpokeCard.rowExtra). */
  rowExtra?: React.ReactNode;
  /** Third-party-actor summary for the SELECTED spoke's history (detail page
   *  only — see AaveV4SpokeCard.externalActivity). The detail page renders a
   *  single spoke, so one summary is unambiguous; a genuine multi-spoke
   *  selector must not pass a summary reduced over another spoke's events. */
  externalActivity?: ExternalActorSummary;
}

export function AaveV4SpokeCardSelector({
  spokes,
  selected,
  onSelect,
  wallet,
  ensName,
  rowExtra,
  externalActivity,
}: AaveV4SpokeCardSelectorProps) {
  const items = spokes.map((s) => {
    const status: "open" | "closed" = s.isClosed ? "closed" : "open";
    return { ...s, id: s.name, status };
  });
  return (
    <CardSelectorShell
      items={items}
      selected={selected}
      onSelect={onSelect}
      orderItems={(list) =>
        [...list].sort((a, b) => {
          if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1;
          return b.totalSupplyUsd - a.totalSupplyUsd;
        })
      }
      renderCard={(item, props) => (
        <AaveV4SpokeCard
          spoke={item}
          isSelected={props.isSelected}
          noHover={props.noHover}
          staticCard={props.staticCard}
          onClick={props.onClick}
          wallet={wallet}
          ensName={ensName}
          rowExtra={rowExtra}
          // Gated on the selected spoke: the summary is reduced over ONE
          // spoke's events, so handing it to a sibling card would state
          // another market's operator pattern under this one's heading.
          externalActivity={item.name === selected ? externalActivity : undefined}
        />
      )}
    />
  );
}
