"use client";

// The Alchemist position card's Explanation pane, and the one for the panel
// of stored figures below it.
// ----------------------------------------------------------------------------
// THE CAVEATS THAT HOLD FOR EVERY EVENT CARD LIVE HERE, said once: collateral
// is a vault share count, set-aside is debt the Transmuter has claimed and
// grows block by block, and each card's before figure is the reading at the
// previous card's block. The event cards' bullets are then about their own
// event (rails-ops standards/explanation-copy-charter §4). The protocol's
// mechanic sits one click further, in `ALCHEMIX_HOW_IT_WORKS`.
//
// Bold only what the card above states (the charter's highlight rule).

import Link from "next/link";
import { ProseExplainer, H } from "@/lib/shared/explainer-prose";
import { Prov, type Provenance } from "@/components/shared/provenance";
import type { RedemptionNetTotal } from "@/lib/alchemix/redemption-net";
import { formatCompact } from "@/lib/shared/format-event";
import type { AlchemixLiveState } from "@/types/api/alchemix";

const compact = (n: number) => formatCompact(n).display;
const block = (n: number) => n.toLocaleString("en-US");
const two = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
          {(fall * 100).toLocaleString("en-US", { maximumFractionDigits: fall < 0.01 ? 2 : 1 })}% would do it.
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
        deposits matured, and the next redemption on the line clears it and takes a matching amount of {mytSymbol} from
        the collateral.
      </>
    ) : null,
    live.earmarked ? (
      <>The set-aside figure grows block by block between readings, so each one holds at the block it was read at.</>
    ) : null,
    // Where they cleared nothing, the timeline says so in their place.
    redemptions.stated > 0 && redemptions.cleared > 0 ? (
      <>
        Across the {redemptions.count} line redemptions on the timeline below, the Transmuter cleared{" "}
        {two(redemptions.cleared)} {sym} of this position&rsquo;s debt
        {redemptions.taken != null ? (
          <>
            {" "}
            and took {two(redemptions.taken)} {mytSymbol} of its collateral
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
            <H>
              {netN > 0 ? "+" : netN < 0 ? "−" : ""}
              {two(Math.abs(netN))} {net.underlyingSymbol}
            </H>
          </Prov>{" "}
          for the holder
          {netN < 0
            ? ": the collateral taken was worth that much more than the debt cleared."
            : netN > 0
              ? ": the debt cleared was worth that much more than the collateral taken."
              : "."}{" "}
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

/** The pane on the panel of stored figures: what that panel is, and where every
 *  line's figures are described. */
export function AlchemixStoredPanelExplanation({
  storedBlock,
  linesHref,
}: {
  storedBlock: number | null;
  linesHref: string;
}) {
  const items = [
    storedBlock != null ? (
      <>
        These are the last figures this explorer stored for the position, read at block {block(storedBlock)}. The card
        above reads the contract again each time the page opens.
      </>
    ) : (
      <>These are the last figures this explorer stored for the position. The card above reads the contract again.</>
    ),
    <>
      Debt and collateral match between the two until the position acts or the line redeems again. Set-aside grows block
      by block, so it differs by what built up between the two blocks.
    </>,
    <>
      <Link href={linesHref} className="link">
        Every Alchemix line on this chain
      </Link>
      , and how each one&rsquo;s figures are read.
    </>,
  ];
  return <ProseExplainer items={items} />;
}
