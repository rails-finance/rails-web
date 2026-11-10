// An Aave V4 spoke reserve's configuration changes in words (anatomy M3.6,
// ui-jobs 548), from rails-server's /api/aave-v4/reserve-config-log rows,
// oldest first. The spoke logs the reserve's listing, its flags and collateral
// risk, its price source, its collateral terms (each add a new key, the
// reserve's current one) and the spoke-wide liquidation settings; the hub logs
// the asset's fee, strategy and receivers and this spoke's credit line; the
// hub's rate strategy logs the asset's curve. A row carries the values set:
// the first row of a kind states them, a later one names only what moved
// against the previous row of its kind, and one where nothing moved is
// "… restated". Units are the route's `units`. Pure: no `@/` imports, so the
// unit test (scripts/test/aave-v4-config-words.test.mjs) runs it under node.

export interface V4ConfigRow {
  kind: string;
  block: number;
  txIndex: number;
  logIndex: number;
  timestamp: number;
  txHash: string;
  [field: string]: unknown;
}

export interface V4ConfigLog {
  chainId: number;
  spoke: string;
  reserveId: number;
  hub: string;
  assetId: number;
  source: string;
  toBlock: number;
  held: Record<string, { table: string; heldFrom: number } | null>;
  units: Record<string, string>;
  notes: string[];
  logs: V4ConfigRow[];
}

export type V4ChangeSide = "spoke" | "hub";

export interface V4Change {
  row: V4ConfigRow;
  words: string;
  side: V4ChangeSide;
  /** The contract that emitted the row's event, by role and address. */
  contract: { role: "spoke" | "hub" | "strategy"; address: string };
  /** The Solidity event the row comes from. */
  event: string;
  /** The row its words are read against: the previous row of its kind, or
   *  for collateral terms the terms it replaces. Absent on a first row. */
  prev?: V4ConfigRow;
  /** Collateral terms rewritten under a key the reserve has moved past. */
  earlierKey?: boolean;
}

/** Where each kind is set and the event it comes from (aave/aave-v4 ISpoke.sol,
 *  IHub.sol, IAssetInterestRateStrategy.sol). */
export const V4_KINDS: Record<string, { side: V4ChangeSide; event: string }> = {
  "reserve-added": { side: "spoke", event: "AddReserve" },
  "reserve-config": { side: "spoke", event: "UpdateReserveConfig" },
  "price-source": { side: "spoke", event: "UpdateReservePriceSource" },
  "dynamic-added": { side: "spoke", event: "AddDynamicReserveConfig" },
  "dynamic-updated": { side: "spoke", event: "UpdateDynamicReserveConfig" },
  "liquidation-config": { side: "spoke", event: "UpdateLiquidationConfig" },
  "asset-config": { side: "hub", event: "UpdateAssetConfig" },
  "credit-line": { side: "hub", event: "UpdateSpokeConfig" },
  "rate-curve": { side: "hub", event: "UpdateInterestRateData" },
};

/** The hub's "no cap": 2^40 − 1 whole tokens (Hub.sol MAX_ALLOWED_SPOKE_CAP). */
export const V4_NO_CAP = "1099511627775";
/** The hub's "no threshold": 2^24 − 1 (Hub.sol MAX_RISK_PREMIUM_THRESHOLD). */
const NO_THRESHOLD = 16_777_215;
const ZERO = "0x0000000000000000000000000000000000000000";

