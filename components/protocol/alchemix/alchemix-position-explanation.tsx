"use client";

// The Alchemist position card's Explanation pane: this position's figures,
// explained. What is true of every position (what the vault does, what the
// synthetic is, how the Transmuter earmarks debt, liquidation, how to read an
// event card, the NFT) is the card's "?" (`alchemixPositionContent`).
//
// Colour points back to the card (rails-ops standards/detail-page-anatomy.md,
// "The disclosure ladder"): a figure the card above states is foreground (`H`),
// written in the card's format; one stated only here is muted.

import type { ReactNode } from "react";
import { ProseExplainer, H, type ExplainerItem } from "@/lib/shared/explainer-prose";
import { Prov, type Provenance } from "@/components/shared/provenance";
import type { RedemptionNetTotal } from "@/lib/alchemix/redemption-net";
import { formatNumber } from "@/lib/utils/format";
import type { AlchemixLiveState } from "@/types/api/alchemix";
import { AmountText } from "@/components/shared/amount-text";
import type { SelfLiquidationSplit } from "@/lib/alchemix/self-liquidation";
import { formatDate } from "@/lib/date";
import { formatSharePrice } from "@/components/protocol/alchemix/alchemix-position-card";
import { formatCompactTitled } from "@/lib/shared/format-compact";
import { ltvPct } from "@/lib/alchemix/ltv";

