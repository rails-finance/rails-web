// Governance changes to an Aave V3-family account's liquidation thresholds, as
// markers on the Lifetime flows panel's events row and as extra reads for the
// health view (rails-ops reference/lifetime-price-chart.md, the Aave row and
// ruling 10; ui-jobs 328 steps 8 and 9). Aave V3 Ethereum, SparkLend, Aave V3
// on Base and Seamless, from their PoolConfigurator's logs
// (/api/chain/aave-v3/config-log).
//
// RULES.
// - A reserve's threshold is its CollateralConfigurationChanged's
//   liquidationThreshold, in force from its block. A reserve's first log is its
//   listing and draws none; a log that moves only the LTV or the bonus draws
//   none (neither moves the health factor).
// - An account in an e-mode category takes the category's threshold on each
//   reserve that is collateral in it. So a reserve-level change on such a
//   reserve does not move the account's line: it draws a marker whose receipt
//   says so, and asks no read. A category's threshold change
//   (EModeCategoryAdded on an id already set) draws a marker only where the
//   account was in that category and held one of its collaterals; its first
//   log is its creation and draws none.
// - Membership: before v3.2 a reserve is collateral in the category its
//   configuration names (EModeAssetCategoryChanged); from v3.2 each category
//   holds a collateral bitmap (AssetCollateralInEModeChanged). The v3.2
//   upgrade re-emitted every legacy membership in its block, so the bitmap is
//   seeded from the legacy memberships at its first log. A membership change
//   on a reserve the account held, while in that category, moves the reserve
//   between the category's threshold and its own, and is a marker.
// - The account's category at a change is its last e-mode switch before it
//   (lib/aave-v3/account-switches.ts), by block, transaction and log
//   (lib/shared/log-order.ts): a switch in the change's block counts where
//   its transaction came first.
// - Where a change moves the line and the account held an affected reserve as
//   collateral against a debt on its day, the change's block is one more read
//   (`configChangePicks`), through the family's position-state read at the
//   change's transaction.
// - Several logs in one block draw one marker per name, before the block →
//   after it; none where the block ends where it began.
//
// Pure: no fetch.

import type { HealthPick } from "@/hooks/useFlowsHealth";
import { flowChange, type FlowChange } from "@/lib/shared/flows-changes";
import { factorPct } from "@/lib/shared/collateral-factor-changes";
import { logOrder } from "@/lib/shared/log-order";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { AaveFamilyEmodeSwitch } from "@/lib/aave-v3/account-switches";

interface At {
  block: number;
  /** The log's place in its transaction (`transactionIndex` given). */
  logIndex: number;
  /** The transaction's index in the block (lib/shared/log-order.ts). */
  transactionIndex?: number;
  /** Read from victoria's mainnet Sieve's table; a row without it is rails-server's store. */
  sieve?: true;
  timestamp: number;
  txHash: string;
}

/** One configurator log, as rails-server decodes it; thresholds in basis points. */
export type AaveConfigLog =
  | (At & { kind: "collateral"; asset: string; ltv: number; lt: number; bonus: number })
  | (At & { kind: "category"; categoryId: number; ltv: number; lt: number; bonus: number; label: string })
  | (At & { kind: "asset-category"; asset: string; from: number; to: number })
  | (At & { kind: "emode-collateral"; asset: string; categoryId: number; collateral: boolean });

/** /api/chain/aave-v3/config-log. */
export interface AaveConfigLogAnswer {
  market: string;
  chainId: number;
  configurator: string;
  source: "sieve" | "store";
  fromBlock: number;
  toBlock: number;
  logs: AaveConfigLog[];
}

/** A change, the reserves it moves (timeline keys) and whether it moves this
 *  account's line. */
export type AaveConfigChange = FlowChange & { assets: string[]; moves: boolean };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const pct = (bps: number) => factorPct(bps / 1e4);
/** A switch's place, to order it against the configurator's logs. */
const switchAt = (x: AaveFamilyEmodeSwitch) => ({
  block: x.blockNumber,
  transactionIndex: x.transactionIndex,
  logIndex: x.logIndex,
});

/** The configurator's markers for an account: `held` maps each reserve the
 *  account held as collateral in its life (lowercased) to its timeline key and
 *  symbol; `emode` is the account's e-mode switches. */
