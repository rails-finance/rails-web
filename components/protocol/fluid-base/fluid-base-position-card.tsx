"use client";

// A Fluid vault position on Base (rails-ops ui-jobs 574), on the shared
// position card. The headlines are the Ethereum card's (fluidCardSlots in
// components/protocol/fluid/fluid-position-card.tsx): Collateral, Debt and the
// Position ratio, with Borrow rate, Room to the borrow limit and Liquidates
// above in the panel. New here: each side's dollar value at Aave V3 Base's
// oracle where Aave prices it, and each side's interest over the last 30 days.
// Every figure is read when the page opens; the read stamp names the blocks.

import { Prov } from "@/components/shared/provenance";
import { AssetAmount } from "@/components/shared/asset-amount";
import {
  PositionCard,
  type PositionCardHead,
  type PositionCardSlots,
  type PositionPanelRow,
} from "@/components/shared/position-card";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { PoolReadStamp } from "@/components/protocol/uniswap/uniswap-readout";
import { pct } from "@/components/shared/ratio-bar";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { fluidBasePosition, type FluidBasePosition } from "@/lib/fluid-base/position";
import { fluidBaseProv, readContracts, type FluidBaseReceiptContext } from "@/lib/fluid-base/provenance";
import type { FluidBasePositionRead } from "@/lib/fluid-base/types";
import { amount, CARD_WORDS, cardExplainer, usd } from "@/lib/fluid-base/words";

/** Every figure's read stamp on a Fluid Base page. */
export function FluidBaseReadStamp({ c, what }: { c: FluidBaseReceiptContext; what: string }) {
  return <PoolReadStamp chainId={8453} head={c.r.head} then={c.r.then} contracts={readContracts(c)} what={what} />;
}

function usdLine(c: FluidBaseReceiptContext, side: "collateral" | "debt") {
  const v = side === "collateral" ? c.p.usd.supply : c.p.usd.borrow;
  if (v == null) return <span className="text-rb-500">{CARD_WORDS.unpriced}</span>;
  return (
    <span className="text-tone-positive" data-figure={`usd-${side}`}>
      <Prov info={fluidBaseProv(side === "collateral" ? "usd-collateral" : "usd-debt", c)}>{usd(v)}</Prov>
    </span>
  );
}

function interestRow(c: FluidBaseReceiptContext, side: "collateral" | "debt"): PositionPanelRow {
  const { p } = c;
  const col = side === "collateral";
  const label = col ? CARD_WORDS.interestCol : CARD_WORDS.interestDebt;
  const id = `interest-${side}`;
  if (p.interest.state !== "ok")
    return {
      id,
      label,
      tip: CARD_WORDS.interestTip,
      value: (
        <span className="text-xs text-rb-500" data-interest-withheld={p.interest.state}>
          {p.interest.state === "opened" ? CARD_WORDS.interestOpenedShort : CARD_WORDS.interestChangedShort}
        </span>
      ),
    };
  const x = col ? p.interest.supply : p.interest.borrow;
  const dollars = col ? p.usd.supplyInterest : p.usd.borrowInterest;
  return {
    id,
    label,
    tip: CARD_WORDS.interestTip,
    value: (
      <span data-figure={id}>
        <Prov info={fluidBaseProv(col ? "interest-collateral" : "interest-debt", c)}>
          {amount(x, col ? p.colUnit : p.debtUnit)}
        </Prov>
        {dollars != null && (
          <span className="text-rb-500">
            {" · "}
            <Prov info={fluidBaseProv(col ? "usd-interest-collateral" : "usd-interest-debt", c)}>{usd(dollars)}</Prov>
          </span>
        )}
      </span>
    ),
  };
}

function slots(r: FluidBasePositionRead): PositionCardSlots {
  const p: FluidBasePosition = fluidBasePosition(r);
  const c = { p, r };
  const heads: PositionCardHead[] = [
    {
      id: "collateral",
      label: CARD_VOCAB.collateral,
      value:
        p.supply > 0 ? (
          <Prov info={fluidBaseProv("collateral", c)}>
            <AssetAmount value={p.supply} symbol={p.colUnit} exact={p.supplyExact} />
          </Prov>
        ) : null,
      usd: p.supply > 0 ? usdLine(c, "collateral") : undefined,
    },
    {
      id: "debt",
      label: CARD_VOCAB.debt,
      value: p.hasDebt ? (
        <Prov info={fluidBaseProv("debt", c)}>
          <AssetAmount value={p.borrow} symbol={p.debtUnit} exact={p.borrowExact} />
        </Prov>
      ) : null,
      usd: p.hasDebt ? usdLine(c, "debt") : undefined,
    },
  ];
  if (p.ratio != null)
    heads.push({
      id: "position-ratio",
      label: CARD_WORDS.ratio,
      labelTip: CARD_WORDS.ratioTip,
      value: <Prov info={fluidBaseProv("ratio", c)}>{pct(p.ratio)}</Prov>,
    });
  const right: PositionPanelRow[] = [];
  if (p.hasDebt && p.borrowRate != null)
    right.push({
      id: "borrow-rate",
      label: CARD_WORDS.borrowRate,
      tip: CARD_WORDS.borrowRateTip,
      value: <Prov info={fluidBaseProv("borrow-rate", c)}>{p.borrowRate.toFixed(2)}%</Prov>,
    });
  if (p.borrowRoom != null)
    right.push({
      id: "borrow-room",
      label: CARD_WORDS.room,
      tip: CARD_WORDS.roomTip,
      value: (
        <>
          <Prov info={fluidBaseProv("room", c)}>{amount(p.borrowRoom, p.debtUnit)}</Prov> to the{" "}
          <Prov info={fluidBaseProv("collateral-factor", c)}>{pct(p.collateralFactor)}</Prov> limit
        </>
      ),
    });
  right.push({
    id: "liquidates-above",
    label: CARD_WORDS.threshold,
    tip: CARD_WORDS.thresholdTip,
    value: <Prov info={fluidBaseProv("threshold", c)}>{pct(p.liquidationThreshold)}</Prov>,
  });
  const left = [interestRow(c, "collateral"), ...(p.hasDebt ? [interestRow(c, "debt")] : [])];
  return {
    surface: "detail",
    heading: CARD_WORDS.heading,
    status: p.isLiquidated ? { word: "Liquidated", tone: "danger" } : null,
    identity: (
      <span className="text-xs font-semibold text-rb-500">
        {p.colUnit} / {p.debtUnit}
        <span className="ml-2 font-normal tabular-nums text-rb-400">#{p.id}</span>
      </span>
    ),
    heads,
    counters: null,
    menu: { exports: null },
    stamp: <FluidBaseReadStamp c={c} what="Every figure on this card" />,
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
    panel: [left, right],
  };
}

export function FluidBasePositionCard({ r }: { r: FluidBasePositionRead }) {
  return (
    <div
      data-position-card={`fluid-base:${r.id}`}
      data-vault={r.vault}
      data-live-block={r.head.block}
      data-then-block={r.then.block}
    >
      <PositionCard slots={slots(r)} />
    </div>
  );
}
