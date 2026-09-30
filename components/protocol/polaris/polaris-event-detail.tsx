"use client";

// Polaris event detail — adapter onto the shared ChainTruthDetail grid.
// A touch renders the CDP's two resulting figures (collateral / debt — each the
// log's own `_newColl` / `_newDebt`) with before→after transitions built from
// the lag columns, then the protocol's own legs grouped as the twelve-field
// log states them: interest · gains · the PSM shares · a settlement mint. The
// rate in force at the touch closes the grid as a line, not a pill. A
// liquidation renders the pool/redistribution split and the liquidator's
// compensation; a transfer renders from → to.
//
// The grid is native units throughout. A liquidation adds one valued block
// beneath it — the shared LiquidationForensics, fed by
// polaris-liquidation-forensics.ts — and even that is denominated in the
// MARKET'S own unit (USDp / GOLDp at the feed's price at the event's block),
// never in dollars.

import type { PolarisContext } from "@/lib/shared/types/event-shape";
import {
  ChainTruthDetail,
  type ChainTruthStat,
  type ChainTruthTransition,
} from "@/components/shared/chain-truth-event";
import { LinkedAddress } from "@/components/shared/linked-address";
import { Prov } from "@/components/shared/provenance";
import {
  AtBlockPriceFootnote,
  LiquidationForensics,
  type AtBlockPricePill,
} from "@/components/shared/liquidation-forensics";
import {
  POLARIS_LIQ_CONSTANTS,
  buildPolarisLiquidationForensics,
  polarisLiquidationFigures,
  polarisPoolLegProv,
  polarisValueFormat,
} from "./polaris-liquidation-forensics";
import {
  ledgerFieldProv,
  beforeProv,
  netChangeProv,
  liquidationFieldProv,
  rateInForceProv,
  transferProv,
  atBlockPriceProv,
  gasCompEscrowProv,
  crAtEventProv,
  crBeforeAtEventProv,
  crChangeAtEventProv,
  type PolarisCoords,
  type PolarisLedgerField,
  type PolarisLiquidationField,
} from "@/lib/polaris/event-provenance";
import { crPct1, crPct2, polarisCrAtEvent, polarisCrReceipt, type PolarisCrAtEvent } from "@/lib/polaris/cr-at-event";
import { PETH, POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";
import { formatNumber, formatExact } from "@/lib/utils/format";
import { TipLabel } from "@/components/shared/tip-label";

/** The primary rate, glossed where a row first states it. */
const PRIMARY_RATE_TIP =
  "The primary rate is the part of the market's interest rate that moves with its stablecoin's peg: it rises when traders redeem through the PSM and falls when they mint. The market adds a secondary rate, which rises with its debt-to-reserve ratio, and a CDP pays both on its debt.";

/** The market's own unit — USDp to 2dp, GOLDp to 4dp (the finer precision an
 *  ounce of gold's own price needs). Stated once, beside the forensics that
 *  values the liquidation legs in the same unit. */
const priceFormat = polarisValueFormat;

export interface PolarisEventDetailProps {
  ctx: PolarisContext;
  txHash?: string;
  blockNumber?: number;
}

const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Math.abs(Number(human))));
const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

function transitionOf(
  after: string | undefined,
  before: string | undefined,
  what: "coll" | "debt",
  coords: PolarisCoords,
  rawBefore?: string,
): ChainTruthTransition | undefined {
  const afterN = after != null ? Number(after) : null;
  const beforeN = before != null ? Number(before) : null;
  if (afterN == null || beforeN == null || !Number.isFinite(afterN) || !Number.isFinite(beforeN)) return undefined;
  const changeN = afterN - beforeN;
  if (changeN === 0) return undefined;
  const sign = changeN >= 0 ? "+" : "−";
  return {
    before: formatNumber(beforeN),
    beforeExact: formatExact(beforeN),
    beforeProv: beforeProv(what, coords, rawBefore),
    change: `${sign}${formatNumber(Math.abs(changeN))}`,
    changeExact: `${sign}${formatExact(Math.abs(changeN))}`,
    changeProv: netChangeProv(what, coords),
  };
}

/** The ratio's before-to-after transition: the lag columns at the SAME
 *  block's price against the resulting figures, the change in percentage
 *  points (U+2212 minus). Undefined on the open (no debt before), on a
 *  liquidation (the at-fire figure has no before) and where nothing moved. */
function crTransitionOf(
  ctx: PolarisContext,
  cr: PolarisCrAtEvent,
  coords: PolarisCoords,
): ChainTruthTransition | undefined {
  if (cr.source !== "formula" || cr.beforePct == null) return undefined;
  const change = cr.pct - cr.beforePct;
  if (Math.abs(change) < 0.005) return undefined;
  const sign = change >= 0 ? "+" : "−";
  const stable = POLARIS_MARKET_CONFIG[ctx.market].stable.symbol;
  return {
    before: crPct1(cr.beforePct),
    beforeExact: crPct2(cr.beforePct),
    beforeProv: crBeforeAtEventProv(coords, {
      collBefore: `${formatExact(num(ctx.collBefore))} ${PETH.symbol}`,
      priceInDebt: `${formatExact(cr.price)} ${stable}`,
      debtBefore: `${formatExact(num(ctx.debtBefore))} ${stable}`,
    }),
    change: `${sign}${Math.abs(change).toFixed(1)} pts`,
    changeExact: `${sign}${Math.abs(change).toFixed(2)} pts`,
    changeProv: crChangeAtEventProv(coords),
  };
}