export function aaveConfigChanges(
  log: AaveConfigLogAnswer | null,
  held: ReadonlyMap<string, { asset: string; symbol: string }>,
  emode: readonly AaveFamilyEmodeSwitch[],
): AaveConfigChange[] {
  if (!log || !Array.isArray(log.logs)) return [];
  const switches = [...emode].sort((a, b) => logOrder(switchAt(a), switchAt(b)));
  let si = 0;
  let user = 0;
  const reserveLt = new Map<string, number>();
  const cats = new Map<number, { lt: number; label: string }>();
  const legacy = new Map<string, number>();
  let bitmap: Set<string> | null = null;
  const member = (asset: string, cat: number) => (bitmap ? bitmap.has(`${cat}:${asset}`) : legacy.get(asset) === cat);
  /** The threshold the account takes on a reserve. */
  const ltFor = (asset: string, cat: number) =>
    cat > 0 && member(asset, cat) ? (cats.get(cat)?.lt ?? 0) : (reserveLt.get(asset) ?? 0);
  const catName = (id: number) => {
    const label = cats.get(id)?.label;
    return label ? `e-mode “${label}”` : `e-mode category ${id}`;
  };
  // Base and Seamless answer from the Base Sieve as a whole; a mainnet row carries its own mark.
  const viaOf = (l: At) =>
    `${
      log.source === "sieve"
        ? "the Base Sieve's capture of the PoolConfigurator"
        : l.sieve
          ? "the mainnet Sieve's capture of the PoolConfigurator"
          : "eth_getLogs on the PoolConfigurator, stored once by rails-server"
    } · /api/chain/aave-v3/config-log`;
  const out: AaveConfigChange[] = [];
  const push = (l: At, name: string, from: number, to: number, assets: string[], moves: boolean, summary: string) =>
    out.push({
      assets,
      moves,
      ...flowChange({
        ts: l.timestamp,
        block: l.block,
        txHash: l.txHash,
        name,
        from: pct(from),
        to: pct(to),
        prov: {
          kind: "chain",
          pclass: "emitted",
          summary,
          contract: { name: "PoolConfigurator", address: log.configurator },
          via: viaOf(l),
          source: { block: l.block, txHash: l.txHash },
        },
      }),
    });

  for (const l of [...log.logs].sort(logOrder)) {
    while (si < switches.length && logOrder(switchAt(switches[si]), l) < 0) user = switches[si++].toId;
    const blockWords = l.block.toLocaleString("en-US");
    if (l.kind === "collateral") {
      const asset = l.asset.toLowerCase();
      const before = reserveLt.get(asset);
      reserveLt.set(asset, l.lt);
      const h = held.get(asset);
      if (before == null || before === l.lt || !h) continue;
      const inCat = user > 0 && member(asset, user);
      const summary = `${h.symbol}'s liquidation threshold (reserve ${short(asset)}), set to ${pct(l.lt)} by the PoolConfigurator's CollateralConfigurationChanged at block ${blockWords}. Before it, ${pct(before)}. It counts from that block for every account holding ${h.symbol} as collateral outside an e-mode category that covers it.${
        inCat
          ? ` This account was in ${catName(user)}, whose ${pct(cats.get(user)?.lt ?? 0)} applies to ${h.symbol}, so the change does not move its line.`
          : ""
      }`;
      push(l, `${h.symbol} liquidation threshold`, before, l.lt, [h.asset], !inCat, summary);
      continue;
    }
    if (l.kind === "category") {
      const before = cats.get(l.categoryId);
      cats.set(l.categoryId, { lt: l.lt, label: l.label });
      if (!before || before.lt === l.lt || user !== l.categoryId) continue;
      const assets = [...held].filter(([a]) => member(a, l.categoryId));
      if (assets.length === 0) continue;
      const name = catName(l.categoryId);
      push(
        l,
        `${name[0].toUpperCase()}${name.slice(1)} liquidation threshold`,
        before.lt,
        l.lt,
        assets.map(([, h]) => h.asset),
        true,
        `The liquidation threshold of ${name}, set to ${pct(l.lt)} by the PoolConfigurator's EModeCategoryAdded at block ${blockWords}. Before it, ${pct(before.lt)}. This account was in the category, so it applies to its ${assets.map(([, h]) => h.symbol).join(", ")} collateral from that block.`,
      );
      continue;
    }
    // A membership change.
    const asset = l.asset.toLowerCase();
    const h = held.get(asset);
    const before = h && user > 0 ? ltFor(asset, user) : null;
    const wasMember = user > 0 && member(asset, user);
    if (l.kind === "asset-category") legacy.set(asset, l.to);
    else {
      if (!bitmap) {
        bitmap = new Set();
        for (const [a, c] of legacy) if (c > 0) bitmap.add(`${c}:${a}`);
      }
      const k = `${l.categoryId}:${asset}`;
      if (l.collateral) bitmap.add(k);
      else bitmap.delete(k);
    }
    if (!h || before == null) continue;
    const isMember = member(asset, user);
    const after = ltFor(asset, user);
    if (isMember === wasMember || after === before) continue;
    const name = catName(user);
    const event = l.kind === "asset-category" ? "EModeAssetCategoryChanged" : "AssetCollateralInEModeChanged";
    push(
      l,
      `${h.symbol} threshold in ${name}`,
      before,
      after,
      [h.asset],
      true,
      `${h.symbol} ${isMember ? "became" : "stopped being"} collateral in ${name} by the PoolConfigurator's ${event} at block ${blockWords}, so this account, in the category, takes ${isMember ? "the category's" : `${h.symbol}'s own`} liquidation threshold on it from that block: ${pct(after)}. Before it, ${pct(before)}.`,
    );
  }
  return netOfBlock(out);
}

