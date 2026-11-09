// Receipts for the reserve page's indexed reads (anatomy M3.4, M3.7, M3.8;
// ui-jobs 541): a day-close rate and utilisation from rails-server's
// reserve-history, and a holder's amount from reserve-holders. Each names the
// route, its source and the rule the figure follows, so a reader can rebuild
// it: the history's `source`, `dayClose` and `identity` are the route's own
// sentences, quoted.

import { powerOfTen, type Provenance } from "@/components/shared/provenance";
import type { HistoryPoint, ReserveHistory, ReserveHolders } from "@/lib/api/fetch-aave-reserve-reads";

const HISTORY_ROUTE = "GET /api/aave-family/reserve-history";
const HOLDERS_ROUTE = "GET /api/aave-family/reserve-holders";
const block = (n: number) => n.toLocaleString("en-US");

/** The reserve factor the point's utilisation divides by, and where it came from. */
function rfNote(p: HistoryPoint, h: ReserveHistory): string {
  const rf = p.rf;
  if (!rf || rf.bps == null) return "not held at this log";
  const at = `${(rf.bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
  if ("before" in rf && rf.basis === "snapshots")
    return `${at}, the configuration words at blocks ${block(rf.before)} and ${block(rf.after)} agreeing`;
  return `${at}, from ${h.reserveFactor.source}`;
}

/** A day's closing supply or borrow rate. */
export function historyRateProv(
  side: "supply" | "borrow",
  symbol: string,
  p: HistoryPoint,
  h: ReserveHistory,
): Provenance {
  const field = side === "supply" ? "liquidityRate" : "variableBorrowRate";
  return {
    kind: "chain",
    pclass: "emitted",
    source: { block: p.log.block, txHash: p.log.txHash },
    summary: `${symbol} ${side} rate at the ${p.date} close — ReserveDataUpdated's ${field} from ${h.source}. ${h.dayClose} That day closes at block ${block(p.closeBlock)}; the log in force is at block ${block(p.log.block)}.`,
    via: `${HISTORY_ROUTE} · ReserveDataUpdated.${field}`,
    scaling: {
      raw: p[field],
      from: "log",
      places: 25,
      why: `the Pool states a rate in rays, ${powerOfTen(27)} standing for 100% a year`,
      unit: "%",
    },
  };
}

/** A day's utilisation from the rate identity. */
export function historyUtilisationProv(symbol: string, p: HistoryPoint, h: ReserveHistory): Provenance {
  return {
    kind: "chain-derived",
    pclass: "emitted",
    source: { block: p.log.block, txHash: p.log.txHash },
    summary: `${symbol} utilisation at the ${p.date} close — from the rates of the log in force at block ${block(p.log.block)} and the reserve factor. ${h.identity}`,
    via: `${HISTORY_ROUTE} · liquidityRate ÷ (variableBorrowRate × (1 − reserve factor))`,
    formula: "liquidityRate ÷ (variableBorrowRate × (1 − reserve factor))",
    inputs: [
      { label: "liquidityRate", value: p.liquidityRate, kind: "chain", pclass: "emitted", note: "ReserveDataUpdated" },
      {
        label: "variableBorrowRate",
        value: p.variableBorrowRate,
        kind: "chain",
        pclass: "emitted",
        note: "ReserveDataUpdated",
      },
      { label: "reserve factor", kind: "chain", pclass: "state", note: rfNote(p, h) },
    ],
  };
}

/** One holder's amount in the reserve. */
export function holderAmountProv(
  side: "supplied" | "borrowed",
  symbol: string,
  decimals: number,
  wallet: string,
  amount: string,
  h: ReserveHolders,
): Provenance {
  return {
    kind: "derived",
    pclass: "indexed",
    summary: `${symbol} ${side} by ${wallet.slice(0, 6)}…${wallet.slice(-4)} — read from ${h.source}, ${h.units}. The view was last refreshed at ${h.refreshedAt ?? "an unknown time"}.`,
    via: `${HOLDERS_ROUTE} · ${h.source}`,
    formula: `amount ÷ ${powerOfTen(decimals)}`,
    inputs: [{ label: "amount", value: amount, kind: "derived", pclass: "indexed", note: "the token's smallest unit" }],
  };
}

const CONFIG_ROUTE = "GET /api/aave-family/reserve-config-log";

/** One configuration change: its block and transaction, which the change
 *  log's surface leaves to this receipt (decision 0059 point 1). */
export function configChangeProv(
  row: { kind: string; block: number; txHash: string; logIndex: number },
  words: string,
  configurator: string,
  explorer: { block: string; tx: string; name: string },
): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    source: { block: row.block, txHash: row.txHash },
    summary: `${words}. The PoolConfigurator's ${row.kind} event at block ${block(row.block)}, log ${row.logIndex} of transaction ${row.txHash}.`,
    contract: { name: "PoolConfigurator", address: configurator },
    via: `${CONFIG_ROUTE} · the configurator's events for this reserve`,
    verify: { kind: "etherscan", href: explorer.tx, text: `The transaction on ${explorer.name}` },
    inputs: [
      {
        label: "block",
        value: block(row.block),
        kind: "chain",
        pclass: "emitted",
        verify: { kind: "etherscan", href: explorer.block, text: `Block ${block(row.block)} on ${explorer.name}` },
      },
    ],
  };
}
