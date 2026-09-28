"use client";

// The Alchemist position card's Explanation pane: this position's figures,
// explained. What is true of every position (what the vault does, what the
// synthetic is, how the Transmuter sets debt aside, liquidation, how to read an
// event card, the NFT) is the card's "?" (`alchemixPositionContent`).
//
// Colour points back to the card (rails-ops standards/detail-page-anatomy.md,
// "The disclosure ladder"): a figure the card above states is foreground (`H`),
// written in the card's format; one stated only here is muted.

import type { ReactNode } from "react";
import { ProseExplainer, H } from "@/lib/shared/explainer-prose";
import { Prov, type Provenance } from "@/components/shared/provenance";
import type { RedemptionNetTotal } from "@/lib/alchemix/redemption-net";
import { formatCompact } from "@/lib/shared/format-event";
import { formatNumber } from "@/lib/utils/format";
import type { AlchemixLiveState } from "@/types/api/alchemix";
import { AmountText } from "@/components/shared/amount-text";

const compact = (n: number) => formatCompact(n).display;
/** A signed figure that keeps its sign and size however small: a lifetime net
 *  of a few millionths reads as that, never as "−0.00". */
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatNumber(Math.abs(n))}`;

/** A 1e18-scaled ratio as the position card draws it: one decimal below
 *  1,000%, whole numbers above it, and "over 10,000%" past that. */
export function ratioPct(raw: string): string {
  const pct = Number(raw) / 1e16;
  if (pct >= 10000) return "over 10,000%";
  return pct < 1000
    ? `${pct.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    : `${Math.round(pct).toLocaleString("en-US")}%`;
}

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

