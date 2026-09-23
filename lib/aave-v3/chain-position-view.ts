// A live V3-family Pool read, in the shape the shared Aave V3 economics speak.
// ----------------------------------------------------------------------------
// `computeAaveV3Economics` and `computeAaveV3CardCaptions` (lib/aave-v3/
// chain-truth-tower.ts) take an `AaveV3PositionView` — which on Ethereum is
// built from a LISTING row, because that is where an indexed explorer's
// per-position figures come from. The Base explorers have no listing and no
// index. What they have is the live Pool read the position card already
// renders, and that read carries every field those two functions actually
// touch: the per-reserve current balances, the block they were pinned to, and
// the health factor.
//
// Shared by every index-free V3-family explorer (Aave V3 Base, Seamless, and
// whichever fork comes next), because the adapter has nothing deployment-
// specific in it: the Pool answers the same struct wherever it is deployed.
//
// So this is an adapter, not a second implementation. The reduction that turns
// events into lifetime flows, the plausibility gates on the accrued-interest
// split, the strict per-total pricing guard — all of it stays in the one place,
// and the Base tower is the Ethereum tower fed from a different source. A fix
// to the arithmetic lands on both explorers or on neither.
//
// The fields the Pool cannot supply — the peaks a closed card shows, and the
// activity metadata in its meta cluster — come from the sweep, and ONLY when
// the sweep read the whole life: a "highest recorded" over a horizoned or
// holed history would name a maximum the wallet may have exceeded before the
// sweep could see. Without a whole sweep they stay at their empty values,
// never guessed.

import type { AaveV3PositionView, AaveV3ReserveAmount } from "@/components/protocol/aave-v3/aave-v3-position-card";
import { scaleV3ChainBalance, type AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";
import type { ChainTimelineResponse } from "@/lib/api/fetch-chain-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";

/** The sweep, as the view consumes it: the response and whether it read every
 *  block of the Pool's life (no holes, from the deployment block). */
export interface V3SweptHistory {
  timeline: ChainTimelineResponse;
  whole: boolean;
}

function peaksFrom(timeline: ChainTimelineResponse, side: "supply" | "debt"): AaveV3ReserveAmount[] {
  const out: AaveV3ReserveAmount[] = [];
  for (const f of timeline.lifetime) {
    const amount = side === "supply" ? f.peakSupplied : f.peakBorrowed;
    const raw = side === "supply" ? f.peakSuppliedRaw : f.peakBorrowedRaw;
    if (amount == null || raw == null || amount <= 0 || !f.address || f.decimals == null) continue;
    out.push({ symbol: f.symbol, address: f.address, decimals: f.decimals, amount, amountRaw: raw });
  }
  out.sort((a, b) => b.amount - a.amount);
  return out;
}

/** Aave reports a debt-free account's health factor as the max uint. */
const NO_DEBT_HF = 1e12;

function amounts(
  reserves: AaveV3PositionChainResponse["reserves"],
  pick: (r: AaveV3PositionChainResponse["reserves"][number]) => string,
): AaveV3ReserveAmount[] {
  return reserves
    .map((r) => ({
      symbol: r.symbol,
      address: r.address,
      decimals: r.decimals,
      amount: scaleV3ChainBalance(pick(r), r.decimals),
      amountRaw: pick(r),
    }))
    .filter((r) => r.amount > 0);
}

/**
 * Adapt the live Base Pool read into the shared view.
 *
 * `prices` is the on-chain oracle USD keyed by lowercased reserve address —
 * merged from /api/chain/aave-v3-base/oracle-prices. Passing none is valid: the
 * tower's per-total guard then drops it to the token-only list, which is the
 * correct rendering of "no price", not a degraded one.
 *
 * `events` are used only to tell a CLOSED position from a LIQUIDATED one. The
 * Pool's own read cannot: an emptied account and a seized one both read as
 * zeros, and calling a liquidation a voluntary exit is the kind of wrong that
 * changes what the position means. They are the DRAWN rows — the newest
 * thousand — so a whole sweep's own count (`liquidationCount`, walked over
 * every row) is preferred, and its lifetime flows settle the closed/liquidated
 * split for a seeded wallet whose seizures sit before the seed's cut: the seed
 * carries the amounts seized, not a count.
 */
export function v3ViewFromChain(
  chain: AaveV3PositionChainResponse,
  /** The market key the view carries. One Pool per Base deployment, so this is
   *  an identity ("base", "seamless") rather than a choice between markets the
   *  way Ethereum's core/prime/etherfi is. */
  market: string,
  prices?: Record<string, number>,
  events?: BaseActivityEvent[],
  /** The sweep, for the peaks and the activity metadata. Only a WHOLE sweep
   *  fills them — see the header. */
  history?: V3SweptHistory | null,
): AaveV3PositionView {
  const supplies = amounts(chain.reserves, (r) => r.supplyBalanceRaw);
  const borrows = amounts(chain.reserves, (r) => r.debtBalanceRaw);
  const open = supplies.length > 0 || borrows.length > 0;
  const whole = history?.whole ? history.timeline : null;
  const drawnLiquidations = (events ?? []).filter(
    (e) => isAaveV3Event(e) && e.context.data.eventType === "liquidation",
  ).length;
  const liquidationCount = whole?.liquidationCount ?? drawnLiquidations;
  const seizedBeforeCut = (whole?.lifetime ?? []).some((l) => l.liquidatedDebt > 0 || l.liquidatedCollateral > 0);
  const everLiquidated = liquidationCount > 0 || seizedBeforeCut;

  const hf = chain.healthFactor;
  return {
    wallet: chain.wallet,
    market,
    status: open ? "open" : everLiquidated ? "liquidated" : "closed",
    supplies,
    borrows,
    peakSupplies: whole ? peaksFrom(whole, "supply") : [],
    peakBorrows: whole ? peaksFrom(whole, "debt") : [],
    liquidationCount,
    txCount: whole?.txCount ?? 0,
    lastActivityAt: whole?.lastActivityAt ?? 0,
    priceByAddress: prices,
    atBlock: chain.blockNumber,
    healthFactor: hf != null && hf < NO_DEBT_HF ? hf : null,
    chainHfStale: chain.chainStale,
  };
}
