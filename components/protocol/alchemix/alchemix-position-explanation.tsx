"use client";

// The Alchemist position card's Explanation pane.
// ----------------------------------------------------------------------------
// THE CAVEATS THAT HOLD FOR EVERY EVENT CARD LIVE HERE, said once: collateral
// is a vault share count, set-aside is debt the Transmuter has claimed and
// grows block by block, and each card's before figure is the reading at the
// previous card's block. The event cards' bullets are then about their own
// event (rails-ops standards/explanation-copy-charter §4). The protocol's
// mechanic sits one click further, in `ALCHEMIX_HOW_IT_WORKS`.
//
// Colour points back to the card (rails-ops standards/detail-page-anatomy.md,
// "The disclosure ladder"): a figure the card above states is foreground (`H`),
// written in the card's format; one stated only here is muted.

import { ProseExplainer, H } from "@/lib/shared/explainer-prose";
import { Prov, type Provenance } from "@/components/shared/provenance";
import type { RedemptionNetTotal } from "@/lib/alchemix/redemption-net";
import { formatCompact } from "@/lib/shared/format-event";
import { formatNumber } from "@/lib/utils/format";
import type { AlchemixLiveState } from "@/types/api/alchemix";

const compact = (n: number) => formatCompact(n).display;
/** A signed figure that keeps its sign and size however small: a lifetime net
 *  of a few millionths reads as that, never as "−0.00". */
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatNumber(Math.abs(n))}`;

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
  /** The card's "Events alone" line states the debt the redemptions cleared. */
  clearedOnCard?: boolean;
}) {
  if (!live) return null;
  const sym = syntheticSymbol;
  const under = live.collateral.underlying;
  const underSym = under?.symbol ?? "the asset underneath";
  const netN = net?.total.netRaw != null ? Number(net.total.netRaw) / 1e18 : null;

  const lead =
    under && live.debt ? (
      <>
        This position holds{" "}
        <H>
          {compact(under.formatted)} {underSym}
        </H>{" "}
        of collateral against{" "}
        <H>
          {compact(live.debt.formatted)} {sym}
        </H>{" "}
        of debt:
      </>
    ) : live.debt ? (
      <>
        This position holds{" "}
        <H>
          {compact(live.collateral.formatted)} {mytSymbol}
        </H>{" "}
        of collateral against{" "}
        <H>
          {compact(live.debt.formatted)} {sym}
        </H>{" "}
        of debt:
      </>
    ) : null;

  const items = [
    <>
      The collateral is{" "}
      <H>
        {compact(live.collateral.formatted)} {mytSymbol}
      </H>
      , shares in{" "}
      {vaultHref ? (
        <a href={vaultHref} target="_blank" rel="noopener noreferrer" className="link">
          the {mytSymbol} vault
        </a>
      ) : (
        <>the {mytSymbol} vault</>
      )}
      , a Morpho Vault V2. The vault spreads the {underSym} deposited in it across several lending strategies, and what
      they earn or lose moves its share price, shown beside the Collateral figure. Every Collateral figure on the event
      cards below is this share count, in {mytSymbol}.
    </>,
    live.collateral.usd ? (
      <>
        At {underSym}&rsquo;s price of $
        {live.collateral.usd.pricePerUnit.toLocaleString("en-US", { maximumFractionDigits: 4 })}, that collateral is
        worth <H>${compact(live.collateral.usd.usd)}</H>.
      </>
    ) : null,
    <>The debt is owed in {sym}, the synthetic token this position minted against its collateral.</>,
    fall != null && live.debt ? (
      fall > 0 ? (
        <>
          Debt and collateral are both counted in {underSym}, so only a fall in the vault&rsquo;s share price can bring
          this position to its liquidation line: a fall of{" "}
          <H>{(fall * 100).toLocaleString("en-US", { maximumFractionDigits: fall < 0.01 ? 2 : 1 })}%</H> would do it.
        </>
      ) : (
        <>This position is at or below its liquidation line, so anyone can liquidate it.</>
      )
    ) : null,
    live.earmarked ? (
      <>
        <H>
          {compact(live.earmarked.formatted)} {sym}
        </H>{" "}
        of that debt is set aside for repayment: the line&rsquo;s Transmuter has claimed it as its stakers&rsquo;
        deposits matured, and the next redemption on the line clears it and takes {mytSymbol} worth it from the
        collateral, plus the line&rsquo;s redemption fee.
      </>
    ) : null,
    live.earmarked ? (
      <>The set-aside figure grows block by block between readings, so each one holds at the block it was read at.</>
    ) : null,
    // Where they cleared nothing, the timeline says so in their place.
    redemptions.stated > 0 && redemptions.cleared > 0 ? (
      <>
        Across the {redemptions.count} line redemptions on the timeline below, the line cleared{" "}
        {clearedOnCard ? (
          <H>
            {compact(redemptions.cleared)} {sym}
          </H>
        ) : (
          <>
            {formatNumber(redemptions.cleared)} {sym}
          </>
        )}{" "}
        of this position&rsquo;s debt
        {redemptions.taken != null ? (
          <>
            {" "}
            and took {formatNumber(redemptions.taken)} {mytSymbol} of its collateral
          </>
        ) : null}
        .
      </>
    ) : null,
    // The net for the holder, Liquity's redemption P/L, in the underlying.
    net && redemptions.stated > 0 && redemptions.cleared > 0 ? (
      netN != null && net.prov ? (
        <>
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
              The line&rsquo;s {(net.total.fee.bps / 100).toLocaleString("en-US")}% redemption fee, charged on every
              redemption and paid to Alchemix&rsquo;s fee receiver, is {signed(-Number(net.total.fee.valueRaw) / 1e18)}{" "}
              {net.underlyingSymbol} of it ({formatNumber(Number(net.total.fee.sharesRaw) / 1e18)} {mytSymbol}).
              {Math.abs(Number(net.total.restRaw) / 1e18) >= Math.abs(Number(net.total.fee.valueRaw) / 1e18) * 0.01 ? (
                <>
                  {" "}
                  The other {signed(Number(net.total.restRaw) / 1e18)} {net.underlyingSymbol} is how the Alchemist
                  charges a position: at the line&rsquo;s average shares per unit of debt across every redemption since
                  the position&rsquo;s own last event, while the share price moved between them.
                </>
              ) : null}
            </>
          ) : null}{" "}
          Each redemption&rsquo;s own net is in its card&rsquo;s detail.
        </>
      ) : net.total.missingPrice > 0 ? (
        <>
          {net.total.missingPrice} of those redemptions {net.total.missingPrice === 1 ? "has" : "have"} no share price
          read at {net.total.missingPrice === 1 ? "its" : "their"} block, so no net for the holder is given.
        </>
      ) : null
    ) : null,
    <>
      Each event card shows debt, collateral and set-aside before and after it. The before figure is the reading at the
      previous card&rsquo;s block, so the set-aside move includes what built up in between.
    </>,
  ].filter(Boolean);

  return <ProseExplainer paragraph={lead} items={items} />;
}
