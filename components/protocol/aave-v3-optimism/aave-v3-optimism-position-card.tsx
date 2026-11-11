"use client";

// An Aave V3 account on Optimism (rails-ops ui-jobs 578), on the shared position
// card: Supplied, Debt, Health factor and Room to borrow as headlines; each
// supplied reserve in the left column and each borrowed one in the right, with
// its amount, dollars at Aave's oracle, liquidation threshold or borrow rate, and
// interest over the last 30 days. Every figure is read when the page opens; the
// read stamp names the blocks.

import { Prov } from "@/components/shared/provenance";
import { PositionCard, type PositionCardSlots, type PositionPanelRow } from "@/components/shared/position-card";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { PoolReadStamp } from "@/components/protocol/uniswap/uniswap-readout";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { OPTIMISM_CHAIN_ID } from "@/lib/shared/chains";
import { opPosition, type OpInterest, type OpReserveFigures } from "@/lib/aave-v3-optimism/position";
import { opCardProv, opReserveProv, readContracts, type OpReceiptContext } from "@/lib/aave-v3-optimism/provenance";
import type { OpPositionRead } from "@/lib/aave-v3-optimism/types";
import { amount, CARD_WORDS, cardExplainer, hfText, pctText, usd } from "@/lib/aave-v3-optimism/words";

function interestValue(c: OpReceiptContext, x: OpReserveFigures, side: "supply" | "debt", i: OpInterest) {
  if (i.state !== "ok")
    return (
      <span className="text-xs text-rb-500" data-interest-withheld={i.state}>
        {CARD_WORDS.withheld[i.state]}
      </span>
    );
  return (
    <span data-figure={`interest-${side}-${x.symbol}`}>
      <Prov info={opReserveProv(side === "supply" ? "interest-supply" : "interest-debt", c, x)}>
        {amount(i.amount, x.symbol)}
      </Prov>
      {i.usd != null && (
        <span className="text-rb-500">
          {" · "}
          <Prov info={opReserveProv(side === "supply" ? "usd-interest-supply" : "usd-interest-debt", c, x)}>
            {usd(i.usd)}
          </Prov>
        </span>
      )}
    </span>
  );
}

/** One supplied reserve: amount · dollars · threshold, then its rate and 30-day interest. */
function supplyRow(c: OpReceiptContext, x: OpReserveFigures): PositionPanelRow {
  return {
    id: `supplied-${x.symbol}`,
    label: CARD_WORDS.supplyRow(x.symbol),
    sub: x.isCollateral ? CARD_WORDS.collateralFlag : CARD_WORDS.notCollateral,
    tip: CARD_WORDS.interestTip,
    asset: { symbol: x.symbol, address: x.asset },
    value: (
      <span data-figure={`supplied-${x.symbol}`}>
        <Prov info={opReserveProv("supplied", c, x)}>{amount(x.supplied, x.symbol)}</Prov>
        <span className="text-rb-500">
          {" · "}
          {x.suppliedUsd == null ? (
            CARD_WORDS.unpriced
          ) : (
            <Prov info={opReserveProv("usd-supplied", c, x)}>{usd(x.suppliedUsd)}</Prov>
          )}
          {x.isCollateral && x.liquidationThreshold != null && (
            <>
              {` · ${CARD_WORDS.thresholdLabel} `}
              <Prov info={opReserveProv("threshold", c, x)}>{pctText(x.liquidationThreshold, 0)}</Prov>
            </>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-rb-500">
          {CARD_WORDS.supplyRateLabel} <Prov info={opReserveProv("supply-rate", c, x)}>{pctText(x.supplyApr)}</Prov>
        </span>
        {x.supplyInterest && (
          <span className="mt-0.5 block text-xs text-rb-500">
            {CARD_WORDS.interest30} {interestValue(c, x, "supply", x.supplyInterest)}
          </span>
        )}
      </span>
    ),
  };
}

/** One borrowed reserve: amount · dollars, then its rate and 30-day interest. */
function debtRow(c: OpReceiptContext, x: OpReserveFigures): PositionPanelRow {
  return {
    id: `debt-${x.symbol}`,
    label: CARD_WORDS.debtRow(x.symbol),
    tip: CARD_WORDS.rateTip,
    asset: { symbol: x.symbol, address: x.asset },
    value: (
      <span data-figure={`debt-${x.symbol}`}>
        <Prov info={opReserveProv("debt", c, x)}>{amount(x.debt, x.symbol)}</Prov>
        <span className="text-rb-500">
          {" · "}
          {x.debtUsd == null ? (
            CARD_WORDS.unpriced
          ) : (
            <Prov info={opReserveProv("usd-debt", c, x)}>{usd(x.debtUsd)}</Prov>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-rb-500">
          {CARD_WORDS.rateLabel} <Prov info={opReserveProv("borrow-rate", c, x)}>{pctText(x.borrowApr)}</Prov>
        </span>
        {x.debtInterest && (
          <span className="mt-0.5 block text-xs text-rb-500">
            {CARD_WORDS.interest30} {interestValue(c, x, "debt", x.debtInterest)}
          </span>
        )}
      </span>
    ),
  };
}

function slots(r: OpPositionRead): PositionCardSlots {
  const p = opPosition(r);
  const c: OpReceiptContext = { p, r };
  return {
    surface: "detail",
    heading: CARD_WORDS.heading,
    status: null,
    identity: p.emode ? (
      <span className="text-xs font-semibold text-rb-500" data-emode={p.emode.id}>
        {CARD_WORDS.emode(p.emode.label)}
      </span>
    ) : null,
    heads: [
      {
        id: "supplied",
        label: CARD_WORDS.supplied,
        labelTip: CARD_WORDS.suppliedTip,
        value: p.supplied.length ? <Prov info={opCardProv("supplied-total", c)}>{usd(p.suppliedUsd)}</Prov> : null,
      },
      {
        id: "debt",
        label: CARD_VOCAB.debt,
        labelTip: CARD_WORDS.debtTip,
        value: p.borrowed.length ? <Prov info={opCardProv("debt-total", c)}>{usd(p.debtUsd)}</Prov> : null,
      },
      {
        id: "health-factor",
        label: CARD_WORDS.health,
        labelTip: CARD_WORDS.healthTip,
        value:
          p.healthFactor != null ? (
            <Prov info={opCardProv("health", c)}>{hfText(p.healthFactor)}</Prov>
          ) : (
            <span className="text-rb-500">{CARD_WORDS.noDebt}</span>
          ),
      },
      {
        id: "borrow-room",
        label: CARD_WORDS.room,
        labelTip: CARD_WORDS.roomTip,
        value: p.collateralUsd > 0 ? <Prov info={opCardProv("room", c)}>{usd(p.roomToBorrowUsd)}</Prov> : null,
      },
    ],
    counters: null,
    menu: { exports: null },
    stamp: (
      <PoolReadStamp
        chainId={OPTIMISM_CHAIN_ID}
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

export function AaveV3OptimismPositionCard({ r }: { r: OpPositionRead }) {
  return (
    <div
      data-position-card={`aave-v3-optimism:${r.wallet}`}
      data-pool={r.pool}
      data-live-block={r.head.block}
      data-then-block={r.then.block}
    >
      <PositionCard slots={slots(r)} />
    </div>
  );
}
