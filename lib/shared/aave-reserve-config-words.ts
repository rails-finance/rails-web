// A reserve's configurator changes in words (anatomy M3.6, and M3.4's
// markers; ui-jobs 541), from rails-server's reserve-config-log rows
// (lib/api/fetch-aave-reserve-reads.ts). Units are the route's `units`:
// collateral and category fields in basis points (the bonus as 10,000 + the
// bonus), caps in whole tokens (0 no cap), the reserve factor and the
// liquidation protocol fee in basis points, the debt ceiling in USD with two
// decimals (0 not isolated). A collateral or category row carries the new
// values only: the change is read against the previous row of its kind (and
// category), and the first one states its values.

import type { ConfigRow, ReserveConfigLog } from "@/lib/api/fetch-aave-reserve-reads";

export interface ReserveChange {
  row: ConfigRow;
  words: string;
}

const pct = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
const whole = (n: string | number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
const usd = (cents: string) => `$${(Number(cents) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function capWords(name: string, oldV: string, newV: string, symbol: string): string {
  const side = (v: string) => (v === "0" ? "no cap" : `${whole(v)}`);
  if (oldV === newV) return `${name} ${newV === "0" ? "no cap" : `${whole(newV)} ${symbol}`}`;
  if (newV === "1") return `${name} ${side(oldV)} → 1 ${symbol} (closed)`;
  if (newV === "0") return `${name} ${whole(oldV)} ${symbol} → no cap`;
  return `${name} ${side(oldV)} → ${whole(newV)} ${symbol}`;
}

/** "LTV 80% → 80.5%, LT 83% → 84%" against the last values, or the values where there are none. */
function thresholdWords(prev: Record<string, number> | undefined, next: Record<string, number>): string {
  const fields: [string, string, (v: number) => string][] = [
    ["ltv", "LTV", pct],
    ["lt", "LT", pct],
    ["bonus", "liquidation bonus", (v) => pct(v - 10_000)],
  ];
  if (!prev) return fields.map(([k, name, f]) => `${name} ${f(next[k])}`).join(", ");
  const moved = fields
    .filter(([k]) => prev[k] !== next[k])
    .map(([k, name, f]) => `${name} ${f(prev[k])} → ${f(next[k])}`);
  return moved.length
    ? moved.join(", ")
    : `${fields.map(([k, name, f]) => `${name} ${f(next[k])}`).join(", ")} restated`;
}

const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Every row in words, newest first. */
export function reserveChanges(log: ReserveConfigLog, symbol: string): ReserveChange[] {
  const labels = new Map<number, string>();
  for (const r of log.logs) if (r.kind === "category" && r.label) labels.set(Number(r.categoryId), String(r.label));
  const cat = (id: unknown) => {
    const n = Number(id);
    if (n === 0) return "none";
    const label = labels.get(n);
    return label ? `${label} (${n})` : `category ${n}`;
  };
  const on = (v: unknown) => v === true;
  let lastCollateral: Record<string, number> | undefined;
  const lastCategory = new Map<number, Record<string, number>>();
  const out: ReserveChange[] = [];
  for (const r of log.logs) {
    let words: string;
    const n = (k: string) => Number(r[k]);
    switch (r.kind) {
      case "collateral": {
        const next = { ltv: n("ltv"), lt: n("lt"), bonus: n("bonus") };
        words = cap1(thresholdWords(lastCollateral, next));
        lastCollateral = next;
        break;
      }
      case "supply-cap":
        words = capWords("Supply cap", String(r.old), String(r.new), symbol);
        break;
      case "borrow-cap":
        words = capWords("Borrow cap", String(r.old), String(r.new), symbol);
        break;
      case "reserve-factor":
        words = `Reserve factor ${pct(n("old"))} → ${pct(n("new"))}`;
        break;
      case "liquidation-protocol-fee":
        words = `Liquidation protocol fee ${pct(n("old"))} → ${pct(n("new"))}`;
        break;
      case "debt-ceiling":
        words =
          r.old === r.new
            ? `Debt ceiling ${r.new === "0" ? "none" : usd(String(r.new))}`
            : `Debt ceiling ${r.old === "0" ? "none" : usd(String(r.old))} → ${r.new === "0" ? "none" : usd(String(r.new))}`;
        break;
      case "frozen":
        words = on(r.frozen) ? "Frozen" : "Unfrozen";
        break;
      case "paused":
        words = on(r.paused) ? "Paused" : "Unpaused";
        break;
      case "active":
        words = on(r.active) ? "Activated" : "Deactivated";
        break;
      case "borrowing":
        words = on(r.enabled) ? "Borrowing on" : "Borrowing off";
        break;
      case "asset-category":
        words = r.from === r.to ? `eMode category ${cat(r.to)}` : `eMode category ${cat(r.from)} → ${cat(r.to)}`;
        break;
      case "emode-collateral":
        words = `Collateral in eMode ${cat(r.categoryId)}: ${on(r.collateral) ? "on" : "off"}`;
        break;
      case "emode-borrowable":
        words = `Borrowable in eMode ${cat(r.categoryId)}: ${on(r.borrowable) ? "on" : "off"}`;
        break;
      case "emode-ltvzero":
        words = `LTV zero in eMode ${cat(r.categoryId)}: ${on(r.ltvzero) ? "on" : "off"}`;
        break;
      case "emode-isolation":
        words = `eMode ${cat(r.categoryId)} isolated: ${on(r.isolated) ? "on" : "off"}`;
        break;
      case "category": {
        const id = n("categoryId");
        const next = { ltv: n("ltv"), lt: n("lt"), bonus: n("bonus") };
        const prev = lastCategory.get(id);
        words = `eMode ${cat(id)}${prev ? "" : " set"}: ${thresholdWords(prev, next)}`;
        lastCategory.set(id, next);
        break;
      }
      default:
        words = r.kind;
    }
    out.push({ row: r, words });
  }
  return out.reverse();
}

/** The groups the held line names, each with the kinds it stands for. */
const HELD_GROUPS: [string, string[]][] = [
  ["cap", ["supply-cap", "borrow-cap"]],
  ["reserve factor", ["reserve-factor"]],
  ["debt ceiling", ["debt-ceiling"]],
  ["protocol fee", ["liquidation-protocol-fee"]],
  ["flag", ["frozen", "paused", "active", "borrowing", "emode-borrowable", "emode-ltvzero", "emode-isolation"]],
  ["collateral", ["collateral"]],
  ["eMode", ["asset-category", "emode-collateral", "category"]],
];

const listWords = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** Where each group's history starts: "Cap, reserve factor … changes are held
 *  from 1 Nov 2026; collateral and eMode changes from the Pool's start." The
 *  earliest first block is the Pool's start; `dateOf` names a later one's day
 *  where it can. */
export function heldLine(log: ReserveConfigLog, dateOf: (block: number) => string | null): string {
  const byFrom = new Map<number, string[]>();
  for (const [group, kinds] of HELD_GROUPS) {
    const froms = kinds.map((k) => log.held[k]?.heldFrom).filter((b): b is number => b != null);
    if (!froms.length) continue;
    const from = Math.max(...froms);
    byFrom.set(from, [...(byFrom.get(from) ?? []), group]);
  }
  const starts = [...byFrom.keys()].sort((a, b) => b - a);
  if (!starts.length) return "";
  const first = Math.min(...starts);
  if (starts.length === 1) return "Every change is held from the Pool's start.";
  const parts = starts.map((b, i) => {
    const when = b === first ? "the Pool's start" : (dateOf(b) ?? `block ${b.toLocaleString("en-US")}`);
    const groups = listWords(byFrom.get(b)!);
    return i === 0 ? `${cap1(groups)} changes are held from ${when}` : `${groups} changes from ${when}`;
  });
  return `${parts.join("; ")}.`;
}
