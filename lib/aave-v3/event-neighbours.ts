// Each Aave V3 event's neighbours on the loaded timeline: the rows of its own
// transaction (a liquidation and its fee transfer share one), and the latest
// earlier transaction, whose after-state is where this event's before-state
// started (the health factor can move between the two with no event: a price,
// or interest).

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AaveV3Context } from "@/lib/shared/types/protocols/aave-v3";
import { isAaveCollector } from "./liquidation-fee";

export type AaveV3TimelineEvent = BaseActivityEvent & { context: { protocol: "aave-v3"; data: AaveV3Context } };

export interface AaveV3Neighbours {
  siblings: AaveV3TimelineEvent[];
  /** The previous transaction, and its last row on the timeline. */
  previous?: { blockNumber: number; txHash: string; event?: AaveV3TimelineEvent };
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
  let prevTx: AaveV3Neighbours["previous"];
  let lastTx: AaveV3Neighbours["previous"];
  for (const e of asc) {
    const tx = e.txHash?.toLowerCase();
    if (tx && tx !== lastTx?.txHash) {
      prevTx = lastTx;
      lastTx = { blockNumber: e.blockNumber, txHash: tx, event: e };
    } else if (tx && lastTx) {
      lastTx.event = e;
    }
    out.set(e.id, { siblings: tx ? (byTx.get(tx) ?? [e]) : [e], previous: prevTx });
  }
  return out;
}

/** Why the timeline's event count and the card's transaction count differ.
 *  The transaction count (the index's `tx_count`) counts the transactions with
 *  a Pool call of the owner's in them, so it leaves out liquidations and any
 *  transaction whose only rows are aToken transfers: a transfer to another
 *  account or to a WETH gateway, and a withdraw and swap, whose Pool call is
 *  the adapter's. */
export interface AaveV3CountSplit {
  events: number;
  /** Transactions of transfer rows only, by what the row was. */
  transferOnly: { kind: string; count: number }[];
  liquidations: number;
  /** Rows beyond the first in a transaction (a liquidation's fee row). */
  sharedTxRows: number;
  /** Of those, a liquidation's fee to the Aave treasury. */
  feeRows: number;
}

const hasPoolCall = (e: AaveV3TimelineEvent): boolean => {
  const c = e.context.data;
  if (c.eventType === "liquidation" || c.eventType === "transfer_in" || c.eventType === "transfer_out") return false;
  if (c.eventType !== "swap" || !c.swap) return true;
  const s = c.swap;
  const pool = (a: string | undefined) => a === "supply" || a === "borrow" || a === "repay";
  return pool(s.givenAction) || pool(s.receivedAction) || (s.events ?? []).some((r) => pool(r.action));
};

const transferKind = (e: AaveV3TimelineEvent, gateway: (a?: string) => boolean): string => {
  const c = e.context.data;
  if (c.eventType === "swap")
    return c.swap?.kind === "supply_from_swap" ? "a supply from a swap" : "a withdraw and swap";
  if (c.eventType === "transfer_out" && gateway(c.counterparty)) return "a withdrawal through the WETH gateway";
  return c.eventType === "transfer_in" ? "an aToken transfer in" : "an aToken transfer out";
};

export function aaveV3CountSplit(
  events: readonly AaveV3TimelineEvent[],
  gateway: (address?: string) => boolean,
): AaveV3CountSplit {
  const byTx = new Map<string, AaveV3TimelineEvent[]>();
  for (const e of events) {
    const tx = e.txHash?.toLowerCase() ?? e.id;
    byTx.set(tx, [...(byTx.get(tx) ?? []), e]);
  }
  const kinds = new Map<string, number>();
  for (const rows of byTx.values()) {
    if (rows.some(hasPoolCall) || rows.some((r) => r.context.data.eventType === "liquidation")) continue;
    const k = transferKind(rows[0], gateway);
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
  }
  return {
    events: events.length,
    transferOnly: [...kinds].map(([kind, count]) => ({ kind, count })),
    liquidations: events.filter((e) => e.context.data.eventType === "liquidation").length,
    sharedTxRows: events.length - byTx.size,
    feeRows: [...byTx.values()].reduce(
      (n, rows) =>
        rows.some((r) => r.context.data.eventType === "liquidation")
          ? n +
            rows.filter(
              (r) => r.context.data.eventType === "transfer_out" && isAaveCollector(r.context.data.counterparty),
            ).length
          : n,
      0,
    ),
  };
}

