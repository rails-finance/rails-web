"use client";

// The Aave V4 spoke position card. It is a slot builder (rails-ops
// TO-DO-position-card 322): `useAaveV4SpokeCardSlots` turns one spoke
// position into a `PositionCardSlots` object and the shared `PositionCard`
// (components/shared/position-card.tsx) draws it. The selector stays around the
// shell: `AaveV4SpokeCardSelector` keeps `CardSelectorShell` (click to choose
// among a wallet's spoke cards) and wraps each `PositionCard` in the chooser's
// hover surface.
//
// Heads: Collateral, Debt and Health factor in USD with the asset clusters, or
// one head, Supplied, on a supply-only spoke. The panel holds the lines that
// sat under them: what the totals leave out, the supplies that are not
// collateral, the interest inside each side, the borrow rate and its yearly
// cost, the liquidation threshold, the risk premium and the liquidation read.
// A closed spoke shows its highest recorded balances and the Outcome.

import { useState, type ReactNode } from "react";
import { Link2 } from "lucide-react";
import { formatDate } from "@/lib/date";
import { CardSelectorShell, positionCardSurface } from "@/components/shared/card-selector-shell";
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
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { type HubTier, hubChipLabel } from "@/components/protocol/aave-v4/aave-v4-spoke-constants";
import { type AaveSpokeCardInfo, liquidationBuffer, rateSymbolLabel, yearlyDebtCost } from "@/lib/aave-v4/spoke-cards";
import { aaveV4DisplaySymbol } from "@/lib/aave-v4/pt-tokens";
import { WalletPill } from "@/components/shared/wallet-pill";
import type { ClosedCollateralFactors } from "@/lib/aave-v4/use-closed-collateral-factors";
import { fmtUsd, hfLabelV4, fmtLiqPrice } from "@/lib/aave-v4/format";
import { formatCompact } from "@/lib/shared/format-compact";
import { formatUsdValue } from "@/lib/utils/format";
import { AssetAmount } from "@/components/shared/asset-amount";
import { TokenFigure } from "@/components/shared/token-figure";
import {
  AaveV4PositionExplanation,
  AaveV4ClosedExplanation,
} from "@/components/protocol/aave-v4/aave-v4-position-explanation";
import { aaveV4PositionModal } from "@/lib/aave-v4/event-templates";
import type { ExternalActorSummary } from "@/lib/shared/external-actor";
import { Prov, type Provenance } from "@/components/shared/provenance";
import {
  accumProv,
  chainTruthProv,
  usdProvOnchain,
  healthFactorProv,
  interestSinceZeroProv,
  BLENDED_LT_PROV,
  BORROW_RATE_PROV,
  COLL_USD_PROV,
  DEBT_USD_PROV,
  LIQ_DROP_PROV,
  LIQ_PRICE_PROV,
  liqRatioProv,
  NONCOLL_USD_PROV,
  PEAK_COLL_PROV,
  PEAK_DEBT_PROV,
  SUPPLY_USD_PROV,
  YEARLY_COST_PROV,
} from "@/lib/aave-v4/position-provenance";
import { PARTIAL_LABEL_SUFFIX, partialSumProv } from "@/lib/aave-v4/unpriced";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import { useAaveV4Deployment } from "@/lib/aave-v4/deployment";

export type { AaveSpokeCardInfo };

// The interest figures are added since each balance last started from zero.
const supplyInterestProv = () => interestSinceZeroProv("Supply interest inside the collateral");
const borrowInterestProv = () => interestSinceZeroProv("Borrow interest inside the debt");

/**
 * A headline USD figure (collateral, debt, supplied). The on-chain-oracle
 * total when every contributing asset is oracle-priced, traced as read from
 * the chain; otherwise the DefiLlama figure, which sums only the assets a price
 * covers and is marked partial when one is missing (RULE: Rails never invents a
 * price, lib/aave-v4/unpriced.ts). The panel's "Not in the totals" row names
 * what is missing.
 */
function HeadlineUsd({
  defillamaUsd,
  onchainUsd,
  derivedProv,
  onchainLabel,
  unpricedSymbols,
}: {
  defillamaUsd: number;
  onchainUsd: number | null | undefined;
  derivedProv: Provenance;
  onchainLabel: string;
  unpricedSymbols: string[];
}) {
  const useOnchain = onchainUsd != null;
  const v = fmtUsd(useOnchain ? onchainUsd : defillamaUsd);
  const excluded = useOnchain ? [] : unpricedSymbols;
  const info: Provenance = useOnchain
    ? usdProvOnchain(onchainLabel)
    : partialSumProv(derivedProv, onchainLabel, excluded);
  return (
    <RevealTip tip={excluded.length > 0 ? `${v.title}${PARTIAL_LABEL_SUFFIX}` : v.title}>
      <Prov info={info}>{v.display}</Prov>
    </RevealTip>
  );
}

