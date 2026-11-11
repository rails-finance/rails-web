"use client";

// A Morpho Blue position read on visit, on Arc or Optimism (rails-ops ui-jobs
// 577 and 578), on the shared
// position card with the Morpho card's headlines: Collateral, Debt (or
// Supplied), LTV against the market's LLTV, and the borrow rate (or the supply
// rate); the panel's rows carry each side's amount and dollars, the 30 days'
// interest, the room to borrow and the drop that liquidates. Every figure is
// read when the page opens; the read stamp names the blocks.

import { Prov } from "@/components/shared/provenance";
import { PositionCard, type PositionCardSlots, type PositionPanelRow } from "@/components/shared/position-card";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { PoolReadStamp } from "@/components/protocol/uniswap/uniswap-readout";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { morphoAtBlockPosition, type AtBlockInterest } from "@/lib/morpho-at-block/position";
import {
  morphoAtBlockProv,
  readContracts,
  type MorphoAtBlockFigure,
  type MorphoAtBlockReceiptContext,
} from "@/lib/morpho-at-block/provenance";
import type { MorphoAtBlockDeployment, MorphoAtBlockPositionRead } from "@/lib/morpho-at-block/types";
import { amount, CARD_WORDS, cardExplainer, dollarFoot, pctText, usd } from "@/lib/morpho-at-block/words";

function interestValue(c: MorphoAtBlockReceiptContext, side: "supply" | "debt", i: AtBlockInterest) {
  if (i.state !== "ok")
    return (
      <span className="text-xs text-rb-500" data-interest-withheld={i.state}>
        {CARD_WORDS.withheld[i.state]}
      </span>
    );
  return (
    <span data-figure={`interest-${side}`}>
      <Prov info={morphoAtBlockProv(side === "supply" ? "interest-supply" : "interest-debt", c)}>
        {amount(i.amount, c.f.loan.symbol)}
      </Prov>
      {i.usd != null && (
        <span className="text-rb-500">
          {" · "}
          <Prov info={morphoAtBlockProv(side === "supply" ? "usd-interest-supply" : "usd-interest-debt", c)}>
            {usd(i.usd)}
          </Prov>
        </span>
      )}
    </span>
  );
}

/** An amount with its dollars, or "no dollar price". */
function sideValue(
  c: MorphoAtBlockReceiptContext,
  key: "collateral" | "debt" | "supplied",
  x: number,
  unit: string,
  dollars: number | null,
) {
  return (
    <span data-figure={key}>
      <Prov info={morphoAtBlockProv(key, c)}>{amount(x, unit)}</Prov>
      <span className="text-rb-500">
        {" · "}
        {dollars == null ? (
          CARD_WORDS.unpriced
        ) : (
          <Prov info={morphoAtBlockProv(`usd-${key}` as MorphoAtBlockFigure, c)}>{usd(dollars)}</Prov>
        )}
      </span>
    </span>
  );
}

