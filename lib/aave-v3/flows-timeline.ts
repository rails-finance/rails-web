// Aave V3 (and SparkLend, the same Pool) → the date scrubber's timeline
// (lib/shared/flows-timeline.ts).
// ----------------------------------------------------------------------------
// Every event's legs come from `aaveV3EventLegs`, the classifier the Lifetime
// flows ledger reduces, and are valued the way the ledger values them: at the
// oracle price the event carries, else at today's. The live stop takes its
// held, owed and interest figures from the ledger's own data, so at the live
// stop the two views state the same numbers.
//
// The scrubber needs every event from the position's first: a page holding a
// window of its history (an opening balance, served folders) gets the ledger
// alone. `aaveV3FlowTimeline` returns null there, and wherever a leg cannot be
// valued.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import type { FlowBucket, FlowEvent, FlowSide, FlowTimeline } from "@/lib/shared/flows-timeline";
import { aaveV3EventLegs, aaveV3LiquidationTxs, type AaveV3EventLeg, type FlowLeg } from "./chain-truth-tower";

/** Every bucket an Aave-family position can fill, in drawing order. */
const BUCKETS: FlowBucket[] = [
  { key: "deposited", label: "Deposited", side: "collateral", dir: "in" },
  { key: "received", label: "Received by transfer", short: "Received", side: "collateral", dir: "in", light: true },
  { key: "swappedIn", label: "Swapped in", side: "collateral", dir: "in", light: true },
  { key: "withdrawn", label: "Withdrawn", side: "collateral", dir: "out" },
  { key: "soldToRepay", label: "Sold to repay", side: "collateral", dir: "out", link: "repay-with-collateral" },
  { key: "withdrawnSwapped", label: "Withdrawn and swapped", short: "Swapped out", side: "collateral", dir: "out" },
  { key: "swappedOut", label: "Swapped to another asset", short: "Swapped", side: "collateral", dir: "out" },
  { key: "sent", label: "Sent to another account", short: "Sent", side: "collateral", dir: "out" },
  {
    key: "liquidatedCollateral",
    label: "Liquidated",
    side: "collateral",
    dir: "out",
    tone: "liquidation",
    link: "liquidation",
  },
  { key: "borrowed", label: "Borrowed", side: "debt", dir: "in" },
  { key: "repaid", label: "Repaid", side: "debt", dir: "out" },
  {
    key: "repaidWithCollateral",
    label: "Repaid with collateral",
    short: "With collateral",
    side: "debt",
    dir: "out",
    link: "repay-with-collateral",
  },
  { key: "repaidBySwap", label: "Repaid by a debt swap", short: "Debt swap", side: "debt", dir: "out" },
  { key: "liquidatedDebt", label: "Liquidated", side: "debt", dir: "out", tone: "liquidation", link: "liquidation" },
  { key: "writtenOff", label: "Written off", side: "debt", dir: "out", tone: "liquidation" },
];

const BUCKET_OF: Record<FlowLeg, string> = {
  supplied: "deposited",
  transferredIn: "received",
  swappedIn: "swappedIn",
  withdrawn: "withdrawn",
  soldToRepay: "soldToRepay",
  withdrawnSwapped: "withdrawnSwapped",
  swappedOut: "swappedOut",
  transferredOut: "sent",
  liquidatedCollateral: "liquidatedCollateral",
  borrowed: "borrowed",
  repaid: "repaid",
  repaidBySwap: "repaidBySwap",
  liquidatedDebt: "liquidatedDebt",
  writtenOff: "writtenOff",
};

const bucketOf = (l: AaveV3EventLeg): string | null =>
  l.leg == null ? null : l.fromCollateral ? "repaidWithCollateral" : BUCKET_OF[l.leg];

const sideOf = (bucket: string): FlowSide => BUCKETS.find((b) => b.key === bucket)?.side ?? "collateral";
const signOf = (bucket: string): number => (BUCKETS.find((b) => b.key === bucket)?.dir === "in" ? 1 : -1);

/** The log index an event id ends in ("0xhash:12"), for ordering one block. */
const logIndex = (id: string): number => {
  const n = Number(id.slice(id.lastIndexOf(":") + 1));
  return Number.isFinite(n) ? n : 0;
};

