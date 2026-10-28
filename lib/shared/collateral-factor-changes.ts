// Collateral factor changes on the Lifetime flows panel's events row (rails-ops
// reference/lifetime-price-chart.md, ruling 10; ui-jobs 328 steps 8 and 9):
// Compound V2 and Moonwell from the Comptroller's NewCollateralFactor logs,
// Compound V3 from the Configurator's factor setters and the Comet proxy's
// upgrades. Each change on a market the account used is a marker with its
// before → after and its log, and the block it took effect at is one more
// factor read for the health view (`factorChangePicks`), so the line steps
// on that day where it falls between two picked events.
//
// RULES.
// - Compound V2, Moonwell: a NewCollateralFactor(cToken, old, new) takes
//   effect in its block (the Comptroller's storage). A market's first log is
//   its listing and draws none; a log that leaves the printed value as it was
//   draws none.
// - Compound V3: a Comet's factors are immutables of its implementation. The
//   Configurator's setters (UpdateAssetLiquidateCollateralFactor, UpdateAsset,
//   SetConfiguration) change only the Configurator's stored settings;
//   Configurator.deploy builds an implementation from the settings as they
//   stand (CometDeployed(cometProxy, newComet)), and the change takes effect
//   when the proxy is upgraded to it (Upgraded(implementation) on the proxy;
//   CometProxyAdmin.deployAndUpgradeTo does both in one transaction). So the
//   marker stands on the upgrade's block, naming each factor that differs
//   from the implementation it replaced, and the setter logs it carried. An
//   implementation the Configurator did not deploy (the proxy's first) has no
//   known settings: the next upgrade from it draws none. An asset first seen
//   at an upgrade is a listing and draws none. The card's line is the
//   liquidation collateral factor; the borrow collateral factor does not
//   move it and is not read.
//
// Pure: no fetch. The routes are /api/chain/ctoken-factor-log and
// /api/chain/compound/factor-log.

import type { HealthPick } from "@/hooks/useFlowsHealth";
import { flowChange, pctWords, type FlowChange } from "@/lib/shared/flows-changes";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";

/** A change with the timeline's key for the asset it moved. */
export type FactorChange = FlowChange & { asset: string };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** "85 %", "89.50 %", "0.01 %": a factor as a percent, two places where it
 *  is not whole. */
export const factorPct = (fraction: number): string => {
  const p = Math.round(fraction * 1e4) / 100;
  return pctWords(p, Number.isInteger(p) ? 0 : 2);
};

// ── Compound V2, Moonwell ────────────────────────────────────────────────────

/** /api/chain/ctoken-factor-log: every NewCollateralFactor of a Comptroller. */
export interface CTokenFactorLog {
  protocol: string;
  comptroller: string;
  chainId: number;
  fromBlock: number;
  toBlock: number;
  sets: {
    block: number;
    timestamp: number;
    txHash: string;
    logIndex: number;
    /** The cToken or mToken, lowercased. */
    market: string;
    from: number;
    to: number;
  }[];
}

/** Each NewCollateralFactor on a market in `markets` (cToken address,
 *  lowercased → the timeline's key and its symbol) that moved the printed
 *  factor, as a marker. */
export function ctokenFactorChanges(
  log: CTokenFactorLog | null,
  markets: ReadonlyMap<string, { asset: string; symbol: string }>,
  names: { comptroller: string; via: string },
): FactorChange[] {
  if (!log || !Array.isArray(log.sets)) return [];
  const seen = new Set<string>();
  const out: FactorChange[] = [];
  for (const s of [...log.sets].sort((a, b) => a.block - b.block || a.logIndex - b.logIndex)) {
    const market = s.market.toLowerCase();
    const first = !seen.has(market);
    seen.add(market);
    if (first || factorPct(s.from) === factorPct(s.to)) continue;
    const m = markets.get(market);
    if (m == null) continue;
    const { symbol } = m;
    const block = s.block.toLocaleString("en-US");
    out.push({
      asset: m.asset,
      ...flowChange({
        ts: s.timestamp,
        block: s.block,
        txHash: s.txHash,
        name: `${symbol} collateral factor`,
        from: factorPct(s.from),
        to: factorPct(s.to),
        prov: {
          kind: "chain",
          pclass: "emitted",
          summary: `${symbol}'s collateral factor (market ${short(market)}), set to ${factorPct(s.to)} by the Comptroller's NewCollateralFactor at block ${block}. Before it, ${factorPct(s.from)}. It counts from that block for every account with the market entered as collateral, for the borrowing limit and the liquidation line alike.`,
          contract: { name: names.comptroller, address: log.comptroller },
          via: names.via,
          source: { block: s.block, txHash: s.txHash },
        },
      }),
    });
  }
  return out;
}

// ── Compound V3 ──────────────────────────────────────────────────────────────

/** One Configurator log for the Comet, decoded: a setter that moved an
 *  asset's liquidation collateral factor (`set`), an asset's first settings
 *  (`listed`), or an implementation built from the settings (`deploy`). */
export interface CometConfigLog {
  block: number;
  logIndex: number;
  txHash: string;
  kind: "set" | "listed" | "deploy";
  /** The collateral asset, lowercased (`set`, `listed`). */
  asset?: string;
  /** The factor before (`set`), a fraction. */
  from?: number;
  /** The factor after (`set`, `listed`), a fraction. */
  to?: number;
  /** The implementation built (`deploy`), lowercased. */
  impl?: string;
}

/** /api/chain/compound/factor-log: the Configurator's logs for one Comet
 *  and the proxy's upgrades. */
export interface CometFactorLog {
  deployment: string;
  chainId: number;
  comet: string;
  configurator: string;
  fromBlock: number;
  toBlock: number;
  configs: CometConfigLog[];
  upgrades: { block: number; logIndex: number; timestamp: number; txHash: string; impl: string }[];
}

