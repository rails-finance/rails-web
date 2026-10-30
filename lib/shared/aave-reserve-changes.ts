/**
 * An Aave-family position's reserve parameter changes, for the markdown
 * export's "Protocol changes" section. The rows come from the PoolConfigurator
 * log the position chart's markers read (/api/chain/aave-v3/config-log;
 * lib/aave-v3/config-changes.ts), and the percentages print as the chart
 * prints them (`bpsWords`, the rule of lib/shared/collateral-factor-changes.ts's
 * `factorPct`).
 *
 * A freeze is one transaction of three logs: PendingLtvChanged keeps the
 * reserve's LTV for its unfreezing, CollateralConfigurationChanged sets the LTV
 * to 0 and leaves the liquidation threshold, and ReserveFrozen sets the flag.
 * The logs of one transaction on one reserve make one row. A reserve's first
 * configuration log is its listing and makes none.
 *
 * Pure and import-free, so the unit tests run it as it stands.
 */

interface At {
  block: number;
  /** The log's place in its transaction where `transactionIndex` is given. */
  logIndex: number;
  transactionIndex?: number;
  timestamp: number;
  txHash: string;
}

/** The configurator logs these rows read: CollateralConfigurationChanged
 *  (`collateral`), ReserveFrozen (`frozen`) and PendingLtvChanged
 *  (`pending-ltv`). Other kinds in the log are passed over. */
export type AaveReserveLog =
  | (At & { kind: "collateral"; asset: string; ltv: number; lt: number; bonus: number })
  | (At & { kind: "frozen"; asset: string; frozen: boolean })
  | (At & { kind: "pending-ltv"; asset: string; ltv: number })
  | (At & { kind: string; asset?: string });

export interface AaveReserveChangeRow {
  timestamp: number;
  block: number;
  txHash: string;
  /** Each log's index, as the receipt names them. */
  logIndexes: number[];
  asset: string;
  symbol: string;
  /** What changed, e.g. "frozen; LTV 75 % → 0 %, liquidation threshold unchanged at 78 %". */
  words: string;
}

/** Basis points as the chart's markers print a factor: whole where whole,
 *  else two places ("78 %", "4.50 %"). */
export function bpsWords(bps: number): string {
  const p = Math.round(bps) / 100;
  return `${p.toFixed(Number.isInteger(p) ? 0 : 2)} %`;
}

const order = (a: At, b: At) =>
  a.block - b.block || (a.transactionIndex ?? 0) - (b.transactionIndex ?? 0) || a.logIndex - b.logIndex;

interface ReserveState {
  ltv?: number;
  lt?: number;
  bonus?: number;
  frozen?: boolean;
}

/** The changes on the reserves in `held` (lowercased address → symbol) from
 *  `since` (unix seconds) on, oldest first. */
export function aaveReserveChanges(
  logs: readonly AaveReserveLog[],
  held: ReadonlyMap<string, string>,
  since: number,
): AaveReserveChangeRow[] {
  const state = new Map<string, ReserveState>();
  // Each transaction's logs on one reserve, in chain order.
  const groups: { asset: string; logs: AaveReserveLog[] }[] = [];
  const open = new Map<string, { asset: string; logs: AaveReserveLog[] }>();
  for (const l of [...logs].sort(order)) {
    if (l.kind !== "collateral" && l.kind !== "frozen" && l.kind !== "pending-ltv") continue;
    const asset = (l.asset ?? "").toLowerCase();
    const k = `${l.txHash}:${asset}`;
    let g = open.get(k);
    if (!g) {
      g = { asset, logs: [] };
      open.set(k, g);
      groups.push(g);
    }
    g.logs.push(l);
  }
  const out: AaveReserveChangeRow[] = [];
  for (const g of groups) {
    const before: ReserveState = { ...(state.get(g.asset) ?? {}) };
    const after: ReserveState = { ...before };
    let pending: number | null = null;
    for (const l of g.logs) {
      if (l.kind === "collateral" && "lt" in l) {
        after.ltv = l.ltv;
        after.lt = l.lt;
        after.bonus = l.bonus;
      } else if (l.kind === "frozen" && "frozen" in l) after.frozen = l.frozen;
      else if (l.kind === "pending-ltv" && "ltv" in l) pending = l.ltv;
    }
    state.set(g.asset, after);
    const symbol = held.get(g.asset);
    const first = g.logs[0];
    if (!symbol || first.timestamp < since) continue;
    const flag = after.frozen !== before.frozen && after.frozen != null ? (after.frozen ? "frozen" : "unfrozen") : null;
    const listed = before.lt != null;
    const params: string[] = [];
    if (listed && after.ltv !== before.ltv) params.push(`LTV ${bpsWords(before.ltv!)} → ${bpsWords(after.ltv!)}`);
    if (listed && after.lt !== before.lt)
      params.push(`liquidation threshold ${bpsWords(before.lt!)} → ${bpsWords(after.lt!)}`);
    else if (listed && params.length > 0) params.push(`liquidation threshold unchanged at ${bpsWords(after.lt!)}`);
    if (listed && after.bonus !== before.bonus)
      params.push(`liquidation bonus ${bpsWords(before.bonus! - 1e4)} → ${bpsWords(after.bonus! - 1e4)}`);
    if (!flag && params.length === 0) continue;
    if (pending != null && pending > 0) params.push(`${bpsWords(pending)} LTV kept for the unfreeze`);
    const words = [flag, params.join(", ")].filter(Boolean).join("; ");
    out.push({
      timestamp: first.timestamp,
      block: first.block,
      txHash: first.txHash,
      logIndexes: g.logs.map((l) => l.logIndex),
      asset: g.asset,
      symbol,
      words,
    });
  }
  return out;
}