const num = (s: string | undefined): number | null => {
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const usdOf = (lines: TowerLine[] | undefined): number => (lines ?? []).reduce((s, l) => s + (l.usd ?? 0), 0);

/**
 * The scrubber's timeline for an Aave-family position, or null where it cannot
 * be drawn: no events, a valued ledger missing, or a leg with no price.
 *
 * `events` must be the position's whole history. `todayPrices` is the oracle
 * price by lowercase address the ledger values with (`priceByAddress`).
 */
export function aaveV3FlowTimeline(
  events: BaseActivityEvent[],
  tower: ChainTruthTowerData,
  todayPrices: Record<string, number> | undefined,
): FlowTimeline | null {
  if (!tower.valued) return null;
  const ordered = events
    .filter(isAaveV3Event)
    .sort((a, b) => a.timestamp - b.timestamp || a.blockNumber - b.blockNumber || logIndex(a.id) - logIndex(b.id));
  if (ordered.length === 0) return null;
  const liqTxs = aaveV3LiquidationTxs(ordered);
  const priceToday = (address: string | undefined) => {
    const p = address ? todayPrices?.[address.toLowerCase()] : undefined;
    return typeof p === "number" && p > 0 ? p : undefined;
  };

  const running = new Map<string, number>();
  const used = new Set<string>();
  const out: FlowEvent[] = [];
  for (const ev of ordered) {
    const ctx = ev.context.data;
    const legs = aaveV3EventLegs(ev, liqTxs);
    const flowEvent: FlowEvent = {
      id: ev.id,
      ts: ev.timestamp,
      block: ev.blockNumber,
      tick: "collateral",
      legs: [],
      balances: [],
      prices: [],
    };
    const sides = new Set<FlowSide>();
    const stated = new Map<string, { symbol: string; side: FlowSide; amount: number }>();
    const state = (side: FlowSide, asset: string | undefined, symbol: string | undefined, amount: number | null) => {
      if (!asset || !symbol || amount == null) return;
      stated.set(`${side}:${asset.toLowerCase()}`, { symbol, side, amount });
    };
    // The balances the row states after it: a liquidation's supply figures
    // are the collateral reserve's, its debt figures the debt reserve's.
    const isLiq = ctx.eventType === "liquidation";
    state(
      "collateral",
      isLiq ? (ctx.collateralAsset ?? ev.flows[0]?.token) : (ctx.reserve ?? ev.flows[0]?.token),
      isLiq ? ctx.collateralSymbol : ctx.reserveSymbol,
      num(ctx.supplyAfter),
    );
    state(
      "debt",
      ctx.reserve ?? (isLiq ? ev.flows[1]?.token : ev.flows[0]?.token),
      ctx.reserveSymbol,
      num(ctx.debtAfter),
    );
    const s = ctx.swap;
    if (s) {
      state("collateral", s.receivedAsset, s.receivedSymbol, num(s.receivedSupplyAfter));
      state("debt", s.receivedAsset, s.receivedSymbol, num(s.receivedDebtAfter));
    }

    for (const l of legs) {
      const bucket = bucketOf(l);
      if (!bucket || !(l.amount > 0) || !Number.isFinite(l.amount)) continue;
      const address = l.address?.toLowerCase();
      const price = l.price != null && l.price > 0 ? l.price : priceToday(address);
      if (price == null) return null;
      if (l.price != null && l.price > 0 && address) flowEvent.prices.push({ asset: address, usd: l.price });
      flowEvent.legs.push({ bucket, usd: l.amount * price });
      used.add(bucket);
      const side = sideOf(bucket);
      sides.add(side);
      if (!address) continue;
      // A balance the row does not state follows the legs.
      const key = `${side}:${address}`;
      if (!stated.has(key)) {
        const next = Math.max(0, (running.get(key) ?? 0) + signOf(bucket) * l.amount);
        stated.set(key, { symbol: l.symbol, side, amount: next });
      }
    }
    for (const [key, b] of stated) {
      running.set(key, b.amount);
      flowEvent.balances.push({
        asset: key.slice(key.indexOf(":") + 1),
        symbol: b.symbol,
        side: b.side,
        amount: b.amount,
      });
    }
    flowEvent.tick = legs.some((l) => l.leg === "liquidatedCollateral" || l.leg === "liquidatedDebt")
      ? "liquidation"
      : sides.size === 2
        ? "both"
        : sides.has("debt")
          ? "debt"
          : "collateral";
    out.push(flowEvent);
  }

  const c = tower.collateral;
  const d = tower.debt;
  // The ledger states a price change only where its token sums reconcile;
  // elsewhere the balancing segment stays one item, interest and prices.
  const collInterestKnown = c.priceChange != null;
  const debtInterestKnown = d.priceChange != null;
  return {
    buckets: BUCKETS.filter((b) => used.has(b.key)),
    events: out,
    live: {
      collateralUsd: Math.max(0, usdOf(c.current)),
      debtUsd: Math.max(0, usdOf(d.current) + (d.interest?.usd ?? 0)),
      collateralInterestUsd: collInterestKnown ? usdOf(c.earned) : null,
      debtInterestUsd: debtInterestKnown ? (d.interest?.usd ?? 0) + usdOf(d.earned) : null,
    },
    todayPrices,
  };
}
