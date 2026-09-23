// The Aave V3 Base write-offs this timeline does not show, found per wallet.
// ----------------------------------------------------------------------------
// Since the Base Pool's V3.3 upgrade, a liquidation that leaves debt with no
// collateral behind it ends with the Pool burning that debt (DeficitCreated).
// The Base history reads the Pool's Supply/Withdraw/Borrow/Repay/Liquidation
// logs and not that one, so the replay never subtracts the burn and the debt
// lane ends above zero. Miles's call (rails-ops, 2026-09-21): state the gap on
// the page rather than capture the event for now.
//
// Measured 2026-09-21 to Base block 51,620,605: 12,033 write-offs, all dust
// (about $50 in total), first at block 26,948,787; on 786 wallets the replay
// still ends above zero by the unrecorded burn. Every write-off sits in a
// transaction that liquidates the same wallet.
//
// No list of those wallets is shipped: it would go stale with the next
// write-off. The page finds them from what it already holds. The symptom is a
// reserve whose replayed debt ends above zero while the Pool reads no debt on
// it. The replay sums principal and leaves out interest, so without a missed
// burn it can only end at or below the Pool's figure. Requiring a liquidation
// from the first write-off's block onward pins the cause.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import type { AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";

/** The block of the Base Pool's first DeficitCreated log. */
export const AAVE_V3_BASE_FIRST_WRITE_OFF_BLOCK = 26_948_787;

export interface WriteOffLeftover {
  symbol: string;
  /** The replay's closing debt on the reserve, human-readable. */
  amount: string;
}

/** Each reserve where the history ends with debt the Pool no longer holds,
 *  or an empty list. `events` in replay order, oldest first. */
export function aaveV3BaseWriteOffLeftovers(
  events: readonly BaseActivityEvent[],
  position: AaveV3PositionChainResponse | null,
): WriteOffLeftover[] {
  if (!position || position.chainStale) return [];
  const aave = events.filter(isAaveV3Event);
  const liquidatedSince = aave.some(
    (e) => e.context.data.eventType === "liquidation" && e.blockNumber >= AAVE_V3_BASE_FIRST_WRITE_OFF_BLOCK,
  );
  if (!liquidatedSince) return [];

  // The closing debt per reserve: the last debt-lane row wins.
  const closing = new Map<string, { raw: string; amount: string }>();
  for (const e of aave) {
    const d = e.context.data;
    if (d.eventType !== "borrow" && d.eventType !== "repay" && d.eventType !== "liquidation") continue;
    if (!d.reserveSymbol || d.raw?.debtAfter == null) continue;
    closing.set(d.reserveSymbol, { raw: d.raw.debtAfter, amount: d.debtAfter ?? d.raw.debtAfter });
  }

  const poolDebt = new Map(position.reserves.map((r) => [r.symbol, r.debtBalanceRaw]));
  const out: WriteOffLeftover[] = [];
  for (const [symbol, c] of closing) {
    if (BigInt(c.raw) <= BigInt(0)) continue;
    const held = poolDebt.get(symbol);
    if (held != null && BigInt(held) > BigInt(0)) continue;
    out.push({ symbol, amount: c.amount });
  }
  return out;
}
