// Each Aave V3 event's neighbours on the loaded timeline: the rows of its own
// transaction (a liquidation and its fee transfer share one), and the latest
// earlier transaction, whose after-state is where this event's before-state
// started (the health factor can move between the two with no event: a price,
// or interest).

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AaveV3Context } from "@/lib/shared/types/protocols/aave-v3";

export type AaveV3TimelineEvent = BaseActivityEvent & { context: { protocol: "aave-v3"; data: AaveV3Context } };

export interface AaveV3Neighbours {
  siblings: AaveV3TimelineEvent[];
  previous?: { blockNumber: number; txHash: string };
}

/** The log index a served id ends with ("kind:pool:tx:logIndex"); 0 when absent. */
const logIndexOf = (id: string): number => {
  const n = Number(id.slice(id.lastIndexOf(":") + 1));
  return Number.isFinite(n) ? n : 0;
};

export function aaveV3Neighbours(events: readonly AaveV3TimelineEvent[]): Map<string, AaveV3Neighbours> {
  const asc = [...events].sort((a, b) => a.blockNumber - b.blockNumber || logIndexOf(a.id) - logIndexOf(b.id));
  const byTx = new Map<string, AaveV3TimelineEvent[]>();
  for (const e of asc) {
    const tx = e.txHash?.toLowerCase();
    if (!tx) continue;
    const list = byTx.get(tx) ?? [];
    list.push(e);
    byTx.set(tx, list);
  }
  const out = new Map<string, AaveV3Neighbours>();
  let prevTx: { blockNumber: number; txHash: string } | undefined;
  let lastTx: { blockNumber: number; txHash: string } | undefined;
  for (const e of asc) {
    const tx = e.txHash?.toLowerCase();
    if (tx && tx !== lastTx?.txHash) {
      prevTx = lastTx;
      lastTx = { blockNumber: e.blockNumber, txHash: tx };
    }
    out.set(e.id, { siblings: tx ? (byTx.get(tx) ?? [e]) : [e], previous: prevTx });
  }
  return out;
}