/** A side holding one asset: its amount with its icon, and the USD line
 *  beneath in cents (the Liquity V2 headline). The amount is the spoke's
 *  balance where the chain read has landed (`chainBalances`), else the
 *  events' sum. The USD follows `HeadlineUsd`'s rule: the oracle figure,
 *  else the fallback price's, and no line where no source prices the asset. */
function oneAssetHead(
  leg: { symbol: string; amount: number },
  what: string,
  chainBalances: boolean,
  defillamaUsd: number,
  onchainUsd: number | null | undefined,
  derivedProv: Provenance,
  unpricedSymbols: string[],
): Pick<PositionCardHead, "value" | "usd"> {
  const unpriced = onchainUsd == null && unpricedSymbols.includes(leg.symbol);
  const usd = onchainUsd ?? defillamaUsd;
  return {
    value: (
      <Prov info={chainBalances ? chainTruthProv(what) : accumProv(what, { formula: "in − out" })}>
        <AssetAmount value={leg.amount} symbol={leg.symbol} />
      </Prov>
    ),
    usd: unpriced ? null : (
      <Prov info={onchainUsd != null ? usdProvOnchain(what) : derivedProv}>
        <span className="font-bold text-green-400">{formatUsdValue(usd)}</span>
      </Prov>
    ),
  };
}

/** A closed card's peak, muted as a historic figure. */
function PeakUsd({ usd, info }: { usd: number; info: Provenance }) {
  const v = fmtUsd(usd);
  return (
    <span className="text-rb-500">
      <RevealTip tip={v.title}>
        <Prov info={info}>{v.display}</Prov>
      </RevealTip>
    </span>
  );
}

/** The spoke and its hubs, at the right end of the heading row. */
function SpokeIdentity({ name, hub, debtHubs }: { name: string; hub: HubTier; debtHubs: HubTier[] }) {
  return (
    <span className="flex items-center gap-1.5 leading-none text-foreground">
      <span className="text-xs font-semibold">{name}</span>
      <span className="text-xs font-bold uppercase tracking-wide">{hubChipLabel(hub, debtHubs)}</span>
    </span>
  );
}

/** The ⋮'s row for this position: a link to its page. A spoke position has no
 *  ID or NFT of its own; the wallet and the spoke name it. */
