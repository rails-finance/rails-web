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