const compact = (n: number) => formatCompactTitled(n).display;
/** A signed figure that keeps its sign and size however small: a lifetime net
 *  of a few millionths reads as that, never as "−0.00". */
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatNumber(Math.abs(n))}`;

/** A share-price fall as the card draws it: one decimal, two under 1%. */
export function fallPct(fall: number): string {
  const pct = fall * 100;
  return `${pct.toLocaleString("en-US", { maximumFractionDigits: pct < 1 ? 2 : 1 })}%`;
}

/** What the timeline's redemptions did to this position, summed over the
 *  ones with stated figures. */
export interface AlchemixRedemptionTotals {
  count: number;
  stated: number;
  cleared: number;
  /** Null where not every stated redemption has a collateral figure. */
  taken: number | null;
}

/** The redemptions' net for the holder, summed, with its receipt. */
export interface AlchemixRedemptionNetView {
  total: RedemptionNetTotal;
  underlyingSymbol: string;
  prov: Provenance | null;
}

/** How a closed position closed: its last transaction, and the split where
 *  that was a self-liquidation. */
export interface AlchemixCloseFacts {
  blockNumber: number;
  timestamp: number;
  split: SelfLiquidationSplit | null;
}

export interface AlchemixPositionExplanationProps {
  live: AlchemixLiveState | null;
  syntheticSymbol: string;
  mytSymbol: string;
  redemptions: AlchemixRedemptionTotals;
  net?: AlchemixRedemptionNetView | null;
  /** The MYT's address on the chain's explorer. */
  vaultHref?: string | null;
  /** The share-price fall to the liquidation threshold, 0 to 1; null with no debt. */
  fall?: number | null;
  /** The debt this position's own events leave, and what the redemptions cleared of it, where the two differ. */
  debtFromEvents?: ReactNode;
  /** The card's Collateral subline states the dollar value. */
  usdOnCard?: boolean;
  /** The line's redemption fee, in basis points of the shares a redemption takes. */
  feeBps?: number | null;
  /** The line's liquidation count with its receipt. */
  lineLiquidations?: { count: number; throughBlock: number | null; prov: Provenance } | null;
  /** The holder's V2 account(s), linked, and whether their rows are on the timeline. */
  v2?: { names: ReactNode; joined: boolean } | null;
  /** A closed position's close; null on an open one. */
  close?: AlchemixCloseFacts | null;
}

const shares = (raw: bigint) => compact(Number(raw) / 1e18);

/** The close, for a closed position's pane: when, how, and that nothing has
 *  moved since. */
function closeItems(close: AlchemixCloseFacts, sym: string, mytSymbol: string): ReactNode[] {
  const s = close.split;
  const when = (
    <>
      This position closed on {formatDate(close.timestamp)} at block {close.blockNumber.toLocaleString("en-US")}.
    </>
  );
  const how = s ? (
    <>
      The holder closed it with its collateral, which Alchemix calls a self-liquidation:{" "}
      <span className="tabular-nums">
        {shares(s.totalRaw)} {mytSymbol}
      </span>{" "}
      paid{" "}
      {s.debtBeforeRaw != null ? (
        <span className="tabular-nums">
          the {shares(s.debtBeforeRaw)} {sym} of debt
        </span>
      ) : (
        <>its debt</>
      )}
      {s.feeRaw > BigInt(0) ? (
        <>
          , with a protocol fee of{" "}
          <span className="tabular-nums">
            {shares(s.feeRaw)} {mytSymbol}
          </span>{" "}
          on the earmarked debt, the part set aside to be repaid by redemptions
        </>
      ) : null}
      {s.returnedRaw != null && s.returnedRaw > BigInt(0) ? (
        <>
          , and the remaining{" "}
          <span className="tabular-nums">
            {shares(s.returnedRaw)} {mytSymbol}
          </span>{" "}
          went back to an address the holder chose
        </>
      ) : null}
      .
    </>
  ) : null;
  return [
    <>
      {when}
      {how ? <> {how}</> : null}
    </>,
    <>Its debt and collateral have been zero since.</>,
  ];
}

function explanationParts({
  live,
  syntheticSymbol,
  mytSymbol,
  redemptions,
  net = null,
  vaultHref = null,
  fall = null,
  debtFromEvents = null,
  usdOnCard = false,
  feeBps = null,
  lineLiquidations = null,
  v2 = null,
  close = null,
}: AlchemixPositionExplanationProps): { lead: ReactNode; items: ExplainerItem[] } | null {
  if (!live) return null;
  const sym = syntheticSymbol;
  const under = live.collateral.underlying;
  const underSym = under?.symbol ?? "the asset underneath";
  const netN = net?.total.netRaw != null ? Number(net.total.netRaw) / 1e18 : null;
  const sharePrice = under?.sharePriceRaw ? Number(under.sharePriceRaw) / 10 ** under.decimals : null;
  const priceText = sharePrice != null && under ? `${formatSharePrice(sharePrice, under.decimals)} ${underSym}` : null;
  const health = live.health;
  const hasCollateral = live.collateral.raw !== "0";

  const lead =
    live.debt && live.debt.formatted > 0 ? (
      <>
        This position holds{" "}
        <H>
          {under ? compact(under.formatted) : compact(live.collateral.formatted)} {under ? underSym : mytSymbol}
        </H>{" "}
        of collateral against{" "}
        <H>
          {compact(live.debt.formatted)} {sym}
        </H>{" "}
        of debt.
      </>
    ) : null;

  const vault = vaultHref ? (
    <a href={vaultHref} target="_blank" rel="noopener" className="link">
      the {mytSymbol} vault
    </a>
  ) : (
    <>the {mytSymbol} vault</>
  );

  // What clearing all the earmarked debt would take at this reading's share
  // price: shares worth the debt, and the line's fee on top of them.
  const earmarked = live.earmarked && live.earmarked.formatted > 0 ? live.earmarked : null;
  const takeShares = earmarked && sharePrice ? earmarked.formatted / sharePrice : null;
  const takeFee = takeShares != null && feeBps != null ? (takeShares * feeBps) / 10000 : null;

  const fee = net?.total.fee && net.total.restRaw != null ? net.total.fee : null;
  const rest = fee && net?.total.restRaw != null ? Number(net.total.restRaw) / 1e18 : null;
  const one = redemptions.count === 1;

  // Holdings: the collateral as shares, and its worth.
  const holdings: ReactNode[] = [
    hasCollateral ? (
      <>
        The collateral is{" "}
        <H>
          {compact(live.collateral.formatted)} {mytSymbol}
        </H>
        , shares in {vault}
        {priceText ? (
          <>
            {" "}
            worth <H>{priceText}</H> each
          </>
        ) : null}
        .
      </>
    ) : null,
    hasCollateral && under && live.collateral.usd ? (
      <>
        At {underSym}&rsquo;s ${live.collateral.usd.pricePerUnit.toLocaleString("en-US", { maximumFractionDigits: 2 })}{" "}
        the collateral is worth{" "}
        {usdOnCard ? <H>${compact(live.collateral.usd.usd)}</H> : <>${compact(live.collateral.usd.usd)}</>}.
      </>
    ) : null,
  ];

  // Risk: the distance to liquidation, the line's liquidations, and the earmarked debt.
  const risk: ReactNode[] = [
    fall != null && live.debt && health ? (
      fall > 0 ? (
        <>
          A fall of <H>{fallPct(fall)}</H> in the vault&rsquo;s share price would take the LTV from{" "}
          {health.collateralizationRaw != null ? <H>{ltvPct(health.collateralizationRaw)}</H> : "where it is"} to the
          liquidation threshold of <H>{ltvPct(health.collateralizationLowerBoundRaw)}</H>.
        </>
      ) : (
        <>This position is at or above its liquidation threshold, so anyone can liquidate it.</>
      )
    ) : null,
    lineLiquidations && live.debt && live.debt.formatted > 0 ? (
      lineLiquidations.count > 0 ? (
        <>
          The {sym} market has had{" "}
          <Prov info={lineLiquidations.prov} value={String(lineLiquidations.count)}>
            {lineLiquidations.count} {lineLiquidations.count === 1 ? "liquidation" : "liquidations"}
          </Prov>
          .
        </>
      ) : (
        <>
          <Prov info={lineLiquidations.prov} value="0">
            No position
          </Prov>{" "}
          on the {sym} market has been liquidated so far.
        </>
      )
    ) : null,
    earmarked ? (
      <>
        <H>
          {compact(earmarked.formatted)} {sym}
        </H>{" "}
        of the debt is earmarked: set aside to be repaid by redemptions. A redemption clears it, and so does a repayment
        in vault shares or a close.
      </>
    ) : null,
    earmarked && takeShares != null ? (
      <>
        Clearing all of it at this share price takes {compact(takeShares)} {mytSymbol} of collateral
        {takeFee != null && feeBps != null ? (
          <>
            , plus {takeFee.toLocaleString("en-US", { maximumFractionDigits: takeFee < 0.01 ? 6 : 2 })} {mytSymbol} for
            the market&rsquo;s {(feeBps / 100).toLocaleString("en-US")}% redemption fee
          </>
        ) : null}
        .
      </>
    ) : null,
  ];

  // History: the close, the debt the events leave, the redemptions and their net, the V2 account.
  const history: ReactNode[] = [
    ...(close ? closeItems(close, sym, mytSymbol) : []),
    debtFromEvents,
    redemptions.stated > 0 && redemptions.cleared > 0 ? (
      <>
        The {redemptions.count} {one ? "redemption" : "redemptions"} on the timeline cleared{" "}
        <AmountText value={redemptions.cleared} /> {sym} of this position&rsquo;s debt
        {redemptions.taken != null ? (
          <>
            {" "}
            and took <AmountText value={redemptions.taken} /> {mytSymbol} of its collateral
          </>
        ) : null}
        .
      </>
    ) : null,
    redemptions.stated > 0 && redemptions.cleared > 0 && net && netN != null && net.prov ? (
      <>
        Net for the holder:{" "}
        <Prov info={net.prov} value={String(netN)} symbol={net.underlyingSymbol}>
          <span className="tabular-nums">
            {signed(netN)} {net.underlyingSymbol}
          </span>
        </Prov>
        , the debt cleared less the collateral taken, valued in {net.underlyingSymbol} at each redemption&rsquo;s block.
      </>
    ) : redemptions.stated > 0 && redemptions.cleared > 0 && net && net.total.missingPrice > 0 ? (
      <>
        {net.total.missingPrice} of those redemptions {net.total.missingPrice === 1 ? "has" : "have"} no share price
        read at {net.total.missingPrice === 1 ? "its" : "their"} block, so no net for the holder is given.
      </>
    ) : null,
    redemptions.cleared > 0 && net && netN != null && net.prov && fee ? (
      <>
        The market&rsquo;s {(fee.bps / 100).toLocaleString("en-US")}% redemption fee is{" "}
        {signed(-Number(fee.valueRaw) / 1e18)} {net.underlyingSymbol} of that net (
        <AmountText value={Number(fee.sharesRaw) / 1e18} /> {mytSymbol}).
      </>
    ) : null,
    redemptions.cleared > 0 &&
    net &&
    netN != null &&
    net.prov &&
    fee &&
    rest != null &&
    Math.abs(rest) >= Math.abs(Number(fee.valueRaw) / 1e18) * 0.01 ? (
      <>
        The other {signed(rest)} {net.underlyingSymbol} is how the Alchemist charges a position: at the market&rsquo;s
        average shares per unit of debt across every redemption since the position&rsquo;s last event, while the share
        price moved between them.
      </>
    ) : null,
    v2 ? (
      <>
        {v2.names} is this holder&rsquo;s account from before Alchemix V3, closed on 2 April 2026.
        {v2.joined
          ? " Its events are on the timeline, marked V2. This page's figures are V3's alone."
          : " Its events are on its own page."}
      </>
    ) : null,
  ];

  const grouped = (group: string, nodes: ReactNode[]): ExplainerItem[] =>
    nodes.filter((n) => n != null && n !== false).map((node) => ({ group, node }));
  const items: ExplainerItem[] = [
    ...grouped("Holdings", holdings),
    ...grouped("Risk", risk),
    ...grouped("History", history),
  ];
  return lead || items.length > 0 ? { lead, items } : null;
}

/** Whether the pane has anything to say: a closed position with no close in
 *  hand, and no V2 history, has none, and then the card draws no (i). */
export function hasAlchemixPositionExplanation(props: AlchemixPositionExplanationProps): boolean {
  return explanationParts(props) != null;
}

export function AlchemixPositionExplanation(props: AlchemixPositionExplanationProps) {
  const parts = explanationParts(props);
  if (!parts) return null;
  return <ProseExplainer paragraph={parts.lead} items={parts.items} />;
}