/** The count badge's and the card's statement of the rows: the total, and
 *  one line per kind after the owner's transactions (which the card words,
 *  knowing who sent them). `parts` is empty where the kinds do not add
 *  up to the total; `text` then carries the older sentence. */
export interface AaveV3CountNote {
  text: string;
  total: number;
  txCount: number;
  parts: string[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const TRANSFER_WORDS: Record<string, [string, string]> = {
  "an aToken transfer out": ["transfer out", "transfers out"],
  "an aToken transfer in": ["transfer in", "transfers in"],
  "a withdrawal through the WETH gateway": [
    "withdrawal through the WETH gateway",
    "withdrawals through the WETH gateway",
  ],
  "a withdraw and swap": ["withdraw and swap", "withdraws and swaps"],
  "a supply from a swap": ["supply from a swap", "supplies from swaps"],
};

export function aaveV3CountNote(split: AaveV3CountSplit, txCount: number): AaveV3CountNote | null {
  const text = aaveV3CountSentence(split, txCount);
  if (text == null) return null;
  const parts: string[] = [];
  if (split.liquidations > 0)
    parts.push(plural(split.liquidations, "liquidation by a liquidator", "liquidations by liquidators"));
  if (split.feeRows > 0) parts.push(plural(split.feeRows, "treasury fee row", "treasury fee rows"));
  for (const k of split.transferOnly) {
    const w = TRANSFER_WORDS[k.kind] ?? [k.kind.replace(/^an? /, ""), k.kind.replace(/^an? /, "")];
    parts.push(plural(k.count, w[0], w[1]));
  }
  const otherShared = split.sharedTxRows - split.feeRows;
  if (otherShared > 0)
    parts.push(
      plural(otherShared, "more row in a transaction already counted", "more rows in transactions already counted"),
    );
  const t = split.transferOnly.reduce((n, k) => n + k.count, 0);
  const adds = txCount + split.liquidations + split.feeRows + t + Math.max(0, otherShared) === split.events;
  if (!adds) return { text, total: split.events, txCount, parts: [] };
  return {
    text: `${split.events} rows: ${[`${plural(txCount, "transaction", "transactions")} by or for the owner`, ...parts].join(", ")}.`,
    total: split.events,
    txCount,
    parts,
  };
}

/** The sentence the count badge and the card's explanation share. */
export function aaveV3CountSentence(split: AaveV3CountSplit, txCount: number): string | null {
  if (split.events === txCount) return null;
  const parts: string[] = [];
  const t = split.transferOnly.reduce((n, k) => n + k.count, 0);
  if (t > 0)
    parts.push(
      `${t} ${t === 1 ? "is a transaction" : "are transactions"} with no Pool call of the owner's, only an aToken transfer (${split.transferOnly
        .map((k) => (k.count > 1 ? `${k.count} × ${k.kind.replace(/^an? /, "")}` : k.kind))
        .join(", ")})`,
    );
  if (split.liquidations > 0)
    parts.push(`${split.liquidations} ${split.liquidations === 1 ? "is a liquidation" : "are liquidations"}`);
  if (split.sharedTxRows > 0)
    parts.push(
      `${split.sharedTxRows} ${split.sharedTxRows === 1 ? "shares a transaction" : "share a transaction"} with another row`,
    );
  if (parts.length === 0) return null;
  return `The timeline lists ${split.events} events: ${parts.join("; ")}.`;
}
