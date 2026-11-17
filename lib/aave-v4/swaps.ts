// Aave V4 position swaps on the page. The timeline is read with `?swaps=1`
// (rails-server api/src/services/aave-v4-swaps.ts): each CoW position swap is
// one event, the given leg's, placed at the later leg and carrying the
// position's state after the swap, with the received leg inside it as
// `context.data.swap.received`. The timeline draws that one event as the swap
// card; everything replayed from the legs (the position card, the lifetime
// flows, the exports) reads both legs again through `expandAaveV4Swaps`. An
// answer without `swaps` serves the legs as two events, and both paths below
// pass them through unchanged.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AaveV4Context, AaveV4Swap } from "@/lib/shared/types/protocols/aave-v4";
import { decimalsOf, type CowSwapView } from "@/lib/cow/surplus";

type V4Event = BaseActivityEvent & { context: { protocol: "aave-v4"; data: AaveV4Context } };

const isV4 = (e: BaseActivityEvent): e is V4Event => e.context?.protocol === "aave-v4";

/** The log index an event id ends with (`<txHash>-<logIndex>`). */
const logIndexOf = (id: string): number => Number(id.slice(id.lastIndexOf("-") + 1));

/** The swap a merged event carries, if any. */
export function aaveV4SwapOf(e: BaseActivityEvent): AaveV4Swap | undefined {
  return isV4(e) ? e.context.data.swap : undefined;
}

/** Each merged swap back as its two legs, in log order: the given leg (with
 *  the after-swap balances list it was served with) and the received leg as
 *  the timeline serves it without `?swaps=1`. Any other event passes through. */
export function expandAaveV4Swaps(events: readonly BaseActivityEvent[]): BaseActivityEvent[] {
  if (!events.some((e) => aaveV4SwapOf(e) != null)) return events as BaseActivityEvent[];
  return events.flatMap((e) => {
    const swap = aaveV4SwapOf(e);
    if (!swap || !isV4(e)) return [e];
    const { swap: _drop, ...data } = e.context.data;
    void _drop;
    const given: BaseActivityEvent = { ...e, context: { protocol: "aave-v4", data } };
    return logIndexOf(given.id) < logIndexOf(swap.received.id) ? [given, swap.received] : [swap.received, given];
  });
}

/** The merged event a received leg's id now lives in, for a deep link to that
 *  leg; null when no swap holds it. */
export function aaveV4SwapByReceivedId(
  events: readonly BaseActivityEvent[] | null | undefined,
  id: string,
): BaseActivityEvent | null {
  return (events ?? []).find((e) => aaveV4SwapOf(e)?.receivedEventId === id) ?? null;
}

/** The swap's CoW figures with the surplus token named (lib/cow/surplus.ts): a
 *  sell order's surplus is in the token it bought, a buy order's in the token it
 *  sold. Null until the settlement is read. */
export function aaveV4CowView(
  swap: AaveV4Swap,
): { view: CowSwapView; trade: { sell: string; buy: string; fee: string } } | null {
  const c = swap.cow;
  if (!c) return null;
  const side = c.kind === "sell" ? swap.buy : swap.sell;
  return {
    view: {
      ...c,
      token: { address: c.surplusToken, symbol: side.symbol, decimals: decimalsOf(side.raw, side.amount) },
      route: "cow_adapter",
    },
    trade: { sell: swap.sell.raw, buy: swap.buy.raw, fee: swap.feeRaw },
  };
}

/** A buy order's refund as the explanation states it: the order's gap (the withdrawn or borrowed leg less what the
 *  Trade sold, in its integers) and the surplus, where both are read and the event's block and transaction are
 *  known for the figure's receipt. The card's line under the grid drops the surplus where this answers, so the
 *  refund is on the card once, every time. */
export function aaveV4StatedRefund(
  ctx: AaveV4Context,
  coords: { blockNumber?: number; txHash?: string } | undefined,
): { gapRaw: bigint; decimals: number; cow: NonNullable<ReturnType<typeof aaveV4CowView>> } | null {
  if (coords?.blockNumber == null || !coords.txHash) return null;
  const swap = ctx.swap;
  if (!swap || swap.cow?.kind !== "buy") return null;
  // The explanation states the Trade, and the gap after it, only where both sides are named and priced.
  if (!swap.sell.symbol || !swap.buy.symbol || !(Number(swap.sell.amount) > 0) || !(Number(swap.buy.amount) > 0))
    return null;
  const cow = aaveV4CowView(swap);
  const decimals = cow?.view.token.decimals;
  const rec = swap.received.context?.data as AaveV4Context | undefined;
  const takenRaw = swap.kind === "debt_swap" ? rec?.raw?.amount : ctx.raw?.amount;
  if (!cow || decimals == null || takenRaw == null || !/^\d+$/.test(takenRaw) || !/^\d+$/.test(swap.sell.raw))
    return null;
  const gapRaw = BigInt(takenRaw) - BigInt(swap.sell.raw);
  return gapRaw > BigInt(0) ? { gapRaw, decimals, cow } : null;
}
