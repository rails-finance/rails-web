// Polaris's protocol changes on the Lifetime flows events row (rails-ops
// reference/lifetime-price-chart.md, ruling 10): the market's PrimaryRateSet
// logs, as the CDP's rows carry them. Each row names the set in force at it
// (block, log, tx, ordinal: the backend's as-of join), so the sets the page
// sees are those in force at one of the CDP's touches; a set replaced before
// the next touch is counted by the ordinals and named in the receipt.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isPolarisEvent } from "@/lib/shared/types/event-shape";
import { flowChange, pctWords, type FlowChange } from "@/lib/shared/flows-changes";
import { POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";

export function polarisFlowChanges(events: readonly BaseActivityEvent[], stable: string): FlowChange[] {
  const market = Object.values(POLARIS_MARKET_CONFIG).find((m) => m.stable.symbol === stable);
  const sets = new Map<number, { set: NonNullable<ReturnType<typeof rateSetOf>>; rate: number }>();
  for (const e of events) {
    if (!isPolarisEvent(e)) continue;
    const d = e.context.data;
    const set = rateSetOf(d);
    if (!set || d.primaryRate == null || sets.has(set.ordinal)) continue;
    sets.set(set.ordinal, { set, rate: d.primaryRate });
  }
  const seen = [...sets.values()].sort((a, b) => a.set.ordinal - b.set.ordinal);
  return seen.flatMap(({ set, rate }, i) => {
    const prev = seen[i - 1];
    // The set before this one, where the rows carry it.
    const before = prev && prev.set.ordinal === set.ordinal - 1 ? prev : null;
    const unseen = prev ? set.ordinal - prev.set.ordinal - 1 : 0;
    // A set the printed rate does not show moving draws no marker.
    if (before && pctWords(before.rate * 100) === pctWords(rate * 100)) return [];
    return flowChange({
      ts: set.timestamp,
      block: set.block,
      txHash: set.txHash,
      name: "Primary rate",
      from: before ? pctWords(before.rate * 100) : null,
      to: pctWords(rate * 100),
      noted: "polaris:primary-rate",
      prov: {
        kind: "chain",
        pclass: "emitted",
        summary:
          `The ${stable} market's primary rate, set to ${pctWords(rate * 100)} by the cdpManager's PrimaryRateSet at block ${set.block.toLocaleString("en-US")} (log ${set.logIndex}), newPrimaryRate ÷ 10¹⁸. ` +
          `The market sets it on the PSM's mints and redemptions, for every CDP; the wallet that fired it did nothing to this position. ` +
          (before
            ? `The rate before it, ${pctWords(before.rate * 100)}, is the set at block ${before.set.block.toLocaleString("en-US")}.`
            : prev
              ? `${unseen.toLocaleString("en-US")} set${unseen === 1 ? "" : "s"} came between it and the last set this CDP's rows carry (${pctWords(prev.rate * 100)} at block ${prev.set.block.toLocaleString("en-US")}), none in force at a touch of this position, so the value just before it is not read.`
              : "No earlier set is in force at a touch of this position, so the value before it is not read.") +
          " The secondary rate, a function of the market's debt-to-reserve ratio, is added on top and is not on this log.",
        contract: { name: `Polaris ${stable} CDPManager`, address: market?.cdpManager },
        via: "rails-server · the PrimaryRateSet in force at each of the CDP's rows",
        source: { block: set.block, txHash: set.txHash },
      },
    });
  });
}

const rateSetOf = (d: {
  rateSet?: { block: number; logIndex: number; txHash: string; timestamp: number; ordinal: number };
}) => d.rateSet ?? null;