/** One marker per name and block: a block that sets a value and sets it back
 *  (Core, block 25,037,701) draws none, and two sets in a block draw the
 *  first value before and the last after. */
function netOfBlock(changes: AaveConfigChange[]): AaveConfigChange[] {
  const by = new Map<string, AaveConfigChange>();
  for (const c of changes) {
    const k = `${c.block}:${c.name}`;
    const was = by.get(k);
    by.set(k, was ? { ...c, from: was.from, moves: was.moves || c.moves } : c);
  }
  return [...by.values()].filter((c) => c.from !== c.to);
}

/** The changes inside a life, from its first day to its close or today. */
export function changesInLife<T extends FlowChange>(changes: T[], t: FlowTimeline | null): T[] {
  if (!t || t.days.length === 0) return [];
  const held = new Map<string, number>();
  for (const d of t.days) for (const b of d.balances) held.set(`${b.side}:${b.asset}`, b.amount);
  const open = [...held.values()].some((a) => a > 0);
  const first = t.days[0].day;
  const last = open ? null : t.days[t.days.length - 1].day;
  return changes.filter((c) => c.day >= first && (last == null || c.day <= last));
}

/** The reserves the timeline holds as collateral on any day, lowercased →
 *  the timeline's key and its symbol. */
export function heldCollateral(t: FlowTimeline | null): Map<string, { asset: string; symbol: string }> {
  const out = new Map<string, { asset: string; symbol: string }>();
  for (const d of t?.days ?? [])
    for (const b of d.balances)
      if (b.side === "collateral" && b.amount > 0 && !out.has(b.asset.toLowerCase()))
        out.set(b.asset.toLowerCase(), { asset: b.asset, symbol: b.symbol });
  return out;
}

/** The change blocks the health view reads: one per change that moves the
 *  line where, on its day, the account held an affected reserve as collateral
 *  and owed a debt. Each carries the change's transaction, which the
 *  position-state read is taken after. */
export function configChangePicks(changes: readonly AaveConfigChange[], t: FlowTimeline | null): HealthPick[] {
  if (!t || changes.length === 0) return [];
  const sorted = [...changes].filter((c) => c.moves).sort((a, b) => a.block - b.block);
  const held = new Map<string, number>();
  const by = new Map<number, HealthPick>();
  let di = 0;
  for (const c of sorted) {
    while (di < t.days.length && t.days[di].day <= c.day) {
      for (const b of t.days[di].balances) held.set(`${b.side}:${b.asset}`, b.amount);
      di++;
    }
    const coll = c.assets.some((a) => (held.get(`collateral:${a}`) ?? 0) > 0);
    const debt = [...held].some(([k, v]) => k.startsWith("debt:") && v > 0);
    if (coll && debt && !by.has(c.block) && c.txHash)
      by.set(c.block, { blockNumber: c.block, timestamp: c.ts, txHash: c.txHash });
  }
  return [...by.values()].sort((a, b) => a.blockNumber - b.blockNumber);
}
