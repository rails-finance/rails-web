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
import { AmountText } from "@/components/shared/amount-text";
import { fmtColl, fmtHealth, fmtPrice } from "@/lib/llamalend/event-figures";
import { formatDate } from "@/lib/date";
import { isLlamalendEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { LlamalendPositionView } from "./llamalend-position-card";
import type { LlamalendFactoryKind } from "@/lib/llamalend/asset-catalog";

export function LlamalendPositionExplanation({
  chain,
  liquidationCount,
  eventCount,
  lost,
  sold,
  factory,
  closed,
}: {
  /** The live chain read. Null until it lands (or for a closed account):
   *  nothing is narrated, and the pane still mounts so its foot controls draw. */
  chain: LlamalendChainResponse | null;
  /** Replayed hard-liquidation count from the index — lets an open survivor's
   *  narration state the two-axis fact. Omit to skip the bullet. */
  liquidationCount?: number;
  /** The card's event count (the count badge). Omit to skip. */
  eventCount?: number;
  /** Collateral lost to soft-liquidation over the position's life
   *  (llamalendLostToSoftLiq), where it can be stated. */
  lost?: number | null;
  /** Collateral the AMM has sold net of buy-backs, on a position in its bands
   *  now (llamalendSoldInBands). */
  sold?: number | null;
  /** The market's factory lineage, for the mint / lend line. */
  factory?: LlamalendFactoryKind | null;
  /** A closed position's story, from its events. */
  closed?: { view: LlamalendPositionView; events: BaseActivityEvent[] } | null;
}) {
  if (closed) return <ClosedExplanation view={closed.view} events={closed.events} factory={factory ?? null} />;
  if (!chain || chain.chainStale || !chain.hasLoan) return null;

  const unit = chain.borrowedIsCrvusd ? `${chain.borrowedSymbol} (~$1)` : chain.borrowedSymbol;
  // Above the whole band — the same predicate the card's band strip uses for
  // its state tail, so the two never disagree at the edge.
  const aboveBand = chain.priceOracle != null && chain.pUp != null && chain.priceOracle > chain.pUp;
  const bullets: React.ReactNode[] = [];

  if (chain.healthFull != null) {
    bullets.push(
      <span key="health-full">
        Health is <H>{fmtHealth(chain.healthFull)}</H>. It compares what the collateral would be worth with the price
        through the bottom band, less the{" "}
        {chain.liquidationDiscount != null ? <>{pct(chain.liquidationDiscount)} </> : null}liquidation discount, with
        the debt{aboveBand ? "; while the price is above the bands, the distance adds to it" : ""}. Below 0 anyone may
        liquidate the position. It falls as the price moves down through the bands, as interest adds to the debt, and
        with each loss on the AMM&rsquo;s sales.{" "}
        {aboveBand ? (
          <>Interest also raises the band prices, which shortens the distance.</>
        ) : chain.inSoftLiq ? (
          <>
            Inside the bands a rising price does not lift it: the AMM buys the collateral back, and each round
            trip&rsquo;s loss lowers it.
          </>
        ) : null}
      </span>,
    );
  }

  // Below 0 with nothing left to make a liquidator whole: what taking the
  // position would pay and return (Controller _liquidate: the liquidator repays
  // the debt and receives the collateral and the converted token).
  if (chain.healthFull != null && chain.healthFull < 0 && chain.debt != null && chain.priceOracle != null) {
    const coll = chain.collateral ?? 0;
    const conv = chain.converted ?? 0;
    const back = coll * chain.priceOracle + conv;
    const short = chain.debt - back;
    if (short > 0) {
      bullets.push(
        <span key="shortfall">
          A liquidator taking the whole position would repay{" "}
          <H>
            {formatNumber(chain.debt)} {chain.borrowedSymbol}
          </H>{" "}
          of debt and receive{" "}
          {conv > 0 ? (
            <>
              the{" "}
              <H>
                {formatNumber(conv)} {chain.borrowedSymbol}
              </H>{" "}
              the AMM holds
            </>
          ) : null}
          {conv > 0 ? " and " : null}
          {coll > 0 ? (
            <>
              <H>
                {fmtColl(coll)} {chain.collateralSymbol}
              </H>{" "}
              (worth {formatNumber(coll * chain.priceOracle)} {chain.borrowedSymbol} at the oracle price)
            </>
          ) : (
            <>0 {chain.collateralSymbol}</>
          )}
          : <H>{formatNumber(short)}</H> {chain.borrowedSymbol} less than it pays. The contract obliges no one to
          liquidate: any address may, and a liquidator acts when it gains.
          {factory === "oneway" ? (
            <>
              {" "}
              Curve&rsquo;s docs call a shortfall like this{" "}
              <a
                href={BAD_DEBT_DOC_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                bad debt
              </a>
              : the lenders in this market are exposed to it.
            </>
          ) : null}
        </span>,
      );
    }
  }

  bullets.push(
    <span key="isolated">
      It sits in one of LlamaLend&rsquo;s isolated markets: this pair alone decides its fate, whatever the same address
      holds elsewhere.
    </span>,
  );

  if (chain.pUp != null && chain.pDown != null) {
    bullets.push(
      <span key="band">
        The collateral spreads across <H>{chain.bands}</H> price bands, from <H>{fmtPrice(chain.pUp)}</H> down to{" "}
        <H>{fmtPrice(chain.pDown)}</H> {unit}
        {chain.n1 != null && chain.n2 != null ? (
          <>
            , bands {chain.n1}…{chain.n2} (a higher band number is a lower price)
          </>
        ) : null}
        . Soft-liquidation begins at the top of that range and completes at its bottom. Band prices rise over time with
        the market&rsquo;s interest, by the same multiplier that grows the debt, so the same bands price higher than
        when the loan was placed in them.
      </span>,
    );
  }

  if (chain.health != null && chain.pUp != null) {
    bullets.push(
      <span key="health">
        The oracle price stands at <H>{chain.priceOracle != null ? fmtPrice(chain.priceOracle) : "—"}</H> {unit},{" "}
        <H>{chain.health.toFixed(3)}×</H> the soft-liquidation onset price.{" "}
        {chain.health >= 1 ? (
          <>
            A fall of about {Math.round((1 - 1 / chain.health) * 100)}% would put the position inside its band and begin
            conversion.
            {chain.healthFull != null ? (
              <>
                {" "}
                That distance runs to the start of soft-liquidation; health reaches 0 further down, and the losses in
                the bands bring it nearer.
              </>
            ) : null}
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
        The AMM has converted{" "}
        <H>
          <AmountText value={chain.converted} /> {chain.borrowedSymbol}
        </H>{" "}
        of this position&rsquo;s collateral.{" "}
        {chain.fullyConverted ? (
          <>Nothing remains as {chain.collateralSymbol}.</>
        ) : (
          <>
            If the price rises, the AMM buys {chain.collateralSymbol} back with it. The swap reverses; the losses do
            not: each sale is below the oracle price and each buy-back above it.
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
          <AmountText value={chain.converted ?? 0} /> {chain.borrowedSymbol}
        </H>{" "}
        of this position&rsquo;s collateral{aboveBand ? ", because the price sits above the band" : ""}, and only
        interest accrues, second by second.
      </span>,
    );
  }

  if (sold != null && sold > 0 && chain.converted != null) {
    bullets.push(
      <span key="sold">
        Sold by the AMM and not bought back:{" "}
        <H>
          {fmtColl(sold)} {chain.collateralSymbol}
        </H>
        , what was deposited less what was withdrawn and what is held now. The{" "}
        <H>
          <AmountText value={chain.converted} /> {chain.borrowedSymbol}
        </H>{" "}
        converted is what the AMM holds for it.
      </span>,
    );
  }

  const kindLine = marketKindLine(factory, chain.borrowedSymbol);
  if (kindLine) bullets.push(<span key="market-kind">{kindLine}</span>);

  if (lost != null && lost > 0) {
    bullets.push(
      <span key="lost">
        Lost to soft-liquidation over its life:{" "}
        <H>
          {fmtColl(lost)} {chain.collateralSymbol}
        </H>
        , sold by the AMM while the price sat in the bands and not bought back. It is what was deposited, less what was
        withdrawn and what is held now.
      </span>,
    );
  }

  bullets.push(
    <span key="mechanics">
      Liquidation here happens in two stages. <H>Soft</H> liquidation converts collateral while the price is inside the
      bands, with no event and no liquidator; when the price rises the AMM buys the collateral back, and the losses on
      each round trip stay. <H>Hard</H> liquidation needs health below 0: anyone may then repay the debt, in full or in
      part, and take the {chain.collateralSymbol} and {chain.borrowedSymbol} the position holds.
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
      of debt
      {chain.healthFull != null && chain.healthFull < 0
        ? ", and anyone may liquidate it now"
        : chain.inSoftLiq
          ? ", and is in soft-liquidation right now"
          : ""}
      :
    </>
  );

  return <ProseExplainer paragraph={lead} items={bullets} />;
}

const pct = (fraction: number): string => `${(fraction * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

const BAD_DEBT_DOC_URL = "https://docs.curve.finance/user/llamalend/bad-debt/";

/** The market kind in one sentence (mint or lend). */
function marketKindLine(factory: LlamalendFactoryKind | null | undefined, borrowedSymbol: string): React.ReactNode {
  if (factory === "crvusd") {
    return (
      <>
        This is a mint market: the {borrowedSymbol} is minted against the loan by Curve&rsquo;s crvUSD system, up to the
        market&rsquo;s debt ceiling. The rate moves with crvUSD&rsquo;s price and the size of the Peg Stabilization
        Reserve. The interest goes to Curve: the Controller sends it to the factory&rsquo;s fee receiver, a splitter
        that pays the scrvUSD savings vault and the DAO&rsquo;s fee collector, which distributes to veCRV lockers.
      </>
    );
  }
  if (factory === "oneway") {
    return (
      <>
        This is a lend market: the {borrowedSymbol} is lent from a vault of lenders&rsquo; deposits, all the interest
        goes to those lenders, and in most markets the rate rises with the share of the vault that is lent; /markets
        names those where it follows time alone.
      </>
    );
  }
  return null;
}

/** Where one row's stated collateral, less what it moved, sits below the
 *  balance the previous row stated: the AMM sold that much in between. */
function ammSalesBetweenRows(rows: BaseActivityEvent[]) {
  const out: { from: BaseActivityEvent; to: BaseActivityEvent; sold: number }[] = [];
  let prev: { after: number; ev: BaseActivityEvent } | null = null;
  for (const ev of rows) {
    if (!isLlamalendEvent(ev)) continue;
    const c = ev.context.data;
    if (c.collateralAfter == null) {
      if (Number(c.collateralDelta ?? 0) !== 0) prev = null;
      continue;
    }
    const after = Number(c.collateralAfter);
    const before = after - Number(c.collateralDelta ?? 0);
    if (prev && prev.after - before > Math.max(prev.after * 1e-9, 1e-12)) {
      out.push({ from: prev.ev, to: ev, sold: prev.after - before });
    }
    prev = { after, ev };
  }
  return out;
}

/** A closed position: when it opened and closed, and each hard liquidation's
 *  figures, from its events. */
function ClosedExplanation({
  view,
  events,
  factory,
}: {
  view: LlamalendPositionView;
  events: BaseActivityEvent[];
  factory: LlamalendFactoryKind | null;
}) {
  const rows = events
    .filter(isLlamalendEvent)
    .filter((e) => e.context.data.role !== "liquidator")
    .sort((a, b) => a.blockNumber - b.blockNumber);
  if (rows.length === 0) return null;
  const liqs = rows.filter(
    (e) =>
      e.context.data.eventType === "liquidation" && !e.context.data.selfLiquidation && e.context.data.role !== "self",
  );
  const cSym = view.collateralSymbol;
  const bSym = view.borrowedSymbol;
  const bullets: React.ReactNode[] = [
    <span key="span">
      It opened on {formatDate(rows[0].timestamp)} and closed on {formatDate(rows[rows.length - 1].timestamp)}.
    </span>,
  ];
  const abs = (h?: string) => Math.abs(Number(h ?? 0));
  if (liqs.length === 0 && view.status !== "liquidated") {
    const sales = ammSalesBetweenRows(rows);
    bullets.push(<span key="never-liquidated">It was never hard-liquidated.</span>);
    for (const w of sales) {
      bullets.push(
        <span key={`sold-${w.to.id}`}>
          Between {formatDate(w.from.timestamp)} and {formatDate(w.to.timestamp)} the AMM sold{" "}
          <H>
            {fmtColl(w.sold)} {cSym}
          </H>{" "}
          while the price sat in the bands, and the buy-back did not restore it.
        </span>,
      );
    }
  }
  liqs.forEach((e, i) => {
    const c = e.context.data;
    const conv = abs(c.convertedTaken);
    const nth =
      liqs.length === 1
        ? "The liquidation"
        : i === 0
          ? "The first"
          : i === liqs.length - 1
            ? "The last"
            : `Liquidation ${i + 1}`;
    const rest = i > 0 && liqs.length > 1 && i === liqs.length - 1;
    bullets.push(
      <span key={e.id}>
        {nth}, on {formatDate(e.timestamp)}, cleared {rest ? "the rest of the debt, " : ""}
        <H>
          {formatNumber(abs(c.debtDelta))} {bSym}
        </H>
        {rest ? "," : " of debt"} and took{" "}
        <H>
          {fmtColl(abs(c.collateralDelta))} {cSym}
        </H>
        {conv > 0 ? (
          <>
            {" "}
            and{" "}
            <H>
              {formatNumber(conv)} {bSym}
            </H>{" "}
            the AMM had converted
          </>
        ) : null}
        .
      </span>,
    );
  });
  const kindLine = marketKindLine(factory, bSym);
  if (kindLine) bullets.push(<span key="market-kind">{kindLine}</span>);
  const firstPartial = liqs.length > 1 && liqs[0].context.data.collateralAfter == null;
  const lead =
    view.status === "liquidated" && liqs.length > 0 ? (
      <>
        This position was liquidated {liqs.length === 1 ? "once" : liqs.length === 2 ? "twice" : `${liqs.length} times`}
        {firstPartial ? "; the first took part of the loan, and the last cleared what was left" : ""}:
      </>
    ) : (
      <>This position is closed: its debt is 0 and it holds no collateral:</>
    );
  return <ProseExplainer paragraph={lead} items={bullets} />;
}