export function AlchemixPositionExplanation({
  live,
  syntheticSymbol,
  mytSymbol,
  redemptions,
  net = null,
  vaultHref = null,
  fall = null,
  clearedOnCard = false,
  usdOnCard = false,
  feeBps = null,
  lineLiquidations = null,
  v2 = null,
}: {
  live: AlchemixLiveState | null;
  syntheticSymbol: string;
  mytSymbol: string;
  redemptions: AlchemixRedemptionTotals;
  net?: AlchemixRedemptionNetView | null;
  /** The MYT's address on the chain's explorer. */
  vaultHref?: string | null;
  /** The share-price fall to the liquidation line, 0 to 1; null with no debt. */
  fall?: number | null;
  /** The card's Debt subline states the debt the redemptions cleared. */
  clearedOnCard?: boolean;
  /** The card's Collateral subline states the dollar value. */
  usdOnCard?: boolean;
  /** The line's redemption fee, in basis points of the shares a redemption takes. */
  feeBps?: number | null;
  /** The line's liquidation count with its receipt, where it is above zero
   *  (at zero the card says so). */
  lineLiquidations?: { count: number; throughBlock: number | null; prov: Provenance } | null;
  /** The holder's V2 account(s), linked, and whether their rows are on the timeline. */
  v2?: { names: ReactNode; joined: boolean } | null;
}) {
  if (!live) return null;
  const sym = syntheticSymbol;
  const under = live.collateral.underlying;
  const underSym = under?.symbol ?? "the asset underneath";
  const netN = net?.total.netRaw != null ? Number(net.total.netRaw) / 1e18 : null;
  const sharePrice = under?.sharePriceRaw ? Number(under.sharePriceRaw) / 10 ** under.decimals : null;
  const priceText =
    sharePrice != null
      ? `${sharePrice.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ${underSym}`
      : null;
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
        of debt:
      </>
    ) : null;

  const vault = vaultHref ? (
    <a href={vaultHref} target="_blank" rel="noopener noreferrer" className="link">
      the {mytSymbol} vault
    </a>
  ) : (
    <>the {mytSymbol} vault</>
  );

  // What clearing the whole set-aside would take at this reading's share
  // price: shares worth the debt, and the line's fee on top of them.
  const earmarked = live.earmarked && live.earmarked.formatted > 0 ? live.earmarked : null;
  const takeShares = earmarked && sharePrice ? earmarked.formatted / sharePrice : null;
  const takeFee = takeShares != null && feeBps != null ? (takeShares * feeBps) / 10000 : null;

  const items = [
    // The collateral: share count, vault, share price, value.
    hasCollateral ? (
      <>
        The collateral is{" "}
        <H>
          {compact(live.collateral.formatted)} {mytSymbol}
        </H>
        , shares in {vault}.
        {priceText && under ? (
          <>
            {" "}
            At a share price of <H>{priceText}</H> they are worth{" "}
            <H>
              {compact(under.formatted)} {underSym}
            </H>
            {live.collateral.usd ? (
              <>
                , or {usdOnCard ? <H>${compact(live.collateral.usd.usd)}</H> : <>${compact(live.collateral.usd.usd)}</>}{" "}
                at {underSym}&rsquo;s $
                {live.collateral.usd.pricePerUnit.toLocaleString("en-US", { maximumFractionDigits: 4 })}
              </>
            ) : null}
            .
          </>
        ) : null}
      </>
    ) : null,
    // The share-price fall to the liquidation line.
    fall != null && live.debt && health ? (
      fall > 0 ? (
        <>
          A fall of <H>{fallPct(fall)}</H> in the vault&rsquo;s share price would take collateralisation from{" "}
          {health.collateralizationRaw != null ? <H>{ratioPct(health.collateralizationRaw)}</H> : "where it is"} to the
          liquidation line at <H>{ratioPct(health.collateralizationLowerBoundRaw)}</H>.
          {lineLiquidations && lineLiquidations.count > 0 ? (
            <>
              {" "}
              The {sym} line has had{" "}
              <Prov info={lineLiquidations.prov} value={String(lineLiquidations.count)}>
                {lineLiquidations.count} {lineLiquidations.count === 1 ? "liquidation" : "liquidations"}
              </Prov>
              .
            </>
          ) : null}
        </>
      ) : (
        <>This position is at or below its liquidation line, so anyone can liquidate it.</>
      )
    ) : null,
    // The set-aside amount and what clearing it takes.
    earmarked ? (
      <>
        <H>
          {compact(earmarked.formatted)} {sym}
        </H>{" "}
        of the debt is set aside for repayment.
        {takeShares != null ? (
          <>
            {" "}
            Line redemptions clear it, and at this share price clearing all of it takes {compact(takeShares)}{" "}
            {mytSymbol} from the collateral
            {takeFee != null && feeBps != null ? (
              <>
                , plus {takeFee.toLocaleString("en-US", { maximumFractionDigits: takeFee < 0.01 ? 6 : 2 })} {mytSymbol}{" "}
                for the line&rsquo;s {(feeBps / 100).toLocaleString("en-US")}% redemption fee
              </>
            ) : null}
            .
          </>
        ) : null}
      </>
    ) : null,
    // The lifetime redemption totals, and the net with the fee's part.
    redemptions.stated > 0 && redemptions.cleared > 0 ? (
      <>
        Across the {redemptions.count} line redemptions on the timeline below, the line cleared{" "}
        {clearedOnCard ? (
          <H>
            {compact(redemptions.cleared)} {sym}
          </H>
        ) : (
          <>
            <AmountText value={redemptions.cleared} /> {sym}
          </>
        )}{" "}
        of this position&rsquo;s debt
        {redemptions.taken != null ? (
          <>
            {" "}
            and took <AmountText value={redemptions.taken} /> {mytSymbol} of its collateral
          </>
        ) : null}
        .
        {net && netN != null && net.prov ? (
          <>
            {" "}
            Valued in {net.underlyingSymbol} at each redemption&rsquo;s block, with one {sym} counted as one{" "}
            {net.underlyingSymbol}, that is a net of{" "}
            <Prov info={net.prov} value={String(netN)} symbol={net.underlyingSymbol}>
              <span className="tabular-nums">
                {signed(netN)} {net.underlyingSymbol}
              </span>
            </Prov>{" "}
            for the holder: the debt cleared less the value of the collateral taken.
            {net.total.fee && net.total.restRaw != null ? (
              <>
                {" "}
                The line&rsquo;s {(net.total.fee.bps / 100).toLocaleString("en-US")}% redemption fee, paid to
                Alchemix&rsquo;s fee receiver, is {signed(-Number(net.total.fee.valueRaw) / 1e18)}{" "}
                {net.underlyingSymbol} of it (<AmountText value={Number(net.total.fee.sharesRaw) / 1e18} /> {mytSymbol}
                ).
                {Math.abs(Number(net.total.restRaw) / 1e18) >=
                Math.abs(Number(net.total.fee.valueRaw) / 1e18) * 0.01 ? (
                  <>
                    {" "}
                    The other {signed(Number(net.total.restRaw) / 1e18)} {net.underlyingSymbol} is how the Alchemist
                    charges a position: at the line&rsquo;s average shares per unit of debt across every redemption
                    since the position&rsquo;s last event, while the share price moved between them.
                  </>
                ) : null}
              </>
            ) : null}{" "}
            Each redemption&rsquo;s own net is in its card&rsquo;s detail.
          </>
        ) : net && net.total.missingPrice > 0 ? (
          <>
            {" "}
            {net.total.missingPrice} of those redemptions {net.total.missingPrice === 1 ? "has" : "have"} no share price
            read at {net.total.missingPrice === 1 ? "its" : "their"} block, so no net for the holder is given.
          </>
        ) : null}
      </>
    ) : null,
    // Why an event card's set-aside move includes growth between readings.
    redemptions.count > 0 || earmarked ? (
      <>
        Set-aside grows block by block between readings, and an event card&rsquo;s before figure is the reading at the
        previous card&rsquo;s block, so a card&rsquo;s set-aside move includes what built up in between.
      </>
    ) : null,
    v2 ? (
      <>
        {v2.names} is this holder&rsquo;s account from before Alchemix V3, closed on 2 April 2026.
        {v2.joined
          ? " Its events are on the timeline below, marked V2, and the figures on this page are V3's alone."
          : " Its events are on its own page."}
      </>
    ) : null,
  ].filter(Boolean);

  return <ProseExplainer paragraph={lead} items={items} />;
}
