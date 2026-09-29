// SparkLend → the date scrubber's timeline (lib/shared/flows-timeline.ts).
// ----------------------------------------------------------------------------
// SparkLend is the Aave V3 Pool, so its events take Aave V3's buckets and
// reduction (lib/aave-v3/flows-timeline.ts). The page reads the day rows the
// index serves (GET /api/spark/flows/daily, rails-ops
// reference/lifetime-flows-scrubber.md); the server classifies each row with
// its Aave V3 port under SparkLend's rules, held to `sparkEventLegs` by one
// fixture file (scripts/verify/verify-spark-flow-legs.ts).
//
// The ledger (lib/spark/economics.ts) counts with the same classifier,
// `sparkEventLegs`, so its in and out meet the bars at the live stop.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isSparkEvent } from "@/lib/shared/types/event-shape";
import type { ChainTruthTowerData } from "@/lib/shared/chain-truth-economics";
import type { FlowEvent, FlowTimeline } from "@/lib/shared/flows-timeline";
import type { FlowSeries } from "@/lib/api/fetch-aave-v3-flow-series";
import { scaleRaw } from "@/lib/sources/chain/erc20-meta";
import type { AaveV3EventLeg, FlowLeg } from "@/lib/aave-v3/chain-truth-tower";
import {
  AAVE_V3_FLOW_BUCKETS,
  LIQUIDATIONS_NOT_COUNTED,
  aaveV3FlowLive,
  flowEventsFromLegs,
  flowSeriesTimeline,
  type StatedBalance,
} from "@/lib/aave-v3/flows-timeline";

/** SparkLend's treasury on Ethereum: an spToken transfer to it inside a
 *  liquidation is the liquidation protocol fee (rails-server
 *  services/aave-v3-flow-legs.ts states the evidence). */
export const SPARK_TREASURY = "0xb137e7d16564c81ae2b0c8ee6b55de81dd46ece5";
/** SparkLend's WETH gateway on Ethereum: a transfer to it is a withdrawal to ETH. */
export const SPARK_WETH_GATEWAY = "0xbd7d6a9ad7865463de44b05f04559f65e3b11704";

type SparkEvent = BaseActivityEvent & { context: { protocol: "spark" } };