/** A factor change as it took effect: at the upgrade that carried it. */
export interface CometFactorStep {
  asset: string;
  from: number;
  to: number;
  block: number;
  timestamp: number;
  txHash: string;
  /** The setter logs the new implementation carried for this asset. */
  sets: { block: number; txHash: string }[];
}

const before = (a: { block: number; logIndex: number }, b: { block: number; logIndex: number }) =>
  a.block < b.block || (a.block === b.block && a.logIndex < b.logIndex);

/** Each upgrade's liquidation collateral factor changes against the
 *  implementation it replaced. */
export function cometFactorSteps(log: CometFactorLog | null): CometFactorStep[] {
  if (!log || !Array.isArray(log.configs) || !Array.isArray(log.upgrades)) return [];
  type Pos = { block: number; logIndex: number };
  const all: ({ at: "config"; c: CometConfigLog } | { at: "upgrade"; u: CometFactorLog["upgrades"][number] })[] = [
    ...log.configs.map((c) => ({ at: "config" as const, c })),
    ...log.upgrades.map((u) => ({ at: "upgrade" as const, u })),
  ];
  const pos = (x: (typeof all)[number]): Pos => (x.at === "config" ? x.c : x.u);
  all.sort((a, b) => pos(a).block - pos(b).block || pos(a).logIndex - pos(b).logIndex);
  const settings = new Map<string, number>();
  const built = new Map<string, { factors: Map<string, number>; at: Pos }>();
  const sets: CometConfigLog[] = [];
  let current: { factors: Map<string, number>; at: Pos } | null = null;
  const out: CometFactorStep[] = [];
  for (const x of all) {
    if (x.at === "config") {
      const c = x.c;
      if ((c.kind === "set" || c.kind === "listed") && c.asset && c.to != null) {
        settings.set(c.asset.toLowerCase(), c.to);
        if (c.kind === "set") sets.push(c);
      } else if (c.kind === "deploy" && c.impl)
        built.set(c.impl.toLowerCase(), { factors: new Map(settings), at: { block: c.block, logIndex: c.logIndex } });
      continue;
    }
    const u = x.u;
    const next = built.get(u.impl.toLowerCase()) ?? null;
    if (current && next)
      for (const [asset, to] of next.factors) {
        const from = current.factors.get(asset);
        if (from == null || factorPct(from) === factorPct(to)) continue;
        const prev = current.at;
        out.push({
          asset,
          from,
          to,
          block: u.block,
          timestamp: u.timestamp,
          txHash: u.txHash,
          sets: sets
            .filter((s) => s.asset === asset && before(prev, s) && before(s, next.at))
            .map((s) => ({ block: s.block, txHash: s.txHash })),
        });
      }
    current = next;
  }
  return out;
}

/** Each upgrade's factor change on an asset in `assets` (lowercased → the
 *  timeline's key and its symbol), as a marker on the upgrade's block. */
export function cometFactorChanges(
  log: CometFactorLog | null,
  assets: ReadonlyMap<string, { asset: string; symbol: string }>,
): FactorChange[] {
  if (!log) return [];
  return cometFactorSteps(log).flatMap((s) => {
    const a = assets.get(s.asset);
    if (a == null) return [];
    const { symbol } = a;
    const block = s.block.toLocaleString("en-US");
    const setWords =
      s.sets.length === 0
        ? ""
        : ` The Configurator's setting was made at block ${s.sets.map((x) => x.block.toLocaleString("en-US")).join(", ")}.`;
    return [
      {
        asset: a.asset,
        ...flowChange({
          ts: s.timestamp,
          block: s.block,
          txHash: s.txHash,
          name: `${symbol} liquidation collateral factor`,
          from: factorPct(s.from),
          to: factorPct(s.to),
          prov: {
            kind: "chain",
            pclass: "emitted",
            summary: `${symbol}'s liquidation collateral factor in the Comet, ${factorPct(s.to)} from the proxy's upgrade at block ${block} to an implementation the Configurator built (CometDeployed). Before it, ${factorPct(s.from)}.${setWords} A Comet's factors are fixed in its implementation, so a new setting counts from the upgrade that carries it, for every account holding the asset.`,
            contract: { name: "Comet", address: log.comet },
            via: "eth_getLogs on the Configurator (factor setters, CometDeployed) and the Comet proxy (Upgraded) · /api/chain/compound/factor-log",
            source: { block: s.block, txHash: s.txHash },
          },
        }),
      },
    ];
  });
}

// ── The line ─────────────────────────────────────────────────────────────────

/** The blocks the changes took effect at, as factor reads for the health
 *  view: one per change block where, on its day, the account held the
 *  asset as collateral and owed a debt (a change elsewhere moves no point). */
export function factorChangePicks(changes: readonly FactorChange[], t: FlowTimeline | null): HealthPick[] {
  if (!t || changes.length === 0) return [];
  const sorted = [...changes].sort((a, b) => a.day - b.day);
  const held = new Map<string, number>();
  const by = new Map<number, HealthPick>();
  let di = 0;
  for (const c of sorted) {
    while (di < t.days.length && t.days[di].day <= c.day) {
      for (const b of t.days[di].balances) held.set(`${b.side}:${b.asset}`, b.amount);
      di++;
    }
    const coll = (held.get(`collateral:${c.asset}`) ?? 0) > 0;
    const debt = [...held].some(([k, v]) => k.startsWith("debt:") && v > 0);
    if (coll && debt && !by.has(c.block)) by.set(c.block, { blockNumber: c.block, timestamp: c.ts });
  }
  return [...by.values()].sort((a, b) => a.blockNumber - b.blockNumber);
}
