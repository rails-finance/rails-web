"use client";

// Plain-language, data-driven explanation of a LlamaLend position — built
// straight from the live chain response (user_state legs, the band from the
// exact integer math, the AMM's own oracle): a few neutral bullets describing
// what the position holds, where the price stands against its band, whether
// the AMM is converting right now, and how liquidation works here (soft — a
// state, then hard — an event). Rendered inside the position card's
// Explanation heading-button via the card's `explanation` prop.
//
// Every figure here is the same chain-state values shown (and <Prov>-traced) on the
// cards around it — this panel only narrates it. Third person throughout;
// only the mode present is described.

import type { LlamalendChainResponse } from "@/lib/api/fetch-llamalend-position";
import { formatNumber } from "@/lib/utils/format";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";

export function LlamalendPositionExplanation({
  chain,
  liquidationCount,
  eventCount,
}: {
  /** The live chain read. Null until it lands (or for a closed account):
   *  nothing is narrated, and the pane still mounts so its foot controls draw. */
  chain: LlamalendChainResponse | null;
  /** Replayed hard-liquidation count from the index — lets an open survivor's
   *  narration state the two-axis fact. Omit to skip the bullet. */
  liquidationCount?: number;
  /** The card's event count (the count badge). Omit to skip. */
  eventCount?: number;
}) {
  if (!chain || chain.chainStale || !chain.hasLoan) return null;

  const unit = chain.borrowedIsCrvusd ? `${chain.borrowedSymbol} (~$1)` : chain.borrowedSymbol;
  // Above the whole band — the same predicate the card's band strip uses for
  // its state tail, so the two never disagree at the edge.
  const aboveBand = chain.priceOracle != null && chain.pUp != null && chain.priceOracle > chain.pUp;
  const bullets: React.ReactNode[] = [];

  bullets.push(
    <span key="isolated">
      It sits in one of LlamaLend&rsquo;s isolated markets: this pair alone decides its fate, whatever the same address
      holds elsewhere.
    </span>,
  );

  if (chain.pUp != null && chain.pDown != null) {
    bullets.push(
      <span key="band">
        The collateral spreads across <H>{chain.bands}</H> price bands, from <H>{formatNumber(chain.pUp)}</H> down to{" "}
        <H>{formatNumber(chain.pDown)}</H> {unit}. Soft-liquidation begins at the top of that range and completes at its
        bottom.
      </span>,
    );
  }

  if (chain.health != null && chain.pUp != null) {
    bullets.push(
      <span key="health">
        The oracle price stands at <H>{chain.priceOracle != null ? formatNumber(chain.priceOracle) : "—"}</H> {unit},{" "}
        <H>{chain.health.toFixed(3)}×</H> the soft-liquidation onset price.{" "}
        {chain.health >= 1 ? (
          <>
            A fall of about {Math.round((1 - 1 / chain.health) * 100)}% would put the position inside its band and begin
            conversion.
          </>
        ) : (
          <>The price is already inside or beneath the band.</>
        )}
      </span>,
    );
  }

  if (chain.inSoftLiq && chain.converted != null) {
    bullets.push(
      <span key="softliq">
        The AMM has already converted{" "}
        <H>
          {formatNumber(chain.converted)} {chain.borrowedSymbol}
        </H>{" "}
        of this position&rsquo;s collateral.{" "}
        {chain.fullyConverted ? (
          <>Nothing remains as {chain.collateralSymbol}, and a hard liquidation can now be triggered.</>
        ) : (
          <>
            Soft-liquidation is in progress: if the price recovers, the AMM converts it back into{" "}
            {chain.collateralSymbol}, and each pass through the band costs a little to fees and arbitrage.
          </>
        )}
      </span>,
    );
  } else {
    bullets.push(
      // Reverse-completeness (copy charter §3): the card's chrome now carries
      // `Converted: 0 <borrowed>` outside soft-liquidation, so the pane states
      // that figure — bold — instead of only its meaning in words. The reason
      // clause is conditional because a price that has just entered the band
      // but not yet been traded against also reads zero converted: there the
      // clause would be false, so it is simply absent (charter §4).
      <span key="no-softliq">
        The AMM has converted{" "}
        <H>
          {formatNumber(chain.converted ?? 0)} {chain.borrowedSymbol}
        </H>{" "}
        of this position&rsquo;s collateral{aboveBand ? ", because the price sits above the band" : ""}. The collateral
        is intact, and only interest accrues, second by second.
      </span>,
    );
  }

  bullets.push(
    <span key="mechanics">
      Liquidation here happens in two stages. <H>Soft</H>-liquidation converts collateral continuously while the price
      is inside the band, reversibly and with no event and no liquidator. <H>Hard</H> liquidation arms once losses push
      the position&rsquo;s health below zero: anyone may then clear it in one transaction, taking whatever mix of{" "}
      {chain.collateralSymbol} and {chain.borrowedSymbol} remains.
    </span>,
  );

  if (liquidationCount != null && liquidationCount > 0) {
    bullets.push(
      <span key="survivor">
        This position has already been hard-liquidated <H>{liquidationCount}</H> time
        {liquidationCount === 1 ? "" : "s"} and holds an open loan again: a liquidation is an event in a
        position&rsquo;s history here, not the end of it.
      </span>,
    );
  }

  if (eventCount != null && eventCount > 0) {
    bullets.push(
      <span key="event-count">
        The position has recorded <H>{eventCount}</H> event{eventCount === 1 ? "" : "s"} to date.
      </span>,
    );
  }

  // Subject-first, one sentence, two figures, colon-terminated (charter §4);
  // the verdict rides the lead when the position is in soft-liquidation.
  const lead = (
    <>
      This position holds{" "}
      <H>
        {chain.collateral != null ? formatNumber(chain.collateral) : "—"} {chain.collateralSymbol}
      </H>{" "}
      as collateral against{" "}
      <H>
        {chain.debt != null ? formatNumber(chain.debt) : "—"} {chain.borrowedSymbol}
      </H>{" "}
      of debt{chain.inSoftLiq ? ", and is in soft-liquidation right now" : ""}:
    </>
  );

  return <ProseExplainer paragraph={lead} items={bullets} />;
}