const num = (s: string | undefined): number | null => {
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** The transactions that carry a liquidation. */
export function sparkLiquidationTxs(events: BaseActivityEvent[]): Set<string | undefined> {
  return new Set(
    events
      .filter((e) => isSparkEvent(e) && e.context.data.eventType === "liquidation")
      .map((e) => e.txHash?.toLowerCase()),
  );
}

/** A liquidation's debt asset: its flows are [collateral out, debt out], the
 *  first absent when nothing was seized. */
const debtAssetOf = (ev: BaseActivityEvent, collAddr: string | undefined): string | undefined =>
  ev.flows.find((f, i) => i > 0 || f.token !== collAddr)?.token ?? undefined;

/** The legs one SparkLend event adds to the lifetime flows (rails-server
 *  `rowLegs` under `SPARK_RULES`). Amounts are the log's integers scaled. */
export function sparkEventLegs(ev: BaseActivityEvent, liqTxs: Set<string | undefined>): AaveV3EventLeg[] {
  if (!isSparkEvent(ev)) return [];
  const ctx = ev.context.data;
  const out: AaveV3EventLeg[] = [];
  if (ctx.eventType === "liquidation") {
    const seized = Math.abs(Number(ctx.liquidatedCollateralAmount));
    const covered = Math.abs(Number(ctx.debtToCover));
    const collAddr = ctx.collateralAsset ?? ev.flows[0]?.token;
    if (ctx.collateralSymbol && ctx.collateralSymbol !== "?" && Number.isFinite(seized))
      out.push({
        symbol: ctx.collateralSymbol,
        address: collAddr,
        leg: "liquidatedCollateral",
        amount: seized,
        price: ctx.collateralPrice?.usd,
      });
    if (ctx.reserveSymbol && ctx.reserveSymbol !== "?" && Number.isFinite(covered))
      out.push({
        symbol: ctx.reserveSymbol,
        address: debtAssetOf(ev, collAddr),
        leg: "liquidatedDebt",
        amount: covered,
        price: ctx.debtPrice?.usd,
      });
    return out;
  }
  const flow = ev.flows[0];
  if (!flow || !ctx.reserveSymbol || ctx.reserveSymbol === "?" || ctx.raw?.amount == null) return out;
  const mag = Math.abs(scaleRaw(BigInt(ctx.raw.amount), flow.tokenDecimals));
  if (!Number.isFinite(mag) || mag === 0) return out;
  const symbol = ctx.reserveSymbol;
  const address = flow.token;
  const px = ctx.price?.usd;
  const counterparty = ctx.counterparty?.toLowerCase();
  if (ctx.eventType === "transfer_out" && counterparty === SPARK_TREASURY && liqTxs.has(ev.txHash?.toLowerCase())) {
    out.push({ symbol, address, leg: "liquidatedCollateral", amount: mag, price: px, treasuryFee: true });
    return out;
  }
  const own = (leg: FlowLeg | null) => out.push({ symbol, address, leg, amount: mag, price: px });
  if (ctx.eventType === "transfer_out") own(counterparty === SPARK_WETH_GATEWAY ? "withdrawn" : "transferredOut");
  else if (ctx.eventType === "transfer_in") own("transferredIn");
  else if (ctx.eventType === "supply") own("supplied");
  else if (ctx.eventType === "withdraw") own("withdrawn");
  else if (ctx.eventType === "borrow") own("borrowed");
  else if (ctx.eventType === "repay") own("repaid");
  else own(null);
  return out;
}

/** The balances a SparkLend event states after it: a liquidation's supply
 *  figures are the collateral reserve's, its debt figures the debt reserve's. */
function sparkStated(ev: SparkEvent): StatedBalance[] {
  if (!isSparkEvent(ev)) return [];
  const ctx = ev.context.data;
  const out: StatedBalance[] = [];
  const state = (
    side: "collateral" | "debt",
    asset: string | undefined,
    symbol: string | undefined,
    amount: number | null,
  ) => {
    if (asset && symbol && symbol !== "?" && amount != null) out.push({ side, asset, symbol, amount });
  };
  if (ctx.eventType === "liquidation") {
    const collAddr = ctx.collateralAsset ?? ev.flows[0]?.token;
    state("collateral", collAddr, ctx.collateralSymbol, num(ctx.supplyAfter));
    state("debt", debtAssetOf(ev, collAddr), ctx.reserveSymbol, num(ctx.debtAfter));
  } else if (ctx.side === "supply") state("collateral", ev.flows[0]?.token, ctx.reserveSymbol, num(ctx.supplyAfter));
  else state("debt", ev.flows[0]?.token, ctx.reserveSymbol, num(ctx.debtAfter));
  return out;
}

/** Each event's legs in USD, the balances it states and the prices it
 *  carries, or null where a leg has no price at its block or today: the
 *  event-level answer the route is tested against. */
export function sparkFlowEvents(
  events: BaseActivityEvent[],
  todayPrices: Record<string, number> | undefined,
): { events: FlowEvent[]; used: Set<string> } | null {
  // Ascending by block; within a block the index's order stands (a stable sort).
  const ordered = (events.filter(isSparkEvent) as SparkEvent[]).sort(
    (a, b) => a.timestamp - b.timestamp || a.blockNumber - b.blockNumber,
  );
  const liqTxs = sparkLiquidationTxs(ordered);
  return flowEventsFromLegs(ordered, (ev) => sparkEventLegs(ev, liqTxs), sparkStated, todayPrices, {
    notCounted: LIQUIDATIONS_NOT_COUNTED,
  });
}

/** The scrubber's timeline from the index's day rows. */
export function sparkFlowSeriesTimeline(
  series: FlowSeries,
  tower: ChainTruthTowerData | null,
  todayPrices: Record<string, number> | undefined,
): FlowTimeline | null {
  return flowSeriesTimeline(
    series,
    AAVE_V3_FLOW_BUCKETS,
    tower?.valued === true ? aaveV3FlowLive(tower) : null,
    todayPrices,
  );
}
