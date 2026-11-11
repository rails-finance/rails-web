"use client";

// An Aave V4 spoke account on Arc (rails-ops ui-jobs 577), on the shared
// position card: Supplied, Debt, Health factor and Borrow limit as headlines;
// each supplied reserve in the left column and each borrowed one in the right,
// with its amount, dollars at the spoke's oracle, collateral factor or borrow
// rate, and interest over the last 30 days. Every figure is read when the page
// opens; the read stamp names the blocks.

import { Prov } from "@/components/shared/provenance";
import { PositionCard, type PositionCardSlots, type PositionPanelRow } from "@/components/shared/position-card";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { PoolReadStamp } from "@/components/protocol/uniswap/uniswap-readout";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { ARC_CHAIN_ID } from "@/lib/shared/chains";
import { arcPosition, type ArcInterest, type ArcReserveFigures } from "@/lib/aave-v4-arc/position";
import { arcCardProv, arcReserveProv, readContracts, type ArcReceiptContext } from "@/lib/aave-v4-arc/provenance";
import type { ArcPositionRead } from "@/lib/aave-v4-arc/types";
import { amount, CARD_WORDS, cardExplainer, hfText, pctText, usd } from "@/lib/aave-v4-arc/words";

function interestValue(c: ArcReceiptContext, x: ArcReserveFigures, side: "supply" | "debt", i: ArcInterest) {
  if (i.state !== "ok")
    return (
      <span className="text-xs text-rb-500" data-interest-withheld={i.state}>
        {CARD_WORDS.withheld[i.state]}
      </span>
    );
  return (
    <span data-figure={`interest-${side}-${x.symbol}`}>
      <Prov info={arcReserveProv(side === "supply" ? "interest-supply" : "interest-debt", c, x)}>
        {amount(i.amount, x.symbol)}
      </Prov>
      {i.usd != null && (
        <span className="text-rb-500">
          {" · "}
          <Prov info={arcReserveProv(side === "supply" ? "usd-interest-supply" : "usd-interest-debt", c, x)}>
            {usd(i.usd)}
          </Prov>
        </span>
      )}
    </span>
  );
}

/** One supplied reserve: amount · dollars · factor, then its 30-day interest. */
function supplyRow(c: ArcReceiptContext, x: ArcReserveFigures): PositionPanelRow {
  return {
    id: `supplied-${x.symbol}`,
    label: CARD_WORDS.supplyRow(x.symbol),
    sub: x.isCollateral ? CARD_WORDS.collateralFlag : CARD_WORDS.notCollateral,
    tip: CARD_WORDS.interestTip,
    asset: { symbol: x.symbol, address: x.underlying },
    value: (
      <span data-figure={`supplied-${x.symbol}`}>
        <Prov info={arcReserveProv("supplied", c, x)}>{amount(x.supplied, x.symbol)}</Prov>
        <span className="text-rb-500">
          {" · "}
          {x.suppliedUsd == null ? (
            CARD_WORDS.unpriced
          ) : (
            <Prov info={arcReserveProv("usd-supplied", c, x)}>{usd(x.suppliedUsd)}</Prov>
          )}
          {x.isCollateral && x.collateralFactor != null && (
            <>
              {" · factor "}
              <Prov info={arcReserveProv("collateral-factor", c, x)}>{pctText(x.collateralFactor, 0)}</Prov>
            </>
          )}
        </span>
        {x.supplyInterest && (
          <span className="mt-0.5 block text-xs text-rb-500">
            {CARD_WORDS.interest30.earned} {interestValue(c, x, "supply", x.supplyInterest)}
          </span>
        )}
      </span>
    ),
  };
}

