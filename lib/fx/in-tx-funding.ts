// Funding the pool books inside a position's own transaction.
//
// getPosition is a view over the collateral index as it was last written. The
// first call into the pool in a later block (AaveFundingPool._updateCollAndDebtIndex)
// writes the funding accrued since, ahead of whatever the call does. A read at
// block − 1 therefore still holds the old index, and the funding lands in the
// row whose transaction was that first call:
//
//   funding in the row = (collateral at block − collateral at block − 1)
//                        − what the row deposited or withdrew, as the pool holds it
//
// Rows of a block that holds two of the position's own transactions share one
// read, so the card sums them.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isFxEvent } from "@/lib/shared/types/event-shape";
import type { FxStateAt } from "@/lib/sources/chain/fx-event-state";
import { FX_POOLS, isFxPoolKey } from "@/lib/fx/asset-catalog";

const WAD = 1e18;

/** Funding is reported only above this fraction of the collateral before the
 *  row (the reads agree to about 1e-16 without it). */
const REL_FLOOR = 1e-9;

/** What a row moved in collateral, in the pool's token units, as the position
 *  gained or lost it. The old manager (before PoolConfiguration) emitted a
 *  withdrawal's amount net of the fee it kept, in `protocolFees`, so the
 *  position lost the two together; a deposit's amount is the collateral
 *  credited. */
export function fxCollMoved(d: { collDelta?: string; protocolFees?: string }): number {
  const coll = Number(d.collDelta ?? "0") || 0;
  const fee = Number(d.protocolFees ?? "0") || 0;
  return coll < 0 ? coll - fee : coll;
}

/** Collateral the pool took as funding inside one row's transaction (positive),
 *  or null when the row states none. `rate` is the wstETH→stETH rate at the
 *  block, null on a pool whose token is its own unit. */
export function fxRowFunding(
  collDeltaToken: number,
  rate: number | null,
  before: number | null,
  after: number | null,
): number | null {
  if (before == null || after == null || before <= 0) return null;
  const moved = collDeltaToken * (rate ?? 1);
  const taken = -(after - before - moved);
  return Math.abs(taken) > before * REL_FLOOR ? taken : null;
}

export interface FxInTxFundingRow {
  block: number;
  ts: number;
  /** Collateral the pool took, normalized units (positive). */
  taken: number;
}

export interface FxInTxFunding {
  rows: FxInTxFundingRow[];
  /** Σ taken. */
  total: number;
  /** Own operate rows read (each block once). */
  reads: number;
}

/** The position's own operate rows, in blocks that hold one of them each; the
 *  blocks that need reading. */
export function fxOperateBlocks(events: BaseActivityEvent[]): number[] {
  const perBlock = new Map<number, number>();
  for (const e of events.filter(isFxEvent)) {
    if (e.context.data.eventType === "operate") perBlock.set(e.blockNumber, (perBlock.get(e.blockNumber) ?? 0) + 1);
  }
  return [...perBlock.keys()].sort((a, b) => a - b);
}

/** Funding booked inside the position's own operate rows, from the reads at
 *  their blocks. Null until every block has read, or where the position has a
 *  liquidation of its own (whose read would mix with it). */
export function fxInTxFunding(
  events: BaseActivityEvent[],
  reads: Record<string, FxStateAt> | null | undefined,
): FxInTxFunding | null {
  if (!reads) return null;
  const fx = events.filter(isFxEvent);
  const perBlock = new Map<number, { delta: number; ts: number; pool: string }>();
  for (const e of fx) {
    const d = e.context.data;
    if (d.eventType === "liquidation" && !d.poolWide) return null;
    if (d.eventType !== "operate") continue;
    const cur = perBlock.get(e.blockNumber) ?? { delta: 0, ts: e.timestamp, pool: d.pool };
    cur.delta += fxCollMoved(d);
    perBlock.set(e.blockNumber, cur);
  }
  const rows: FxInTxFundingRow[] = [];
  let total = 0;
  for (const [block, { delta, ts, pool }] of perBlock) {
    const b = reads[String(block - 1)];
    const a = reads[String(block)];
    if (!a?.colls || !b?.colls) return null;
    const meta = isFxPoolKey(pool) ? FX_POOLS[pool] : undefined;
    const converts = meta != null && meta.tokenSymbol !== meta.normalizedSymbol;
    const rate = converts ? (a.rate != null ? Number(a.rate) / WAD : null) : null;
    if (converts && rate == null) return null;
    // A block with two of the position's own rows reads once for both, so the
    // rows' deltas are summed.
    const taken = fxRowFunding(delta, rate, Number(b.colls) / WAD, Number(a.colls) / WAD);
    if (taken != null) {
      rows.push({ block, ts, taken });
      total += taken;
    }
  }
  rows.sort((x, y) => x.block - y.block);
  return { rows, total, reads: perBlock.size };
}

/** A funding figure: three decimals from 1 up, three significant digits below
 *  (0.00764, not 0.008), so the parts of a total add up on the page. */
export function fxFundingText(n: number): string {
  const a = Math.abs(n);
  if (a >= 1) return a.toLocaleString("en-US", { maximumFractionDigits: 3, minimumFractionDigits: 3 });
  if (a === 0) return "0";
  const places = Math.min(12, 2 - Math.floor(Math.log10(a)));
  return a.toFixed(places).replace(/\.?0+$/, "");
}
