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
  crAtEventProv,
  crBeforeAtEventProv,
  crChangeAtEventProv,
  type PolarisCoords,
  type PolarisLedgerField,
  type PolarisLiquidationField,
} from "@/lib/polaris/event-provenance";
import { crPct1, crPct2, polarisCrAtEvent, polarisCrReceipt, type PolarisCrAtEvent } from "@/lib/polaris/cr-at-event";
import { PETH, POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";
import { formatNumber, formatCompact, formatExact } from "@/lib/utils/format";

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
    before: formatCompact(beforeN),
    beforeExact: formatExact(beforeN),
    beforeProv: beforeProv(what, coords, rawBefore),
    change: `${sign}${formatCompact(Math.abs(changeN))}`,
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
  const leg = (field: PolarisLedgerField, label: string, symbol: string, address: string): void => {
    const v = ctx[field];
    if (v == null || num(v) === 0) return;
    stats.push({ label, value: fmt(v), symbol, address, prov: ledgerFieldProv(field, coords, ctx.raw?.[field]) });
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
      dimmed: ctx.newColl === ctx.collBefore,
    });
  if (ctx.newDebt != null)
    stats.push({
      label: "Debt",
      value: fmt(ctx.newDebt),
      symbol: stable,
      address: stableAddr,
      prov: ledgerFieldProv("newDebt", coords, ctx.raw?.newDebt),
      transition: transitionOf(ctx.newDebt, ctx.debtBefore, "debt", coords, ctx.raw?.debtBefore),
      dimmed: ctx.newDebt === ctx.debtBefore,
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
        dimmed: cr.source === "formula" && ctx.newColl === ctx.collBefore && ctx.newDebt === ctx.debtBefore,
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
        dimmed: true,
      });
    }
  }

  const figures = ctx.eventType === "liquidate" ? polarisLiquidationFigures(ctx) : undefined;

  if (ctx.eventType === "liquidate") {
    // `_collLiquidated` is the ENTIRE collateral seized — the owner's surplus
    // and the liquidator's compensation come out of it — so the row says
    // "seized" and the pool's own leg is stated separately, derived from the
    // three emitted fields.
    liq("collLiquidated", "Collateral seized", PETH.symbol, PETH.address);
    if (figures?.path === "sp")
      stats.push({
        label: "Collateral to the pool",
        value: formatNumber(figures.leg),
        symbol: PETH.symbol,
        address: PETH.address,
        prov: polarisPoolLegProv(ctx, coords),
      });
    liq("debtLiquidated", "Debt absorbed by the pool", stable, stableAddr);
    liq("collRedistributed", "Collateral redistributed", PETH.symbol, PETH.address);
    liq("debtRedistributed", "Debt redistributed", stable, stableAddr);
    liq("collSurplus", "Collateral surplus", PETH.symbol, PETH.address);
    liq("flatComp", "Gas compensation", PETH.symbol, PETH.address);
    liq("collateralComp", "Collateral compensation", PETH.symbol, PETH.address);
  }

  // The protocol's legs at this touch — grouped: interest · gains · PSM · settle.
  leg("accruedInterest", "Interest charged", stable, stableAddr);
  leg("stableGain", "Stability gain", stable, stableAddr);
  leg("bcTokenGain", "Reward pETH", PETH.symbol, PETH.address);
  leg("mintRedeemCollGain", "PSM share · collateral", PETH.symbol, PETH.address);
  leg("mintRedeemDebtGain", "PSM share · debt", stable, stableAddr);
  leg("stablesMintedToEnsureZeroDebt", "Minted to settle", stable, stableAddr);

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
      {stats.length > 0 && <ChainTruthDetail stats={stats} />}
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
          primary rate in force
        </div>
      )}
    </div>
  );
}
