"use client";

// An Aave V4 spoke account on Arc (rails-ops ui-jobs 577), on the shared
// position card: Supplied, Debt, Health factor and Borrow limit as headlines,
// and no stats; under them the reserves table (ui-jobs 622), one row per
// supplied reserve and one per borrowed, with its amount, dollars at the
// spoke's oracle, collateral factor, borrow rate and interest over the last 30
// days. Every figure is read when the page opens; the read stamp names the
// blocks.

import { Prov } from "@/components/shared/provenance";
import { PositionCard, type PositionCardSlots } from "@/components/shared/position-card";
import {
  DataTable,
  DataTableAmount,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table/data-table";
import { HeadingTip } from "@/components/shared/tip-label";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { PoolReadStamp } from "@/components/protocol/uniswap/uniswap-readout";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { ARC_CHAIN_ID } from "@/lib/shared/chains";
import { arcPosition, type ArcInterest, type ArcReserveFigures } from "@/lib/aave-v4-arc/position";
import { arcCardProv, arcReserveProv, readContracts, type ArcReceiptContext } from "@/lib/aave-v4-arc/provenance";
import type { ArcPositionRead } from "@/lib/aave-v4-arc/types";
import { amount, CARD_WORDS, cardExplainer, hfText, pctText, usd } from "@/lib/aave-v4-arc/words";

/** The 30-day interest: the amount over its dollars, or why it is withheld. */
function interestValue(c: ArcReceiptContext, x: ArcReserveFigures, side: "supply" | "debt", i: ArcInterest) {
  if (i.state !== "ok")
    return (
      <span className="text-xs text-rb-500" data-interest-withheld={i.state}>
        {CARD_WORDS.withheld[i.state]}
      </span>
    );
  return (
    <span data-figure={`interest-${side}-${x.symbol}`}>
      <DataTableAmount
        amount={
          <Prov info={arcReserveProv(side === "supply" ? "interest-supply" : "interest-debt", c, x)}>
            {amount(i.amount, x.symbol)}
          </Prov>
        }
        value={
          i.usd != null ? (
            <Prov info={arcReserveProv(side === "supply" ? "usd-interest-supply" : "usd-interest-debt", c, x)}>
              {usd(i.usd)}
            </Prov>
          ) : undefined
        }
      />
    </span>
  );
}

const NUM = "whitespace-nowrap tabular-nums text-[13px]";
const COLS = CARD_WORDS.columns;

/** One reserve the account holds on one side: the asset and side, the amount
 *  over its dollars, the collateral factor (collateral only), the borrow rate
 *  (debt only) and the 30-day interest. */
function ReserveRow({ c, x, side }: { c: ArcReceiptContext; x: ArcReserveFigures; side: "supply" | "debt" }) {
  const supply = side === "supply";
  const id = supply ? `supplied-${x.symbol}` : `debt-${x.symbol}`;
  const dollars = supply ? x.suppliedUsd : x.debtUsd;
  const interest = supply ? x.supplyInterest : x.debtInterest;
  const factor = supply && x.isCollateral && x.collateralFactor != null;
  const rate = !supply && x.drawnApr != null;
  // An empty cell takes no label, so a stacked card (D6) leaves it out.
  return (
    <DataTableRow data-reserve-row={id}>
      <DataTableCell rowHeader>
        <span className="flex items-center gap-2">
          <TokenChipIcon symbol={x.symbol} address={x.underlying} size={20} filterable={false} />
          <span className="min-w-0 text-[13px] leading-snug">
            <span className="block font-medium text-foreground">
              {supply ? CARD_WORDS.supplyRow(x.symbol) : CARD_WORDS.debtRow(x.symbol)}
            </span>
            {supply && (
              <span className="block text-[12px] text-rb-500">
                {x.isCollateral ? CARD_WORDS.collateralFlag : CARD_WORDS.notCollateral}
              </span>
            )}
          </span>
        </span>
      </DataTableCell>
      <DataTableCell align="right" className={NUM} label={COLS.amount}>
        <span data-figure={id}>
          <DataTableAmount
            amount={
              <Prov info={arcReserveProv(supply ? "supplied" : "debt", c, x)}>
                {amount(supply ? x.supplied : x.debt, x.symbol)}
              </Prov>
            }
            value={
              dollars == null ? (
                CARD_WORDS.unpriced
              ) : (
                <Prov info={arcReserveProv(supply ? "usd-supplied" : "usd-debt", c, x)}>{usd(dollars)}</Prov>
              )
            }
          />
        </span>
      </DataTableCell>
      <DataTableCell align="right" className={NUM} label={factor ? COLS.factor : undefined}>
        {factor && <Prov info={arcReserveProv("collateral-factor", c, x)}>{pctText(x.collateralFactor!, 0)}</Prov>}
      </DataTableCell>
      <DataTableCell align="right" className={NUM} label={rate ? COLS.rate : undefined}>
        {rate && <Prov info={arcReserveProv("borrow-rate", c, x)}>{pctText(x.drawnApr!)}</Prov>}
      </DataTableCell>
      <DataTableCell align="right" className={NUM} label={interest ? COLS.interest : undefined}>
        {interest && interestValue(c, x, side, interest)}
      </DataTableCell>
    </DataTableRow>
  );
}

/** The account's reserves under the headlines (ui-jobs 622): the house table,
 *  supplied reserves first, then borrowed. */
function ReservesTable({ c }: { c: ArcReceiptContext }) {
  const { p } = c;
  if (!p.supplied.length && !p.borrowed.length) return null;
  return (
    <DataTable label={CARD_WORDS.reserves} stacked className="mt-4" data-reserves-table="">
      <DataTableHead>
        <DataTableHeader label={COLS.asset} />
        <DataTableHeader label={COLS.amount} align="right" />
        <DataTableHeader label={COLS.factor} align="right" />
        <DataTableHeader
          label={<HeadingTip text={COLS.rate} tip={CARD_WORDS.borrowRateTip(c.p.riskPremium)} />}
          align="right"
        />
        <DataTableHeader label={<HeadingTip text={COLS.interest} tip={CARD_WORDS.interestTip} />} align="right" />
      </DataTableHead>
      <DataTableBody>
        {p.supplied.map((x) => (
          <ReserveRow key={`s-${x.underlying}`} c={c} x={x} side="supply" />
        ))}
        {p.borrowed.map((x) => (
          <ReserveRow key={`d-${x.underlying}`} c={c} x={x} side="debt" />
        ))}
      </DataTableBody>
    </DataTable>
  );
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
    band: <ReservesTable c={c} />,
    foot: <p className="mt-3 text-xs text-rb-500">{CARD_WORDS.foot}</p>,
    panel: [[], []],
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