const pct = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
const whole = (n: string | number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
/** A WAD health factor: 1.24, 0.90, 1.174. */
const wad = (v: unknown) =>
  (Number(BigInt(String(v ?? "0")) / BigInt(10 ** 12)) / 1e6).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const low1 = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
/** "A, b and c": the first part capitalised, the rest lower-cased. */
const phrase = (parts: string[]) => cap1(parts.map((p, i) => (i ? low1(p) : p)).join(", "));
const lower = (s: unknown) => String(s ?? "").toLowerCase();

/** A field read three ways: its label, how a value prints, and the key on the row. */
type Field = [key: string, label: string, show: (v: unknown) => string, move?: (a: unknown, b: unknown) => string];

/** The values set, or what moved, or "… restated". */
function against(prev: Record<string, unknown> | undefined, row: V4ConfigRow, fields: Field[]): string {
  const state = fields.map(([k, label, show]) => `${label} ${show(row[k])}`);
  if (!prev) return phrase(state);
  const moved = fields
    .filter(([k, , show]) => show(prev[k]) !== show(row[k]))
    .map(([k, label, show, move]) => `${label} ${move ? move(prev[k], row[k]) : `${show(prev[k])} → ${show(row[k])}`}`);
  return moved.length ? phrase(moved) : `${phrase(state)} restated`;
}

const bps = (v: unknown) => pct(Number(v));
const bonus = (v: unknown) => pct(Number(v) - 10_000);
const capShow = (symbol: string) => (v: unknown) =>
  String(v) === V4_NO_CAP ? "no cap" : `${whole(String(v))} ${symbol}`;
/** "15,000,000 → 18,000,000 USDC", the symbol once where both sides are tokens. */
const capMove = (symbol: string) => (a: unknown, b: unknown) =>
  String(a) !== V4_NO_CAP && String(b) !== V4_NO_CAP
    ? `${whole(String(a))} → ${whole(String(b))} ${symbol}`
    : `${capShow(symbol)(a)} → ${capShow(symbol)(b)}`;
const threshold = (v: unknown) => (Number(v) === NO_THRESHOLD ? "none" : pct(Number(v)));

const TERMS: Field[] = [
  ["collateralFactor", "Collateral factor", bps],
  ["maxLiquidationBonus", "Max liquidation bonus", bonus],
  ["liquidationFee", "Liquidation fee", bps],
];
const LIQUIDATION: Field[] = [
  ["targetHealthFactor", "Target health factor", wad],
  ["healthFactorForMaxBonus", "Health factor for the max bonus", wad],
  ["liquidationBonusFactor", "Bonus factor", bps],
];
const CURVE: Field[] = [
  ["optimalUsageRatio", "Optimal usage", bps],
  ["baseDrawnRate", "Base rate", bps],
  ["rateGrowthBeforeOptimal", "Growth before optimal", bps],
  ["rateGrowthAfterOptimal", "Growth after optimal", bps],
];

/** Who a position's collateral terms follow when a new set is added: a
 *  position keeps the key it last took until the spoke refreshes it, which
 *  borrow, withdraw (while the asset is collateral), switching collateral on or
 *  off, and updateUserDynamicConfig do (aave/aave-v4 Spoke.sol at a3ef63e,
 *  `borrow` and `withdraw` → `_refreshAndValidateUserAccountData`,
 *  `setUsingAsCollateral` → `_refreshDynamicConfig`, `_processUserAccountData`
 *  `userPosition.dynamicConfigKey = reserve.dynamicConfigKey` when refreshing). */
export const NEW_TERMS_REACH = "open positions keep their terms until they next borrow, withdraw or switch collateral";

/** A switch: the words for on and off, compared against the last row. */
type Flag = [key: string, on: string, off: string];
const FLAGS: Flag[] = [
  ["frozen", "Frozen", "Unfrozen"],
  ["paused", "Paused", "Unpaused"],
  ["borrowable", "Borrowing on", "Borrowing off"],
  // ISpoke.sol ReserveConfig: "receiveSharesEnabled True if the liquidator can
  // receive collateral shares during liquidation."
  [
    "receiveSharesEnabled",
    "Liquidators may take seized collateral as supplied shares",
    "Liquidators take seized collateral as tokens only",
  ],
];

function reserveConfigWords(prev: V4ConfigRow | undefined, r: V4ConfigRow): string {
  const risk = `Collateral risk ${bps(r.collateralRisk)}`;
  if (!prev) {
    const parts = [risk];
    if (r.paused === true) parts.push("Paused");
    if (r.frozen === true) parts.push("Frozen");
    parts.push(r.borrowable === true ? "Borrowing on" : "Borrowing off");
    parts.push(FLAGS[3][r.receiveSharesEnabled === true ? 1 : 2]);
    return phrase(parts);
  }
  const moved: string[] = [];
  for (const [k, on, off] of FLAGS) if (Boolean(prev[k]) !== Boolean(r[k])) moved.push(r[k] === true ? on : off);
  if (Number(prev.collateralRisk) !== Number(r.collateralRisk))
    moved.push(`Collateral risk ${bps(prev.collateralRisk)} → ${bps(r.collateralRisk)}`);
  return moved.length ? phrase(moved) : `${reserveConfigWords(undefined, r)} restated`;
}

function assetConfigWords(prev: V4ConfigRow | undefined, r: V4ConfigRow): string {
  const fee = `Liquidity fee ${bps(r.liquidityFee)}`;
  const controller = lower(r.reinvestmentController) !== ZERO;
  if (!prev)
    return phrase([
      fee,
      "Rate strategy set",
      "Fee receiver set",
      ...(controller ? ["Reinvestment controller set"] : []),
    ]);
  const moved: string[] = [];
  if (Number(prev.liquidityFee) !== Number(r.liquidityFee))
    moved.push(`Liquidity fee ${bps(prev.liquidityFee)} → ${bps(r.liquidityFee)}`);
  if (lower(prev.irStrategy) !== lower(r.irStrategy)) moved.push("Rate strategy changed");
  if (lower(prev.feeReceiver) !== lower(r.feeReceiver)) moved.push("Fee receiver changed");
  const was = lower(prev.reinvestmentController);
  if (was !== lower(r.reinvestmentController))
    moved.push(
      was === ZERO
        ? "Reinvestment controller set"
        : controller
          ? "Reinvestment controller changed"
          : "Reinvestment controller removed",
    );
  return moved.length ? phrase(moved) : `${fee} restated`;
}

function creditLineWords(prev: V4ConfigRow | undefined, r: V4ConfigRow, symbol: string): string {
  const caps = against(prev, r, [
    ["addCap", "Add cap", capShow(symbol), capMove(symbol)],
    ["drawCap", "Draw cap", capShow(symbol), capMove(symbol)],
    ["riskPremiumThreshold", "Risk premium threshold", threshold],
  ]);
  if (!prev)
    return phrase([caps, r.active === true ? "Line on" : "Line off", ...(r.halted === true ? ["Halted"] : [])]);
  const flags: string[] = [];
  if (Boolean(prev.active) !== Boolean(r.active)) flags.push(r.active === true ? "Line on" : "Line off");
  if (Boolean(prev.halted) !== Boolean(r.halted)) flags.push(r.halted === true ? "Halted" : "Resumed");
  if (!flags.length) return caps;
  // `caps` reads "… restated" where no figure moved: only the flags moved then.
  return caps.endsWith(" restated") ? phrase(flags) : phrase([caps, ...flags]);
}

/** Every row in words, newest first. `addresses` names the spoke and the hub. */
export function v4ReserveChanges(
  log: V4ConfigLog,
  o: { symbol: string; hub: string; spokeAddress: string; hubAddress: string },
): V4Change[] {
  const last = new Map<string, V4ConfigRow>();
  /** Each key's terms as last written; the current key is the latest added. */
  const terms = new Map<number, V4ConfigRow>();
  let currentKey: number | null = null;
  let strategy: string | null = null;
  const out: V4Change[] = [];
  log.logs.forEach((r, i) => {
    const prev = last.get(r.kind);
    let against0: V4ConfigRow | undefined = prev;
    let earlierKey = false;
    let words: string;
    switch (r.kind) {
      case "reserve-added":
        words = `Listed, drawn from the ${o.hub} hub`;
        break;
      case "reserve-config":
        words = reserveConfigWords(prev, r);
        break;
      case "price-source":
        words = !prev
          ? "Price source set"
          : lower(prev.source) === lower(r.source)
            ? "Price source restated"
            : "Price source changed";
        break;
      case "dynamic-added": {
        const before = currentKey != null ? terms.get(currentKey) : undefined;
        against0 = before;
        words = against(before, r, TERMS);
        if (before) words = `${words}; ${NEW_TERMS_REACH}`;
        currentKey = Number(r.key);
        terms.set(currentKey, r);
        break;
      }
      case "dynamic-updated": {
        const key = Number(r.key);
        against0 = terms.get(key);
        earlierKey = key !== currentKey;
        const words0 = against(against0, r, TERMS);
        // An update rewrites the terms under its key at once, for every
        // position on that key (Spoke.sol reads `_dynamicConfig[reserveId][
        // userPosition.dynamicConfigKey]`).
        words = key === currentKey ? words0 : `Rewrites an earlier set: ${low1(words0)}`;
        terms.set(key, r);
        break;
      }
      case "liquidation-config":
        words = against(prev, r, LIQUIDATION);
        break;
      case "asset-config":
        words = assetConfigWords(prev, r);
        strategy = lower(r.irStrategy) || strategy;
        break;
      case "credit-line":
        words = creditLineWords(prev, r, o.symbol);
        break;
      case "rate-curve":
        words = against(prev, r, CURVE);
        break;
      default:
        words = r.kind;
    }
    last.set(r.kind, r);
    const side = V4_KINDS[r.kind]?.side ?? "spoke";
    let contract: V4Change["contract"] =
      side === "spoke" ? { role: "spoke", address: o.spokeAddress } : { role: "hub", address: o.hubAddress };
    if (r.kind === "rate-curve") {
      // The strategy is the latest asset-config's at or before the row; the
      // curve a listing sets comes a log before its asset-config, so the same
      // transaction's asset-config names it where none came before.
      const same = log.logs.slice(i + 1).find((x) => x.kind === "asset-config" && x.txHash === r.txHash);
      const at = strategy ?? (same ? lower(same.irStrategy) : null);
      if (at) contract = { role: "strategy", address: at };
    }
    out.push({
      row: r,
      words,
      side,
      contract,
      event: V4_KINDS[r.kind]?.event ?? r.kind,
      ...(against0 ? { prev: against0 } : {}),
      ...(earlierKey ? { earlierKey } : {}),
    });
  });
  return out.reverse();
}

/** The groups the held line names, each with the kinds it stands for. */
const HELD_GROUPS: [string, string[]][] = [
  ["listing", ["reserve-added"]],
  ["flag and collateral risk", ["reserve-config"]],
  ["price source", ["price-source"]],
  ["collateral terms", ["dynamic-added", "dynamic-updated"]],
  ["liquidation settings", ["liquidation-config"]],
  ["liquidity fee and strategy", ["asset-config"]],
  ["credit line", ["credit-line"]],
  ["rate curve", ["rate-curve"]],
];

const listWords = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** Where the history starts. Every kind held: "Every change is held from the
 *  start of the Main spoke and the Core hub." Otherwise the kinds Rails has no
 *  table for, and those whose rows start later than their side's first, are
 *  named; `dateOf` names a block's day where it can. */
export function v4HeldLine(
  log: V4ConfigLog,
  names: { spoke: string; hub: string },
  dateOf: (block: number) => string | null = () => null,
): string {
  const start = `the start of the ${names.spoke} spoke and the ${names.hub} hub`;
  const groups = HELD_GROUPS.map(([label, kinds]) => {
    const froms = kinds.map((k) => log.held[k]);
    const missing = froms.some((h) => h == null);
    const side = V4_KINDS[kinds[0]].side;
    return { label, side, missing, from: missing ? null : Math.max(...froms.map((h) => h!.heldFrom)) };
  });
  const first = (side: V4ChangeSide) =>
    Math.min(...groups.filter((g) => g.side === side && g.from != null).map((g) => g.from!));
  const missing = groups.filter((g) => g.missing).map((g) => g.label);
  const later = new Map<number, string[]>();
  for (const g of groups)
    if (g.from != null && g.from > first(g.side)) later.set(g.from, [...(later.get(g.from) ?? []), g.label]);
  if (!missing.length && !later.size) return `Every change is held from ${start}.`;
  const parts: string[] = [];
  if (missing.length) parts.push(`${cap1(listWords(missing))} changes are not held`);
  for (const [b, labels] of [...later].sort((a, b) => a[0] - b[0]))
    parts.push(`${cap1(listWords(labels))} changes are held from ${dateOf(b) ?? `block ${b.toLocaleString("en-US")}`}`);
  if (missing.length + [...later.values()].flat().length < groups.length) parts.push(`the rest from ${start}`);
  return `${parts.map((p, i) => (i ? low1(p) : p)).join("; ")}.`;
}
