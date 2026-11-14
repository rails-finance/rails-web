"use client";

// A Compound V3 account on Optimism (rails-ops ui-jobs 578), on the shared position
// card: Collateral, Lent or Debt, and Borrowing limit used as headlines, the
// labels the other chains' Compound V3 card uses; the stats are the base balance
// with its rate and 30-day interest, then the borrower's room, absorb line and
// drop, and COMP to claim; under them the collateral table (ui-jobs 622), one row
// per asset with its amount, dollars and factors. Every figure is read when the
// page opens; the read stamp names the blocks.

import { POSITION_NOUN } from "@/lib/shared/protocols";
import { Prov } from "@/components/shared/provenance";
import { PositionCard, type PositionCardSlots, type PositionPanelRow } from "@/components/shared/position-card";
import { PanelFigure } from "@/components/shared/position-card-panel";
import {
  DataTable,
  DataTableAmount,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table/data-table";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { PoolReadStamp } from "@/components/protocol/uniswap/uniswap-readout";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { OPTIMISM_CHAIN_ID } from "@/lib/shared/chains";
import { positionFigures, type OpcCollateralFigures } from "@/lib/compound-v3-optimism/position";
import {
  opcBaseProv,
  opcCardProv,
  opcCollateralProv,
  readContracts,
  type OpcReceiptContext,
} from "@/lib/compound-v3-optimism/provenance";
import type { OpcPositionRead } from "@/lib/compound-v3-optimism/types";
import { amount, CARD_WORDS, cardExplainer, pctText, usd } from "@/lib/compound-v3-optimism/words";

const NUM = "whitespace-nowrap tabular-nums text-[13px]";
const COLS = CARD_WORDS.columns;

/** One collateral asset: the amount over its dollars, then its borrow and liquidate factors. */
function CollateralRow({ c, x }: { c: OpcReceiptContext; x: OpcCollateralFigures }) {
  return (
    <DataTableRow data-reserve-row={`collateral-${x.symbol}`}>
      <DataTableCell rowHeader>
        <span className="flex items-center gap-2">
          <TokenChipIcon symbol={x.symbol} address={x.asset} size={20} filterable={false} />
          <span className="min-w-0 text-[13px] font-medium text-foreground">{CARD_WORDS.collateralRow(x.symbol)}</span>
        </span>
      </DataTableCell>
      <DataTableCell align="right" className={NUM} label={COLS.amount}>
        <span data-figure={`collateral-${x.symbol}`}>
          <DataTableAmount
            amount={<Prov info={opcCollateralProv("amount", c, x)}>{amount(x.amount, x.symbol)}</Prov>}
            value={
              x.usd == null ? CARD_WORDS.unpriced : <Prov info={opcCollateralProv("usd", c, x)}>{usd(x.usd)}</Prov>
            }
          />
        </span>
      </DataTableCell>
      <DataTableCell align="right" className={NUM} label={COLS.factors}>
        <Prov info={opcCollateralProv("factors", c, x)}>
          {pctText(x.borrowFactor, 0)} / {pctText(x.liquidateFactor, 0)}
        </Prov>
      </DataTableCell>
    </DataTableRow>
  );
}

/** The account's collateral under the headlines (ui-jobs 622): the house table, one row per asset. */
function CollateralTable({ c }: { c: OpcReceiptContext }) {
  const p = c.p!;
  if (!p.collateral.length) return null;
  return (
    <DataTable label={CARD_WORDS.collateral} stacked anatomy="C21" className="mt-4" data-reserves-table="">
      <DataTableHead>
        <DataTableHeader label={COLS.asset} />
        <DataTableHeader label={COLS.amount} align="right" />
        <DataTableHeader label={COLS.factors} align="right" />
      </DataTableHead>
      <DataTableBody>
        {p.collateral.map((x) => (
          <CollateralRow key={x.asset} c={c} x={x} />
        ))}
      </DataTableBody>
    </DataTable>
  );
}

function baseRow(c: OpcReceiptContext): PositionPanelRow | null {
  const p = c.p!;
  const lend = p.supplied > 0;
  if (!lend && p.borrowed <= 0) return null;
  const i = p.interest;
  return {
    id: lend ? "lent" : "borrowed",
    label: CARD_WORDS.baseRow(p.baseSymbol, lend),
    tip: CARD_WORDS.rateTip,
    asset: { symbol: p.baseSymbol, address: p.baseToken },
    value: (
      <span data-figure={lend ? "lent" : "borrowed"}>
        <Prov info={opcBaseProv("amount", c)}>{amount(lend ? p.supplied : p.borrowed, p.baseSymbol)}</Prov>
        <span className="text-rb-500">
          {" · "}
          {(lend ? p.suppliedUsd : p.borrowedUsd) == null ? (
            CARD_WORDS.unpriced
          ) : (
            <Prov info={opcBaseProv("usd", c)}>{usd((lend ? p.suppliedUsd : p.borrowedUsd)!)}</Prov>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-rb-500">
          {lend ? CARD_WORDS.supplyRateLabel : CARD_WORDS.borrowRateLabel}{" "}
          <Prov info={opcBaseProv("rate", c)}>{pctText(lend ? p.supplyApr : p.borrowApr)}</Prov>
        </span>
        {i && (
          <span className="mt-0.5 block text-xs text-rb-500">
            {CARD_WORDS.interest30}{" "}
            {i.state !== "ok" ? (
              <span data-interest-withheld={i.state}>{CARD_WORDS.withheld[i.state]}</span>
            ) : (
              <span data-figure="interest">
                <Prov info={opcBaseProv("interest", c)}>{amount(i.amount, p.baseSymbol)}</Prov>
                {i.usd != null && (
                  <>
                    {" · "}
                    <Prov info={opcBaseProv("usd-interest", c)}>{usd(i.usd)}</Prov>
                  </>
                )}
              </span>
            )}
          </span>
        )}
      </span>
    ),
  };
}

/** The borrower's rows: room, absorb line, how much of it is reached, the drop to it. */
export function riskRows(c: OpcReceiptContext): PositionPanelRow[] {
  const f = c.f;
  const rows: PositionPanelRow[] = [];
  if (f.roomToBorrow != null)
    rows.push({
      id: "room-to-borrow",
      label: CARD_WORDS.room,
      tip: CARD_WORDS.roomTip,
      asset: { symbol: f.baseSymbol, address: f.baseToken },
      value: <Prov info={opcCardProv("room", c)}>{amount(f.roomToBorrow, f.baseSymbol)}</Prov>,
    });
  if (f.absorbedAt != null)
    rows.push({
      id: "absorbed-at",
      label: CARD_WORDS.absorbedAt,
      tip: CARD_WORDS.absorbedAtTip,
      asset: { symbol: f.baseSymbol, address: f.baseToken },
      value: <Prov info={opcCardProv("absorbed-at", c)}>{amount(f.absorbedAt, f.baseSymbol)}</Prov>,
    });
  if (f.lineReached != null)
    rows.push({
      id: "absorb-line-reached",
      label: CARD_WORDS.lineReached,
      tip: CARD_WORDS.lineReachedTip,
      value: (
        <>
          <Prov info={opcCardProv("line", c)}>
            <PanelFigure>{pctText(f.lineReached, 0)}</PanelFigure>
          </Prov>{" "}
          <Prov info={opcCardProv("verdict", c)}>{f.isLiquidatable ? CARD_WORDS.past : CARD_WORDS.reached}</Prov>
        </>
      ),
    });
  if (f.dropToLine != null)
    rows.push({
      id: "liquidates-on-drop",
      label: CARD_WORDS.drop,
      tip: CARD_WORDS.dropTip,
      value: <Prov info={opcCardProv("drop", c)}>{pctText(f.dropToLine, 0)}</Prov>,
    });
  return rows;
}

function slots(r: OpcPositionRead): PositionCardSlots {
  const p = positionFigures(r);
  const c: OpcReceiptContext = { a: r.account, f: p, head: r.head, ethUsd: r.ethUsd, r, p };
  const lend = p.supplied > 0;
  const base = baseRow(c);
  const right: PositionPanelRow[] = [...(base ? [base] : []), ...riskRows(c)];
  if (r.rewards && p.rewardsOwed != null && p.rewardsOwed > 0)
    right.push({
      id: "comp-owed",
      label: CARD_WORDS.rewards,
      tip: CARD_WORDS.rewardsTip,
      value: <Prov info={opcCardProv("rewards", c)}>{amount(p.rewardsOwed, "COMP")}</Prov>,
    });
  return {
    surface: "detail",
    heading: CARD_WORDS.heading,
    status: null,
    identity: null,
    heads: [
      {
        id: "collateral",
        label: CARD_WORDS.collateral,
        labelTip: CARD_WORDS.collateralTip(p.baseSymbol),
        value:
          p.collateral.length && p.collateralUsd != null ? (
            <Prov info={opcCardProv("collateral-total", c)}>{usd(p.collateralUsd)}</Prov>
          ) : null,
      },
      lend
        ? {
            id: "lent",
            label: CARD_WORDS.lent,
            labelTip: CARD_WORDS.lentTip(p.baseSymbol),
            value: p.suppliedUsd != null ? <Prov info={opcBaseProv("usd", c)}>{usd(p.suppliedUsd)}</Prov> : null,
          }
        : {
            id: "debt",
            label: CARD_VOCAB.debt,
            labelTip: CARD_WORDS.debtTip(p.baseSymbol),
            value:
              p.borrowed > 0 && p.borrowedUsd != null ? (
                <Prov info={opcBaseProv("usd", c)}>{usd(p.borrowedUsd)}</Prov>
              ) : null,
          },
      {
        id: "borrowing-limit-used",
        label: CARD_WORDS.limit,
        labelTip: CARD_WORDS.limitTip,
        value:
          p.limitUsed != null ? (
            <Prov info={opcCardProv("limit", c)}>{pctText(p.limitUsed, 1)}</Prov>
          ) : (
            <span className="text-rb-500">{CARD_WORDS.noDebt}</span>
          ),
      },
    ],
    counters: null,
    menu: { exports: null, noun: POSITION_NOUN["compound-v3-optimism"].toLowerCase() },
    stamp: (
      <PoolReadStamp
        chainId={OPTIMISM_CHAIN_ID}
        head={r.head}
        then={r.then}
        contracts={readContracts(c)}
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
    band: <CollateralTable c={c} />,
    foot: <p className="mt-3 text-xs text-rb-500">{CARD_WORDS.foot(p.quoteUnit === "ETH")}</p>,
    panel: [[], right],
  };
}

export function CompoundV3OptimismPositionCard({ r }: { r: OpcPositionRead }) {
  return (
    <div
      data-position-card={`compound-v3-optimism:${r.account.key}:${r.wallet}`}
      data-comet={r.account.comet}
      data-live-block={r.head.block}
      data-then-block={r.then.block}
    >
      <PositionCard slots={slots(r)} />
    </div>
  );
}