function slots(r: MorphoAtBlockPositionRead, dep: MorphoAtBlockDeployment): PositionCardSlots {
  const f = morphoAtBlockPosition(r);
  const c: MorphoAtBlockReceiptContext = { dep, f, m: r.market, p: r.position, head: r.head, r, pf: f };
  const L = f.loan.symbol;
  const C = f.collateralToken?.symbol ?? "";
  const borrows = f.debt > 0;
  const left: PositionPanelRow[] = [];
  const right: PositionPanelRow[] = [];
  if (f.collateral > 0)
    left.push({
      id: "collateral",
      label: `${C} collateral`,
      tip: CARD_WORDS.collateralTip,
      asset: { symbol: C, address: f.collateralToken!.address },
      value: sideValue(c, "collateral", f.collateral, C, f.collateralUsd),
    });
  if (f.supplied > 0)
    left.push({
      id: "supplied",
      label: `${L} supplied`,
      tip: CARD_WORDS.interestTip,
      asset: { symbol: L, address: f.loan.address },
      value: (
        <span>
          {sideValue(c, "supplied", f.supplied, L, f.suppliedUsd)}
          {f.supplyInterest && (
            <span className="mt-0.5 block text-xs text-rb-500">
              {CARD_WORDS.interest30.earned} {interestValue(c, "supply", f.supplyInterest)}
            </span>
          )}
        </span>
      ),
    });
  if (borrows)
    right.push({
      id: "debt",
      label: `${L} debt`,
      tip: CARD_WORDS.interestTip,
      asset: { symbol: L, address: f.loan.address },
      value: (
        <span>
          {sideValue(c, "debt", f.debt, L, f.debtUsd)}
          {f.debtInterest && (
            <span className="mt-0.5 block text-xs text-rb-500">
              {CARD_WORDS.interest30.owed} {interestValue(c, "debt", f.debtInterest)}
            </span>
          )}
        </span>
      ),
    });
  if (f.roomToBorrow != null && f.collateral > 0)
    right.push({
      id: "room-to-borrow",
      label: CARD_WORDS.room,
      tip: CARD_WORDS.roomTip,
      value: <Prov info={morphoAtBlockProv("room", c)}>{amount(f.roomToBorrow, L)}</Prov>,
    });
  if (borrows && f.liquidationDrop != null)
    right.push({
      id: "liquidation-drop",
      label: CARD_WORDS.drop,
      tip: CARD_WORDS.dropTip,
      value: <Prov info={morphoAtBlockProv("drop", c)}>{pctText(f.liquidationDrop, 1)}</Prov>,
    });
  return {
    surface: "detail",
    heading: CARD_WORDS.heading,
    status: null,
    heads: [
      f.collateral > 0 || !(f.supplied > 0)
        ? {
            id: "collateral",
            label: CARD_VOCAB.collateral,
            labelTip: CARD_WORDS.collateralTip,
            value:
              f.collateral > 0 ? (
                f.collateralUsd != null ? (
                  <Prov info={morphoAtBlockProv("usd-collateral", c)}>{usd(f.collateralUsd)}</Prov>
                ) : (
                  <Prov info={morphoAtBlockProv("collateral", c)}>{amount(f.collateral, C)}</Prov>
                )
              ) : null,
          }
        : {
            id: "supplied",
            label: CARD_WORDS.supplied,
            labelTip: CARD_WORDS.suppliedTip,
            value:
              f.suppliedUsd != null ? (
                <Prov info={morphoAtBlockProv("usd-supplied", c)}>{usd(f.suppliedUsd)}</Prov>
              ) : (
                <Prov info={morphoAtBlockProv("supplied", c)}>{amount(f.supplied, L)}</Prov>
              ),
          },
      {
        id: "debt",
        label: CARD_VOCAB.debt,
        labelTip: CARD_WORDS.debtTip,
        value: borrows ? (
          f.debtUsd != null ? (
            <Prov info={morphoAtBlockProv("usd-debt", c)}>{usd(f.debtUsd)}</Prov>
          ) : (
            <Prov info={morphoAtBlockProv("debt", c)}>{amount(f.debt, L)}</Prov>
          )
        ) : (
          <span className="text-rb-500">{CARD_WORDS.noDebt}</span>
        ),
      },
      {
        id: "ltv",
        label: CARD_WORDS.ltv,
        labelTip: CARD_WORDS.ltvTip,
        value: f.ltv != null ? <Prov info={morphoAtBlockProv("ltv", c)}>{pctText(f.ltv, 1)}</Prov> : null,
        sub: CARD_WORDS.ltvLine(f.lltv),
      },
      borrows || !(f.supplied > 0)
        ? {
            id: "borrow-rate",
            label: CARD_WORDS.borrowRate,
            labelTip: CARD_WORDS.borrowRateTip,
            value:
              f.borrowApr != null ? (
                <Prov info={morphoAtBlockProv("borrow-rate", c)}>{pctText(f.borrowApr)}</Prov>
              ) : null,
          }
        : {
            id: "supply-rate",
            label: CARD_WORDS.supplyRate,
            labelTip: CARD_WORDS.supplyRateTip,
            value:
              f.supplyApr != null ? (
                <Prov info={morphoAtBlockProv("supply-rate", c)}>{pctText(f.supplyApr)}</Prov>
              ) : null,
          },
    ],
    counters: null,
    menu: { exports: null },
    stamp: (
      <PoolReadStamp
        chainId={dep.chainId}
        head={r.head}
        then={r.then}
        contracts={readContracts(r, f, dep)}
        what="Every figure on this card"
      />
    ),
    explainer: {
      body: (
        <div data-position-explanation="">
          {cardExplainer(f, dep).map((g) => (
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
    foot: <p className="mt-3 text-xs text-rb-500">{dollarFoot(f, dep)}</p>,
    panel: [left, right],
  };
}

export function MorphoAtBlockPositionCard({ r, dep }: { r: MorphoAtBlockPositionRead; dep: MorphoAtBlockDeployment }) {
  return (
    <div
      data-position-card={`${dep.session}:${r.market.id}:${r.wallet}`}
      data-market={r.market.id}
      data-live-block={r.head.block}
      data-then-block={r.then.block}
    >
      <PositionCard slots={slots(r, dep)} />
    </div>
  );
}
