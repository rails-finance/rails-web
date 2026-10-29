// An f(x) pool's liquidation and rebalance ratios across a position's life
// (rails-ops reference/lifetime-price-chart.md, the f(x) rows; ui-jobs 328
// step 8): the pool's UpdateLiquidateRatios and UpdateRebalanceRatios logs as
// rails-server keeps them (/api/at-block/fx/ratio-log, through
// /api/chain/fx/ratio-log), turned into the health view's reads at each
// change and the events row's protocol-change markers.
//
// RULES.
// - The ratio in force at block B is the debt ratio of the last set of that
//   line at or below B. The first set of each line is the pool's
//   initialisation, before any position, and is not a change.
// - A set that moved a line's debt ratio is a marker on its day, its before →
//   after in percent. A set that moved the bonus alone leaves the line where
//   it was and is not marked.
// - The event reads (/api/chain/fx/event-state at each day's last event,
//   lib/fx/flows-health.ts fxLineReads) give the lines on event days. A
//   change after the position's first event is one more read on its day at
//   its block, both lines as in force after it: the log states the new
//   value, so no chain call is made for it. The line steps there, also
//   where the change falls between two events.
//
// Pure.

import { logOrder } from "@/lib/shared/log-order";
import type { FactorRead } from "@/lib/shared/flows-health";
import { flowChange, pctWords, type FlowChange } from "@/lib/shared/flows-changes";
import { fxLinesRead } from "@/lib/fx/flows-health";

const DAY_S = 86_400;

export type FxRatioLine = "liquidate" | "rebalance";

/** One setter log, as the route serves it: the debt ratio and the bonus as
 *  fractions. */
export interface FxRatioSet {
  block: number;
  timestamp: number;
  txHash: string;
  logIndex: number;
  /** The transaction's index in the block; `logIndex` is then the log's place in it (lib/shared/log-order.ts). */
  transactionIndex?: number;
  line: FxRatioLine;
  debtRatio: number;
  bonusRatio: number;
}

/** /api/chain/fx/ratio-log?pool= */
export interface FxRatioLog {
  pool: string;
  address: string;
  chainId: number;
  fromBlock: number;
  /** The last stored block. */
  toBlock: number;
  sets: FxRatioSet[];
}

const usable = (log: FxRatioLog | null | undefined): log is FxRatioLog =>
  log != null && Array.isArray(log.sets) && log.sets.some((s) => s.line === "liquidate" && s.debtRatio > 0);

const sorted = (log: FxRatioLog) => [...log.sets].sort(logOrder);

/** "95 %", "90.5 %". */
export const fxRatioWords = (fraction: number): string => {
  const p = Math.round(fraction * 1e4) / 100;
  return pctWords(p, Number.isInteger(p) ? 0 : Number.isInteger(p * 10) ? 1 : 2);
};

/** One set that moved a line's debt ratio, with the ratio before it. */
export interface FxRatioStep extends FxRatioSet {
  before: number;
}

/** Each set that moved a line's debt ratio, oldest first. */
export function fxRatioSteps(log: FxRatioLog | null | undefined): FxRatioStep[] {
  if (!usable(log)) return [];
  const last: Partial<Record<FxRatioLine, number>> = {};
  const out: FxRatioStep[] = [];
  for (const s of sorted(log)) {
    const before = last[s.line];
    last[s.line] = s.debtRatio;
    if (before != null && before !== s.debtRatio && s.debtRatio > 0) out.push({ ...s, before });
  }
  return out;
}

/** Both lines in force at the end of `block`; null where either has no set
 *  at or below it. */
export function fxRatiosAt(
  log: FxRatioLog | null | undefined,
  block: number,
): { liquidate: number; rebalance: number } | null {
  if (!usable(log)) return null;
  let liquidate: number | null = null;
  let rebalance: number | null = null;
  for (const s of sorted(log)) {
    if (s.block > block) break;
    if (s.line === "liquidate") liquidate = s.debtRatio;
    else rebalance = s.debtRatio;
  }
  return liquidate != null && rebalance != null && liquidate > 0 && rebalance > 0 ? { liquidate, rebalance } : null;
}

/** One read per change after the position's first event (`firstBlock`), at
 *  the change's block on its day, both lines as in force after it; a block
 *  holding several sets gives one read. */
export function fxRatioChangeReads(log: FxRatioLog | null | undefined, firstBlock: number): FactorRead[] {
  const tsByBlock = new Map(fxRatioSteps(log).map((s) => [s.block, s.timestamp]));
  return [...tsByBlock]
    .filter(([b]) => b > firstBlock)
    .flatMap(([b, ts]) => {
      const at = fxRatiosAt(log, b);
      return at ? [fxLinesRead(Math.floor(ts / DAY_S), b, at.liquidate, at.rebalance)] : [];
    });
}

/** The event reads and the change reads, by block; a change read on a block
 *  an event read already stands at is left out. */
export function fxMergedReads(eventReads: readonly FactorRead[], changeReads: readonly FactorRead[]): FactorRead[] {
  const at = new Set(eventReads.map((r) => r.block));
  return [...eventReads, ...changeReads.filter((r) => !at.has(r.block))].sort((a, b) => a.block - b.block);
}

const LINE_NAME: Record<FxRatioLine, string> = { liquidate: "Liquidation ratio", rebalance: "Rebalance ratio" };
const LINE_EVENT: Record<FxRatioLine, string> = {
  liquidate: "UpdateLiquidateRatios",
  rebalance: "UpdateRebalanceRatios",
};
const LINE_LETS: Record<FxRatioLine, string> = {
  liquidate: "Above it a keeper can liquidate a position of the pool",
  rebalance: "Above it a keeper can rebalance a position's tick",
};

/** Each change to either line, as a marker ("Liquidation ratio 95 % → 90 %"). */
export function fxRatioChanges(log: FxRatioLog | null | undefined, poolName: string): FlowChange[] {
  if (!usable(log)) return [];
  return fxRatioSteps(log).map((s) => {
    const from = fxRatioWords(s.before);
    const to = fxRatioWords(s.debtRatio);
    const tx = s.txHash.toLowerCase();
    return flowChange({
      ts: s.timestamp,
      block: s.block,
      txHash: tx,
      name: LINE_NAME[s.line],
      from,
      to,
      prov: {
        kind: "chain",
        pclass: "emitted",
        summary: `The ${poolName} pool's ${LINE_NAME[s.line].toLowerCase()}, set to ${to} by its ${LINE_EVENT[s.line]} log at block ${s.block.toLocaleString("en-US")}, with a bonus of ${fxRatioWords(s.bonusRatio)}. Before it, ${from}. ${LINE_LETS[s.line]}; the change applies to every position of the pool.`,
        contract: { name: `f(x) ${poolName} pool`, address: log.address },
        via: "rails-server at-block store · /api/at-block/fx/ratio-log",
        source: { block: s.block, txHash: tx },
      },
    });
  });
}