function AaveV4MenuRows({ pagePath }: { pagePath: string }) {
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

/** "$X since 25 Jun 2026": the interest inside one side, or null below a cent. */
function interestRow(spoke: AaveSpokeCardInfo, side: "supply" | "debt"): PositionPanelRow | null {
  const got = side === "supply" ? spoke.interestSinceZero?.supply : spoke.interestSinceZero?.debt;
  if (!got || got.usd < 0.01) return null;
  const v = fmtUsd(got.usd);
  return side === "supply"
    ? {
        id: "supply-interest",
        label: "Supply interest",
        tip: "The supply interest inside the collateral, in dollars: what the supplied balance holds beyond its deposits and withdrawals since it last started from zero.",
        value: (
          <span>
            <Prov info={supplyInterestProv()}>{v.display}</Prov> since {formatDate(got.since)}
          </span>
        ),
      }
    : {
        id: "borrow-interest",
        label: "Borrow interest",
        tip: "The borrow interest inside the debt, in dollars: what the debt holds beyond its draws and repayments since it last started from zero.",
        value: (
          <span>
            <Prov info={borrowInterestProv()}>{v.display}</Prov> since {formatDate(got.since)}
          </span>
        ),
      };
}

/** The liquidation read beside the health factor: the one collateral's price
 *  (or its price in the debt asset where the two move together), else the
 *  drop the whole collateral can take, `1 − 1/HF`. */
function liquidationRow(spoke: AaveSpokeCardInfo): PositionPanelRow | null {
  const buf = liquidationBuffer(spoke);
  if (buf.liquidatable)
    return {
      id: "health-bucket",
      label: "Health bucket",
      tip: "The health factor is below 1, so a liquidator can repay part of the debt and take collateral at a discount.",
      value: "Liquidatable at this block",
    };
  if (buf.dropPct == null) return null;
  if (buf.atLine)
    return {
      id: "liquidation",
      label: "Liquidation",
      tip: "The health factor is above 1 by less than the card can show as a drop: the position is at the line where it can be liquidated.",
      value: "At the liquidation line",
    };
  if (buf.single?.against) {
    const a = buf.single.against;
    const coll = aaveV4DisplaySymbol(buf.single.symbol);
    const debt = aaveV4DisplaySymbol(a.symbol);
    return {
      id: "liquidates-at",
      label: "Liquidates at",
      tip: `The ${coll} price, in ${debt}, at which the health factor reaches 1 and the position can be liquidated. The debt moves with the collateral, so the price between the two is the one that matters.`,
      value: (
        <span className="inline-flex items-center gap-1">
          <TokenChipIcon symbol={buf.single.symbol} size={14} filterable={false} />
          <TokenFigure symbol={a.symbol}>
            <Prov info={liqRatioProv(coll, debt)}>
              {a.liqRatio.toLocaleString("en-US", { maximumFractionDigits: 4 })}
            </Prov>
          </TokenFigure>
        </span>
      ),
    };
  }
  if (buf.single)
    return {
      id: "liquidates-at",
      label: "Liquidates at",
      tip: `The ${aaveV4DisplaySymbol(buf.single.symbol)} price at which the health factor reaches 1 and the position can be liquidated: its market price divided by the health factor.`,
      value: (
        <span className="inline-flex items-center gap-1">
          <TokenChipIcon symbol={buf.single.symbol} size={14} filterable={false} />
          <Prov info={LIQ_PRICE_PROV}>{fmtLiqPrice(buf.single.liqPrice)}</Prov>
        </span>
      ),
    };
  return {
    id: "liquidation-drop",
    label: "Liquidates on a drop of",
    tip: "How far the dollar value of all the collateral can fall, the debt standing still, before the health factor reaches 1 and the position can be liquidated: 1 − 1 ÷ health factor.",
    value: <Prov info={LIQ_DROP_PROV}>{buf.dropPct.toFixed(0)}%</Prov>,
  };
}

export interface AaveV4SpokeCardProps {
  spoke: AaveSpokeCardInfo;
  /** The card carries the (i) Explanation and its "?". */
  showInfo: boolean;
  /** A wallet pill beside the spoke name, for a selector whose page does not
   *  name the wallet above the card. */
  wallet?: string;
  ensName?: string | null;
  /** Who executed this spoke position's events, reduced over the page's
   *  spoke-scoped history: the explanation's operator bullet. */
  externalActivity?: ExternalActorSummary;
  /** A closed position's collateral factors while it was open. */
  closedFactors?: ClosedCollateralFactors;
  /** The risk premium the spoke charges this position, as a fraction; a row
   *  only when it is above zero. */
  riskPremium?: number | null;
  /** The position page's path, for the ⋮'s link. */
  pagePath?: string;
  /** The ⋮'s export shapes (`aaveV4Exports`). */
  exports?: PositionCardExports | null;
  /** The (i) pane's copy-this-view link. */
  viewHref?: () => string;
  /** A foot line (Base: the oracle prices and the reserves' pause state). */
  foot?: ReactNode;
}

/** The Aave V4 spoke's slots for the shared position card. */
export function useAaveV4SpokeCardSlots({
  spoke,
  showInfo,
  wallet,
  ensName,
  externalActivity,
  closedFactors,
  riskPremium,
  pagePath,
  exports,
  viewHref,
  foot,
}: AaveV4SpokeCardProps): PositionCardSlots {
  const { session } = useAaveV4Deployment();
  const { isClosed } = spoke;
  // Supply-only draws one head, Supplied. A closed card asks whether the
  // position ever carried real debt (peak debt under $1); an open card counts
  // any live debt, so a sub-dollar leftover borrow keeps its Debt and Health
  // factor heads.
  const supplyOnly = isClosed ? spoke.peakDebtUsd < 1 : spoke.totalDebtUsd <= 0;

  const identity = (
    <span className="flex items-center gap-2">
      {wallet && (
        <WalletPill wallet={wallet} ensName={ensName ?? null} filterProtocol={session} bookmarkProtocol={session} />
      )}
      <SpokeIdentity name={spoke.name} hub={spoke.hub} debtHubs={spoke.debtHubs} />
    </span>
  );
  // The owner transaction count and the liquidation triangle; the closed
  // card's tip also gives the events behind them.
  const counters = {
    eventCount: spoke.txCount,
    ...(isClosed ? { eventTotal: spoke.eventCount } : {}),
    liquidationCount: spoke.liquidationCount,
  };
  const explainer = {
    body: showInfo ? (
      isClosed ? (
        <AaveV4ClosedExplanation spoke={spoke} embedded factorsThen={closedFactors} />
      ) : (
        <AaveV4PositionExplanation spoke={spoke} embedded externalActivity={externalActivity} />
      )
    ) : null,
    viewHref,
  };
  const learnMore = showInfo ? aaveV4PositionModal(spoke.name, spoke.wasLiquidated) : null;
  const menu = {
    leading: pagePath ? () => <AaveV4MenuRows pagePath={pagePath} /> : undefined,
    exports: exports ?? null,
  };

  if (isClosed) {
    // Any liquidation in the record marks the outcome Liquidated, whether or
    // not a later owner transaction emptied the position (Aave V3's
    // `everLiquidated` rule; rails-ops TO-DO-ui-jobs 97).
    const liquidated = spoke.wasLiquidated;
    const status: PositionCardStatus = liquidated
      ? { word: "Liquidated", tone: "danger" }
      : { word: "Closed", tone: "muted" };
    const heads: PositionCardHead[] = [
      {
        id: "peak-collateral",
        label: supplyOnly ? CARD_VOCAB.peakSupply : CARD_VOCAB.peakCollateral,
        value: <PeakUsd usd={spoke.peakSupplyUsd} info={PEAK_COLL_PROV} />,
      },
      ...(supplyOnly
        ? []
        : [
            {
              id: "peak-debt",
              label: CARD_VOCAB.peakDebt,
              value: <PeakUsd usd={spoke.peakDebtUsd} info={PEAK_DEBT_PROV} />,
            },
          ]),
    ];
    return {
      surface: "detail",
      status,
      heads,
      identity,
      counters,
      explainer,
      learnMore,
      menu,
      foot,
      outcome: { word: liquidated ? "Liquidated" : "Closed" },
    };
  }

  // Collateral USD lags while the supplied asset's price resolves: hold the
  // figure's place until it lands rather than flash "< $0.01". A collateral
  // position is never worth under a cent, so that reading means a price still
  // loading.
  const supplyUsdPending = spoke.supplyingSymbols.length > 0 && spoke.totalSupplyUsd < 0.01;
  const cluster = (symbols: string[]) => (symbols.length > 0 ? <InlineAssetCluster symbols={symbols} /> : undefined);
  const onc = spoke.onchainUsd;

  // A side of one asset states its amount, the dollars beneath; a side of
  // several, compact dollars with the icons.
  const chainBalances = spoke.healthFactorBasis != null;
  const supplyLegs = (spoke.supplyLegs ?? []).filter((l) => l.amount > 0);
  const debtLegs = (spoke.debtLegs ?? []).filter((l) => l.amount > 0);
  const collLegs = supplyLegs.filter((l) => l.collateralEnabled);
  const single = <T,>(legs: T[], symbols: string[]): T | null =>
    legs.length === 1 && symbols.length === 1 ? legs[0] : null;
  const oneSupply = single(supplyLegs, spoke.supplyingSymbols);
  const oneColl = single(collLegs, spoke.supplyBreakdown.collateralSymbols);
  const oneDebt = single(debtLegs, spoke.borrowingSymbols);
  const heads: PositionCardHead[] = supplyOnly
    ? [
        {
          id: "supplied",
          label: "Supplied",
          ...(oneSupply
            ? oneAssetHead(
                oneSupply,
                "Currently supplied",
                chainBalances,
                spoke.totalSupplyUsd,
                onc?.supply,
                SUPPLY_USD_PROV,
                spoke.unpricedSymbols,
              )
            : {
                pending: supplyUsdPending,
                assets: cluster(spoke.supplyingSymbols),
                value: (
                  <HeadlineUsd
                    defillamaUsd={spoke.totalSupplyUsd}
                    onchainUsd={onc?.supply}
                    derivedProv={SUPPLY_USD_PROV}
                    onchainLabel="Currently supplied"
                    unpricedSymbols={spoke.unpricedSymbols}
                  />
                ),
              }),
        },
      ]
    : [
        {
          // The full market value of the supplies enabled as collateral; the
          // ones that are not stand in the panel. The threshold weighting
          // lives in the health factor.
          id: "collateral",
          label: CARD_VOCAB.collateral,
          ...(oneColl
            ? oneAssetHead(
                oneColl,
                "Current collateral",
                chainBalances,
                spoke.supplyBreakdown.collateralUsd,
                onc?.collateral,
                COLL_USD_PROV,
                spoke.unpricedSymbols,
              )
            : {
                pending: supplyUsdPending,
                assets: cluster(spoke.supplyBreakdown.collateralSymbols),
                value: (
                  <HeadlineUsd
                    defillamaUsd={spoke.supplyBreakdown.collateralUsd}
                    onchainUsd={onc?.collateral}
                    derivedProv={COLL_USD_PROV}
                    onchainLabel="Current collateral"
                    unpricedSymbols={spoke.unpricedSymbols}
                  />
                ),
              }),
        },
        {
          id: "debt",
          label: CARD_VOCAB.debt,
          ...(oneDebt
            ? oneAssetHead(
                oneDebt,
                "Current debt",
                chainBalances,
                spoke.totalDebtUsd,
                onc?.debt,
                DEBT_USD_PROV,
                spoke.unpricedSymbols,
              )
            : {
                assets: cluster(spoke.borrowingSymbols),
                value: (
                  <HeadlineUsd
                    defillamaUsd={spoke.totalDebtUsd}
                    onchainUsd={onc?.debt}
                    derivedProv={DEBT_USD_PROV}
                    onchainLabel="Current debt"
                    unpricedSymbols={spoke.unpricedSymbols}
                  />
                ),
              }),
        },
        {
          id: "health-factor",
          label: ratioLabel("pooled"),
          // A debt the card could not price has no health factor: a dash,
          // since "∞" would say there is no debt.
          value:
            spoke.healthFactor !== null ? (
              <Prov info={healthFactorProv(spoke.healthFactorBasis)}>{hfLabelV4(spoke.healthFactor)}</Prov>
            ) : spoke.borrowingSymbols.length > 0 ? null : (
              <span className="text-rb-500">∞</span>
            ),
        },
      ];

  // ── The panel: the supplied side on the left, the debt and the risk on the
  //    right.
  const present = (rows: (PositionPanelRow | null)[]): PositionPanelRow[] =>
    rows.filter((r): r is PositionPanelRow => r != null);

  // What a fallback total leaves out. The on-chain totals are whole or
  // absent, so the row stands only when a head shows the fallback figure.
  const fallbackShown = supplyOnly ? onc?.supply == null : onc?.collateral == null || onc?.debt == null;
  const unpricedRow: PositionPanelRow | null =
    fallbackShown && spoke.unpricedSymbols.length > 0
      ? {
          id: "unpriced",
          label: "Not in the totals",
          tip: "Assets held here that no price source covers. The dollar figures above leave them out and are marked partial.",
          value: (
            <span className="inline-flex flex-wrap items-center gap-x-1.5">
              <InlineAssetCluster symbols={spoke.unpricedSymbols} size={16} overlap={4} max={6} />
              no price source
            </span>
          ),
        }
      : null;

  // Supplies not enabled as collateral: they cannot be seized and do not move
  // the health factor. The on-chain figure (supply − collateral, both priced)
  // where it stands, else the DefiLlama one.
  const nonCollUsd = spoke.supplyBreakdown.nonCollateralUsd;
  const onchainNonColl = onc && onc.supply != null && onc.collateral != null ? onc.supply - onc.collateral : null;
  const nonCollRow: PositionPanelRow | null =
    !supplyOnly && nonCollUsd > 0
      ? (() => {
          const v = fmtUsd(onchainNonColl ?? nonCollUsd);
          return {
            id: "not-collateral",
            label: "Supplied, not collateral",
            tip: "Supplies the position has not enabled as collateral, in dollars. They cannot be seized and do not count toward the health factor.",
            value: (
              <RevealTip tip={v.title}>
                <Prov info={onchainNonColl != null ? usdProvOnchain("Supplied, not collateral") : NONCOLL_USD_PROV}>
                  {v.display}
                </Prov>
              </RevealTip>
            ),
          };
        })()
      : null;

  // The liquidation threshold the health factor weighs the collateral at: one
  // asset's, or the dollar-weighted blend of several.
  const ltPct = spoke.blendedLt != null && spoke.blendedLt > 0 ? Math.round(spoke.blendedLt * 100) : null;
  const blended = spoke.supplyBreakdown.collateralSymbols.length > 1;
  const ltRow: PositionPanelRow | null =
    !supplyOnly && ltPct != null
      ? {
          id: "liquidation-threshold",
          label: blended ? "Blended liquidation threshold" : "Liquidation threshold",
          tip: blended
            ? "Each collateral asset's liquidation threshold weighted by its dollar share, as the spoke reports them: the part of the collateral's value the health factor counts."
            : "The collateral's liquidation threshold, as the spoke reports it: the part of its value the health factor counts.",
          value: <Prov info={BLENDED_LT_PROV}>{ltPct}%</Prov>,
        }
      : null;

  const rate = spoke.latestBorrowRate;
  // "USDC borrow rate" where the position has borrowed more than one asset.
  const ratePrefix = rateSymbolLabel(spoke);
  const rateRow: PositionPanelRow | null =
    !supplyOnly && rate !== null
      ? {
          id: "borrow-rate",
          label: ratePrefix ? `${ratePrefix}borrow rate` : "Borrow rate",
          tip: "The latest borrow rate recorded on this spoke for the borrowed asset, from its most recent rate event.",
          value: <Prov info={BORROW_RATE_PROV}>{rate.toFixed(2)}%</Prov>,
        }
      : null;
  const yearly = yearlyDebtCost(spoke);
  const costRow: PositionPanelRow | null =
    !supplyOnly && yearly && yearly.amount > 0
      ? {
          id: "yearly-cost",
          label: "Costs per year",
          tip: "What the debt costs in a year at the latest borrow rate, in the borrowed token, if the rate and the debt stay where they are.",
          value: (
            <TokenFigure symbol={yearly.symbol}>
              <span>
                ~<Prov info={YEARLY_COST_PROV}>{formatCompact(yearly.amount)}</Prov>
              </span>
            </TokenFigure>
          ),
        }
      : null;
  const premiumRow: PositionPanelRow | null =
    riskPremium && riskPremium > 0
      ? {
          id: "risk-premium",
          label: "Risk premium",
          tip: "Aave V4 prices risk per position: the collateral held here carries a premium on top of the hub's base borrow rate.",
          value: `${(riskPremium * 100).toFixed(2)}%`,
        }
      : null;

  return {
    surface: "detail",
    status: null,
    heads,
    identity,
    counters,
    explainer,
    learnMore,
    menu,
    foot,
    panel: [
      present([unpricedRow, nonCollRow, interestRow(spoke, "supply"), ltRow]),
      present([interestRow(spoke, "debt"), rateRow, costRow, premiumRow, supplyOnly ? null : liquidationRow(spoke)]),
    ],
  };
}

/** One spoke's card, drawn by the shared shell. */
function AaveV4SpokeCard(props: AaveV4SpokeCardProps) {
  return <PositionCard slots={useAaveV4SpokeCardSlots(props)} />;
}

export interface AaveV4SpokeCardSelectorProps extends Omit<AaveV4SpokeCardProps, "spoke" | "showInfo"> {
  spokes: AaveSpokeCardInfo[];
  selected: string | undefined;
  onSelect: (spokeName: string) => void;
}

/** The wallet's spoke cards: the selected one in place, the others behind
 *  the chooser's chevron. Each card is the shared shell inside the chooser's
 *  hover surface; a press on a control inside the card (the ⋮, the (i), a
 *  receipt) stays with that control. */
export function AaveV4SpokeCardSelector({
  spokes,
  selected,
  onSelect,
  externalActivity,
  closedFactors,
  riskPremium,
  exports,
  pagePath,
  viewHref,
  foot,
  ...rest
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
      renderCard={(item, props) => {
        // The page-scoped parts (the operator summary, the factors then, the
        // premium, the exports, the foot) belong to the selected spoke only.
        const mine = item.name === selected;
        return (
          <div
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("button, a, [role='menu'], [role='dialog']")) return;
              props.onClick();
            }}
            className={`w-full rounded-2xl text-left transition-all ${props.staticCard ? "cursor-default" : "cursor-pointer"} ${positionCardSurface(item.isClosed ? "closed" : "open", props)}`}
          >
            <AaveV4SpokeCard
              {...rest}
              spoke={item}
              showInfo={(props.noHover && !props.isSelected) || props.staticCard}
              externalActivity={mine ? externalActivity : undefined}
              closedFactors={mine ? closedFactors : undefined}
              riskPremium={mine ? riskPremium : undefined}
              exports={mine ? exports : undefined}
              pagePath={mine ? pagePath : undefined}
              viewHref={mine ? viewHref : undefined}
              foot={mine ? foot : undefined}
            />
          </div>
        );
      }}
    />
  );
}