export function PolarisEventDetail({ ctx, txHash, blockNumber }: PolarisEventDetailProps) {
  const coords: PolarisCoords = { txHash, blockNumber, market: ctx.market, cdpId: ctx.cdpId };
  const stable = ctx.stableSymbol;
  const stableAddr = POLARIS_MARKET_CONFIG[ctx.market].stable.address;

  if (ctx.eventType === "transfer") {
    return (
      <div className="text-xs text-rb-500">
        <Prov info={transferProv(coords)}>
          <span>
            Custody moved
            {ctx.fromAddr ? (
              <>
                {" "}
                from <LinkedAddress address={ctx.fromAddr} />
              </>
            ) : null}
            {ctx.toAddr ? (
              <>
                {" "}
                to <LinkedAddress address={ctx.toAddr} />
              </>
            ) : null}{" "}
            — the CDP&rsquo;s collateral and debt did not change.
          </span>
        </Prov>
      </div>
    );
  }

  const stats: ChainTruthStat[] = [];
  /** A protocol leg, signed by what it does to the CDP: "+" adds to the
   *  collateral or the debt, "−" takes from it. `lowers` flips a field the
   *  log states as a magnitude that comes OFF the debt (a stability gain). */
  const leg = (field: PolarisLedgerField, label: string, symbol: string, address: string, lowers = false): void => {
    const v = ctx[field];
    if (v == null || num(v) === 0) return;
    const signedN = lowers ? -Math.abs(num(v)) : num(v);
    stats.push({
      label,
      value: fmt(v),
      display: `${signedN < 0 ? "−" : "+"}${fmt(v)}`,
      symbol,
      address,
      prov: ledgerFieldProv(field, coords, ctx.raw?.[field]),
    });
  };
  const liq = (field: PolarisLiquidationField, label: string, symbol: string, address: string): void => {
    const v = ctx[field];
    if (v == null || num(v) === 0) return;
    stats.push({ label, value: fmt(v), symbol, address, prov: liquidationFieldProv(field, coords, ctx.raw?.[field]) });
  };

  // The two resulting figures, with their transitions.
  if (ctx.newColl != null)
    stats.push({
      label: "Collateral",
      value: fmt(ctx.newColl),
      symbol: PETH.symbol,
      address: PETH.address,
      prov: ledgerFieldProv("newColl", coords, ctx.raw?.newColl),
      transition: transitionOf(ctx.newColl, ctx.collBefore, "coll", coords, ctx.raw?.collBefore),
      changed: ctx.newColl !== ctx.collBefore,
    });
  if (ctx.newDebt != null)
    stats.push({
      label: "Debt",
      value: fmt(ctx.newDebt),
      symbol: stable,
      address: stableAddr,
      prov: ledgerFieldProv("newDebt", coords, ctx.raw?.newDebt),
      transition: transitionOf(ctx.newDebt, ctx.debtBefore, "debt", coords, ctx.raw?.debtBefore),
      changed: ctx.newDebt !== ctx.debtBefore,
    });

  // The collateral ratio at this event, always on (as Liquity V2's metric is):
  // the resulting figures at the block's own price, or the ratio at fire on a
  // liquidation (lib/polaris/cr-at-event.ts, the one place the figure is
  // computed). A dash where the lane has no price for the block, or where
  // the row leaves no debt to divide by (a close). The grid draws no chip for
  // an empty symbol.
  {
    const cr = polarisCrAtEvent(ctx);
    if (cr) {
      const r = polarisCrReceipt(ctx, coords, cr);
      stats.push({
        label: "Collateral ratio",
        value: crPct1(cr.pct),
        symbol: "",
        prov: r.info,
        transition: crTransitionOf(ctx, cr, coords),
        changed: cr.source !== "formula" || ctx.newColl !== ctx.collBefore || ctx.newDebt !== ctx.debtBefore,
      });
    } else {
      stats.push({
        label: "Collateral ratio",
        value: "—",
        symbol: "",
        prov: crAtEventProv(coords, {
          newColl: ctx.newColl != null ? `${formatExact(num(ctx.newColl))} ${PETH.symbol}` : "—",
          priceInDebt: ctx.priceAtBlock ? `${formatExact(ctx.priceAtBlock.pethInDebt)} ${stable}` : "—",
          newDebt: ctx.newDebt != null ? `${formatExact(num(ctx.newDebt))} ${stable}` : "—",
          mcrPct: POLARIS_LIQ_CONSTANTS.mcr.label,
        }),
        changed: false,
      });
    }
  }

  const figures = ctx.eventType === "liquidate" ? polarisLiquidationFigures(ctx) : undefined;

  if (ctx.eventType === "liquidate") {
    // `_collLiquidated` is the ENTIRE collateral seized — the owner's surplus
    // and the liquidator's compensation come out of it — so the row says
    // "seized" and the pool's own leg is stated separately, derived from the
    // three emitted fields.
    // One sum that closes: the seized collateral, then the three places it
    // went. The gas compensation comes last and apart — it is the escrow the
    // CDP set aside at opening, outside the seized figure.
    liq("collLiquidated", "Collateral seized", PETH.symbol, PETH.address);
    if (figures?.path === "sp")
      stats.push({
        label: "Of which to the stability pool",
        value: formatNumber(figures.leg),
        symbol: PETH.symbol,
        address: PETH.address,
        prov: polarisPoolLegProv(ctx, coords),
      });
    liq("collRedistributed", "Of which redistributed to other CDPs", PETH.symbol, PETH.address);
    liq("collateralComp", "Of which to the liquidator (0.5%)", PETH.symbol, PETH.address);
    liq("collSurplus", "Of which surplus for the owner to claim", PETH.symbol, PETH.address);
    liq("debtLiquidated", "Debt absorbed by the pool", stable, stableAddr);
    liq("debtRedistributed", "Debt redistributed", stable, stableAddr);
    if (ctx.flatComp != null && num(ctx.flatComp) !== 0) {
      // A round constant, stated whole so it reads as the open row's escrow.
      const flat = num(ctx.flatComp).toLocaleString("en-US", { maximumFractionDigits: 6 });
      stats.push({
        label: "Gas compensation, from the escrow sent at the open",
        value: flat,
        display: flat,
        symbol: PETH.symbol,
        address: PETH.address,
        prov: liquidationFieldProv("flatComp", coords, ctx.raw?.flatComp),
      });
    }
  }

  // The protocol's legs at this touch — grouped: interest · gains · PSM · settle.
  leg("accruedInterest", "Interest charged · debt", stable, stableAddr);
  leg("stableGain", "Stability gain · debt", stable, stableAddr, true);
  leg("bcTokenGain", "Reward pETH · collateral", PETH.symbol, PETH.address);
  leg("mintRedeemCollGain", "Net PSM share · collateral", PETH.symbol, PETH.address);
  leg("mintRedeemDebtGain", "Net PSM share · debt", stable, stableAddr);
  leg("stablesMintedToEnsureZeroDebt", "Settled to zero · debt", stable, stableAddr);

  // The open's escrow: the holder sends the collateral and, beside it, the
  // fixed gas compensation the CDP holds for a liquidator — returned on
  // close, paid out on a liquidation. The log does not carry it; the amount is
  // the protocol's constant (POLARIS_LIQ_CONSTANTS.gasComp).
  if (ctx.eventType === "open")
    stats.push({
      label: "Gas compensation escrow, sent with the collateral",
      value: String(POLARIS_LIQ_CONSTANTS.gasComp.amount),
      display: `+${POLARIS_LIQ_CONSTANTS.gasComp.amount}`,
      symbol: PETH.symbol,
      address: PETH.address,
      prov: gasCompEscrowProv(coords),
    });

  const forensics =
    ctx.eventType === "liquidate" ? buildPolarisLiquidationForensics(ctx, coords, ctx.market) : undefined;

  // The forensics block carries the at-block price pill itself, so the
  // standalone footnote is withheld wherever it renders — one price pill on a
  // row, never two.
  const priceFootnote: AtBlockPricePill[] =
    ctx.priceAtBlock && !forensics
      ? [
          {
            symbol: PETH.symbol,
            address: PETH.address,
            priceUsd: ctx.priceAtBlock.pethInDebt,
            priceProv: atBlockPriceProv(coords, ctx.priceAtBlock, ctx.market),
            note: "oracle at block",
          },
        ]
      : [];

  return (
    <div className="space-y-2">
      {stats.length > 0 && (
        <ChainTruthDetail
          // In full, three decimals — the row's and the card's rule — with the
          // token named after each figure.
          stats={stats.map((st) => (st.symbol && st.display == null ? { ...st, display: st.value } : st))}
          symbolText
        />
      )}
      {forensics && <LiquidationForensics {...forensics} />}
      {priceFootnote.length > 0 && (
        <div className="px-5 pb-2">
          <AtBlockPriceFootnote pills={priceFootnote} format={priceFormat(ctx.market)} />
        </div>
      )}
      {ctx.primaryRate != null && (
        // px-5 mirrors the stat grid's inset so the line sits on the cards' left edge.
        // The figure only: the "set by the market, not the holder" clause lives in the
        // explanation bullet and the receipt, not here as well.
        <div className="px-5 text-xs text-rb-500 tabular-nums">
          <Prov info={rateInForceProv(coords, ctx.raw?.primaryRate)} value={`${(ctx.primaryRate * 100).toFixed(2)}%`}>
            <span>{(ctx.primaryRate * 100).toFixed(2)}%</span>
          </Prov>{" "}
          <TipLabel text="primary rate in force" tip={PRIMARY_RATE_TIP} />
        </div>
      )}
    </div>
  );
}
