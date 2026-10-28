// A Fluid T1 vault's liquidation threshold across a position's life (rails-ops
// reference/lifetime-price-chart.md, the Fluid rows; ui-jobs 328 step 8): the
// vault's config logs as rails-server stores them (fluid_vault_config_change,
// /api/fluid/threshold-history), turned into the health view's reads and the
// events row's protocol-change markers.
//
// RULES.
// - The threshold in force at block B is the `after` of the last row at or
//   below B. The view's first read is the one in force at the position's
//   first event; each row after it that moved the threshold is a read on its
//   day, so the line steps there.
// - No row at or below the first event (the history not served, a vault not
//   covered, a failed read) gives no reads: the view holds today's threshold.
// - A row that moved the threshold is a marker on its day, its before → after
//   in percent; the panel draws those inside the life.
//
// Pure.

import type { FactorRead } from "@/lib/shared/flows-health";
import { flowChange, pctWords, type FlowChange } from "@/lib/shared/flows-changes";

const DAY_S = 86_400;

/** The timeline's key for the collateral (lib/fluid/flows.ts). */
const COLL_KEY = "coll";

interface Setting {
  before: number | null;
  after: number;
}

/** One config log, as the route serves it. */
export interface FluidConfigRow {
  blockNumber: string;
  blockTimestamp: number;
  txHash: string;
  txIndex: number;
  logIndex: number;
  txFrom: string | null;
  event: string;
  collateralFactor: Setting;
  liquidationThreshold: Setting;
  liquidationMaxLimit: Setting;
  thresholdChanged: boolean;
}

/** /api/fluid/threshold-history?vault= */
export interface FluidThresholdHistory {
  vault: string;
  vaultId: string;
  vaultType: number;
  pair: string;
  /** False for a smart vault, or while the table is not seeded. */
  covered: boolean;
  /** The settings' scale: 1000, so 850 is 85.0 %. */
  scale: number;
  rows: FluidConfigRow[];
  thresholdChanges: number;
}

/** "85 %", "90.5 %". */
const thresholdWords = (fraction: number) => {
  const p = Math.round(fraction * 1e4) / 100;
  return pctWords(p, Number.isInteger(p) ? 0 : Number.isInteger(p * 10) ? 1 : 2);
};

const sorted = (h: FluidThresholdHistory) =>
  [...h.rows].sort(
    (a, b) => Number(a.blockNumber) - Number(b.blockNumber) || a.txIndex - b.txIndex || a.logIndex - b.logIndex,
  );

const usable = (h: FluidThresholdHistory | null): h is FluidThresholdHistory =>
  h != null && h.covered && h.scale > 0 && Array.isArray(h.rows) && h.rows.length > 0;

const read = (day: number, block: number, lt: number): FactorRead => ({ day, block, lt: { [COLL_KEY]: lt }, line: lt });

/** The threshold across the life from the first event (`first`): the one in
 *  force there, then each change after it. Null where the history does not
 *  reach back to the first event. */
export function fluidThresholdReads(
  h: FluidThresholdHistory | null,
  first: { ts: number; block: number },
): FactorRead[] | null {
  if (!usable(h)) return null;
  const rows = sorted(h);
  let at: FluidConfigRow | null = null;
  for (const r of rows) if (Number(r.blockNumber) <= first.block) at = r;
  if (!at || !(at.liquidationThreshold.after > 0)) return null;
  const out = [read(Math.floor(first.ts / DAY_S), Number(at.blockNumber), at.liquidationThreshold.after / h.scale)];
  for (const r of rows) {
    if (Number(r.blockNumber) <= first.block || !r.thresholdChanged || !(r.liquidationThreshold.after > 0)) continue;
    out.push(read(Math.floor(r.blockTimestamp / DAY_S), Number(r.blockNumber), r.liquidationThreshold.after / h.scale));
  }
  return out;
}

/** Each change to the vault's threshold, as a marker. */
export function fluidThresholdChanges(h: FluidThresholdHistory | null): FlowChange[] {
  if (!usable(h)) return [];
  return sorted(h).flatMap((r) => {
    const lt = r.liquidationThreshold;
    if (!r.thresholdChanged || lt.before == null || !(lt.after > 0)) return [];
    const block = Number(r.blockNumber);
    const from = thresholdWords(lt.before / h.scale);
    const to = thresholdWords(lt.after / h.scale);
    const cf = r.collateralFactor;
    const cfMoved = cf.before != null && cf.before !== cf.after;
    return [
      flowChange({
        ts: r.blockTimestamp,
        block,
        txHash: r.txHash.toLowerCase(),
        name: "Liquidation threshold",
        from,
        to,
        prov: {
          kind: "chain",
          pclass: "emitted",
          summary: `The ${h.pair} vault's liquidation threshold, set to ${to} by its ${r.event} log at block ${block.toLocaleString("en-US")}. Before it, ${from}.${cfMoved ? ` The same log moved the collateral factor from ${thresholdWords(cf.before! / h.scale)} to ${thresholdWords(cf.after / h.scale)}.` : ""} Above the threshold a position of the vault can be liquidated; the change applies to every position of the vault.`,
          contract: { name: `Fluid vault ${h.pair}`, address: h.vault },
          via: "rails-server fluid_vault_config_change · /api/fluid/threshold-history",
          source: { block, txHash: r.txHash.toLowerCase() },
        },
      }),
    ];
  });
}