/** One borrowed reserve: amount · dollars, then its rate and 30-day interest. */
function debtRow(c: ArcReceiptContext, x: ArcReserveFigures): PositionPanelRow {
  return {
    id: `debt-${x.symbol}`,
    label: CARD_WORDS.debtRow(x.symbol),
    tip: CARD_WORDS.borrowRateTip(c.p.riskPremium),
    asset: { symbol: x.symbol, address: x.underlying },
    value: (
      <span data-figure={`debt-${x.symbol}`}>
        <Prov info={arcReserveProv("debt", c, x)}>{amount(x.debt, x.symbol)}</Prov>
        <span className="text-rb-500">
          {" · "}
          {x.debtUsd == null ? (
            CARD_WORDS.unpriced
          ) : (
            <Prov info={arcReserveProv("usd-debt", c, x)}>{usd(x.debtUsd)}</Prov>
          )}
        </span>
        {x.drawnApr != null && (
          <span className="mt-0.5 block text-xs text-rb-500">
            {CARD_WORDS.rateLabel} <Prov info={arcReserveProv("borrow-rate", c, x)}>{pctText(x.drawnApr)}</Prov>
          </span>
        )}
        {x.debtInterest && (
          <span className="mt-0.5 block text-xs text-rb-500">
            {CARD_WORDS.interest30.owed} {interestValue(c, x, "debt", x.debtInterest)}
          </span>
        )}
      </span>
    ),
  };
}

function slots(r: ArcPositionRead): PositionCardSlots {
  const p = arcPosition(r);
  const c: ArcReceiptContext = { p, r };
  return {
    surface: "detail",
    heading: CARD_WORDS.heading,
    status: null,
    identity: <span className="text-xs font-semibold text-rb-500">{r.spoke.name} spoke</span>,
    heads: [
      {
        id: "supplied",
        label: CARD_WORDS.supplied,
        labelTip: CARD_WORDS.suppliedTip,
        value: p.supplied.length ? <Prov info={arcCardProv("supplied-total", c)}>{usd(p.suppliedUsd)}</Prov> : null,
      },
      {
        id: "debt",
        label: CARD_VOCAB.debt,
        labelTip: CARD_WORDS.debtTip,
        value: p.borrowed.length ? <Prov info={arcCardProv("debt-total", c)}>{usd(p.debtUsd)}</Prov> : null,
      },
      {
        id: "health-factor",
        label: CARD_WORDS.health,
        labelTip: CARD_WORDS.healthTip,
        value:
          p.healthFactor != null ? (
            <Prov info={arcCardProv("health", c)}>{hfText(p.healthFactor)}</Prov>
          ) : (
            <span className="text-rb-500">{CARD_WORDS.noDebt}</span>
          ),
      },
      {
        id: "borrow-limit",
        label: CARD_WORDS.borrowLimit,
        labelTip: CARD_WORDS.borrowLimitTip,
        value: p.collateralUsd > 0 ? <Prov info={arcCardProv("borrow-limit", c)}>{usd(p.borrowLimitUsd)}</Prov> : null,
      },
    ],
    counters: null,
    menu: { exports: null },
    stamp: (
      <PoolReadStamp
        chainId={ARC_CHAIN_ID}
        head={r.head}
        then={r.then}
        contracts={readContracts(r)}
        what="Every figure on this card"
      />
    ),
    explainer: {
      body: (
        <div data-position-explanation="">
          {cardExplainer(p).map((g) => (
            <ExplainGroup key={g.title} title={g.title}>
              {g.bullets.map((b, i) => (
                <ExplainBullet key={i}>{b}</ExplainBullet>
              ))}
            </ExplainGroup>
          ))}
        </div>
      ),
    },
    learnMore: null,
    foot: <p className="mt-3 text-xs text-rb-500">{CARD_WORDS.foot}</p>,
    panel: [p.supplied.map((x) => supplyRow(c, x)), p.borrowed.map((x) => debtRow(c, x))],
  };
}

export function AaveV4ArcPositionCard({ r }: { r: ArcPositionRead }) {
  return (
    <div
      data-position-card={`aave-v4-arc:${r.spoke.key}:${r.wallet}`}
      data-spoke={r.spoke.address}
      data-live-block={r.head.block}
      data-then-block={r.then.block}
    >
      <PositionCard slots={slots(r)} />
    </div>
  );
}
