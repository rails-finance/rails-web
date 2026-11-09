// An Aave V3 reserve's configuration change explained (anatomy M3.6; Aave V3,
// SparkLend, Seamless): one row of aave-reserve-config-words.ts at a time, the
// timeline row's head (a verb summary and the figure that moved) and, opened,
// plain-language bullets on what the setting does and what this change means
// for a supplier or a borrower (components/shared/config-change-timeline.tsx).
// The eMode kinds (asset-category, emode-*, category) state their words as the
// head and carry no bullets yet. Every string is in WORDS; the logic below picks
// and fills them. Pure: type imports only, so the unit test
// (scripts/test/aave-reserve-config-explain.test.mjs) runs it under node.
//
// The facts, from aave-dao/aave-v3-origin src/contracts/protocol/libraries/
// logic/ValidationLogic.sol (main, read 9 Nov 2026): supply 39–70 (active, not
// paused, not frozen, under the supply cap; 0 is no cap), withdraw 72–83 and
// repay 167–188 (active, not paused), borrow 103–157 (active, not paused, not
// frozen, borrowing on, under the borrow cap), liquidation 253–300 (both
// reserves active and not paused), transfer 436–438 (not paused).

import type { ReserveChange } from "./aave-reserve-config-words";

export interface ReserveExplainNames {
  symbol: string;
  /** The house compact figure (lib/shared/format-compact.ts `formatCompact`). */
  compact: (n: number) => string;
}

export interface ReserveChangeExplained {
  headline: string;
  figure?: string;
  bullets: string[];
}

type N = ReserveExplainNames;
type Dir = "raised" | "lowered";

// ── The words ───────────────────────────────────────────────────────────────

const WORDS = {
  cap: (name: string, d: Dir | "set" | "removed" | "closed") => `${name} ${d}`,
  supplyWhat: (n: N) => `The supply cap is the most ${n.symbol} the Pool takes in, across every supplier.`,
  borrowWhat: (n: N) => `The borrow cap is the most ${n.symbol} borrowers can owe the Pool, in total.`,
  supplyRaised: (by: string, to: string) =>
    `Raising the supply cap by ${by}, to ${to}, adds that much room for supply.`,
  borrowRaised: (by: string, to: string) =>
    `Raising the borrow cap by ${by}, to ${to}, adds that much room for borrowing.`,
  supplyStops: (to: string) => `New supply now stops once the total reaches ${to}.`,
  borrowStops: (to: string) => `New borrowing now stops once the total owed reaches ${to}.`,
  supplyOpen: "Suppliers can now add any amount.",
  borrowOpen: "Borrowers can now borrow any amount the Pool holds.",
  supplyClosed: (n: N) => `At 1 ${n.symbol}, the Pool takes no new supply.`,
  borrowClosed: (n: N) => `At 1 ${n.symbol}, the Pool lends no more.`,

  reserveFactor: (d: Dir) => `Reserve factor ${d}`,
  reserveFactorWhat: "The reserve factor is the share of borrowers' interest that goes to the Aave treasury.",
  reserveFactorShare: (n: N, p: string, rest: string) =>
    `At ${p}, ${n.symbol} suppliers earn ${rest} of the interest borrowers pay.`,

  protocolFee: (d: Dir) => `Liquidation protocol fee ${d}`,
  protocolFeeWhat: "The liquidation protocol fee is the part of a liquidator's bonus the protocol keeps.",
  protocolFeeNow: (p: string) => `The protocol now keeps ${p} of each bonus.`,

  termsSet: "Collateral terms set",
  termsSame: "Collateral terms restated",
  ltv: (d: Dir) => `LTV ${d}`,
  lt: (d: Dir) => `Liquidation threshold ${d}`,
  bonus: (d: Dir) => `Liquidation bonus ${d}`,
  ltvWhat: (n: N) => `The LTV is the most a borrower can borrow against ${n.symbol}, as a share of its value.`,
  ltvNone: (n: N) => `At 0%, ${n.symbol} backs no new borrowing.`,
  ltvSome: (n: N, p: string, per100: string) =>
    `At ${p}, each $100 of ${n.symbol} supports up to $${per100} of borrowing.`,
  ltWhat: (n: N) =>
    `The liquidation threshold is the share of ${n.symbol}'s value that counts toward a position's health factor.`,
  ltNow: (n: N, p: string, per100: string) =>
    `At ${p}, each $100 of ${n.symbol} counts as $${per100} toward the health factor; below 1 a position can be liquidated.`,
  bonusWhat: (n: N) => `The liquidation bonus is the extra ${n.symbol} a liquidator takes over the debt repaid.`,
  bonusNow: (p: string) => `A liquidator now takes ${p} extra.`,
  termsSameWhat: "The Pool wrote the collateral terms again with the same values.",

  ceiling: (d: Dir | "set" | "removed") => `Debt ceiling ${d}`,
  ceilingWhat: (n: N) =>
    `The debt ceiling caps, in US dollars, the total debt borrowers can take against ${n.symbol} posted as isolated collateral.`,
  ceilingStops: (n: N, to: string) => `Borrowing against ${n.symbol} now stops once that debt reaches ${to}.`,
  ceilingGone: (n: N) => `${n.symbol} now counts as ordinary collateral.`,

  frozen: "Frozen",
  unfrozen: "Unfrozen",
  frozenStops: (n: N) => `Freezing stops new supply and new borrowing of ${n.symbol}.`,
  frozenGoesOn: "Suppliers can still withdraw and borrowers can still repay; liquidations go on.",
  unfrozenAgain: (n: N) => `The Pool takes new ${n.symbol} supply and borrowing again.`,
  paused: "Paused",
  unpaused: "Unpaused",
  pausedStops: (n: N) =>
    `Pausing stops every action on ${n.symbol}: supply, withdrawal, borrowing, repayment, liquidation and transfers.`,
  unpausedAgain: (n: N) => `Every action on ${n.symbol} works again.`,
  activated: "Activated",
  deactivated: "Deactivated",
  activeWhat: (n: N) => `The Pool takes ${n.symbol} supply and borrowing.`,
  inactiveWhat: (n: N) => `Deactivating closes ${n.symbol} to every action.`,
  borrowOn: "Borrowing turned on",
  borrowOff: "Borrowing turned off",
  borrowOnWhat: (n: N) => `The Pool lends ${n.symbol} again.`,
  borrowOffWhat: (n: N) => `The Pool stops lending ${n.symbol}; open loans stay open and can be repaid.`,
} as const;

// ── Reading a change ────────────────────────────────────────────────────────

const pct = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
const dir = (a: number, b: number): Dir => (b > a ? "raised" : "lowered");
const usd = (cents: string) => `$${(Number(cents) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const low1 = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

type Read = { parts: { summary: string; figure?: string }[]; bullets: string[] };

/** A cap row (0 no cap, 1 closed). */
function cap(n: N, which: "supply" | "borrow", oldV: string, newV: string): Read {
  const name = which === "supply" ? "Supply cap" : "Borrow cap";
  const fig = (v: string) => (v === "0" ? "no cap" : `${n.compact(Number(v))} ${n.symbol}`);
  const figure =
    oldV !== "0" && newV !== "0"
      ? `${n.compact(Number(oldV))} → ${n.compact(Number(newV))} ${n.symbol}`
      : `${fig(oldV)} → ${fig(newV)}`;
  const what = which === "supply" ? WORDS.supplyWhat(n) : WORDS.borrowWhat(n);
  if (newV === "1")
    return {
      parts: [{ summary: WORDS.cap(name, "closed"), figure }],
      bullets: [what, which === "supply" ? WORDS.supplyClosed(n) : WORDS.borrowClosed(n)],
    };
  if (newV === "0")
    return {
      parts: [{ summary: WORDS.cap(name, "removed"), figure }],
      bullets: [what, which === "supply" ? WORDS.supplyOpen : WORDS.borrowOpen],
    };
  if (oldV === newV) return { parts: [{ summary: `${name} restated`, figure: fig(newV) }], bullets: [what] };
  const stops = which === "supply" ? WORDS.supplyStops(fig(newV)) : WORDS.borrowStops(fig(newV));
  if (oldV === "0") return { parts: [{ summary: WORDS.cap(name, "set"), figure }], bullets: [what, stops] };
  const d = dir(Number(oldV), Number(newV));
  const raised = (which === "supply" ? WORDS.supplyRaised : WORDS.borrowRaised)(
    n.compact(Number(newV) - Number(oldV)),
    fig(newV),
  );
  return { parts: [{ summary: WORDS.cap(name, d), figure }], bullets: [what, d === "raised" ? raised : stops] };
}

function collateral(n: N, prev: Record<string, number> | undefined, next: Record<string, number>): Read {
  const ltvBullet = (v: number) => (v === 0 ? WORDS.ltvNone(n) : WORDS.ltvSome(n, pct(v), String(v / 100)));
  const ltBullet = (v: number) => WORDS.ltNow(n, pct(v), String(v / 100));
  const bonus = (v: number) => pct(v - 10_000);
  if (!prev)
    return {
      parts: [{ summary: WORDS.termsSet }],
      bullets: [WORDS.ltvWhat(n), ltvBullet(next.ltv), WORDS.ltWhat(n), ltBullet(next.lt)],
    };
  const parts: Read["parts"] = [];
  const bullets: string[] = [];
  if (prev.ltv !== next.ltv) {
    parts.push({ summary: WORDS.ltv(dir(prev.ltv, next.ltv)), figure: `${pct(prev.ltv)} → ${pct(next.ltv)}` });
    bullets.push(WORDS.ltvWhat(n), ltvBullet(next.ltv));
  }
  if (prev.lt !== next.lt) {
    parts.push({ summary: WORDS.lt(dir(prev.lt, next.lt)), figure: `${pct(prev.lt)} → ${pct(next.lt)}` });
    bullets.push(WORDS.ltWhat(n), ltBullet(next.lt));
  }
  if (prev.bonus !== next.bonus) {
    parts.push({
      summary: WORDS.bonus(dir(prev.bonus, next.bonus)),
      figure: `${bonus(prev.bonus)} → ${bonus(next.bonus)}`,
    });
    bullets.push(WORDS.bonusWhat(n), WORDS.bonusNow(bonus(next.bonus)));
  }
  if (!parts.length) return { parts: [{ summary: WORDS.termsSame }], bullets: [WORDS.termsSameWhat] };
  return { parts, bullets };
}

function readRow(n: N, c: ReserveChange, prevCollateral: Record<string, number> | undefined): Read {
  const r = c.row;
  const num = (k: string) => Number(r[k]);
  const on = (v: unknown) => v === true;
  switch (r.kind) {
    case "supply-cap":
      return cap(n, "supply", String(r.old), String(r.new));
    case "borrow-cap":
      return cap(n, "borrow", String(r.old), String(r.new));
    case "reserve-factor": {
      const [a, b] = [num("old"), num("new")];
      return {
        parts: [{ summary: WORDS.reserveFactor(dir(a, b)), figure: `${pct(a)} → ${pct(b)}` }],
        bullets: [WORDS.reserveFactorWhat, WORDS.reserveFactorShare(n, pct(b), pct(10_000 - b))],
      };
    }
    case "liquidation-protocol-fee": {
      const [a, b] = [num("old"), num("new")];
      return {
        parts: [{ summary: WORDS.protocolFee(dir(a, b)), figure: `${pct(a)} → ${pct(b)}` }],
        bullets: [WORDS.protocolFeeWhat, WORDS.protocolFeeNow(pct(b))],
      };
    }
    case "collateral":
      return collateral(n, prevCollateral, { ltv: num("ltv"), lt: num("lt"), bonus: num("bonus") });
    case "debt-ceiling": {
      const [a, b] = [String(r.old), String(r.new)];
      const fig = (v: string) => (v === "0" ? "none" : usd(v));
      if (b === "0")
        return {
          parts: [{ summary: WORDS.ceiling("removed"), figure: `${fig(a)} → none` }],
          bullets: [WORDS.ceilingWhat(n), WORDS.ceilingGone(n)],
        };
      const d = a === "0" ? "set" : a === b ? null : dir(Number(a), Number(b));
      return {
        parts: [
          { summary: d ? WORDS.ceiling(d) : "Debt ceiling restated", figure: d ? `${fig(a)} → ${fig(b)}` : fig(b) },
        ],
        bullets: [WORDS.ceilingWhat(n), WORDS.ceilingStops(n, usd(b))],
      };
    }
    case "frozen":
      return on(r.frozen)
        ? { parts: [{ summary: WORDS.frozen }], bullets: [WORDS.frozenStops(n), WORDS.frozenGoesOn] }
        : { parts: [{ summary: WORDS.unfrozen }], bullets: [WORDS.unfrozenAgain(n)] };
    case "paused":
      return on(r.paused)
        ? { parts: [{ summary: WORDS.paused }], bullets: [WORDS.pausedStops(n)] }
        : { parts: [{ summary: WORDS.unpaused }], bullets: [WORDS.unpausedAgain(n)] };
    case "active":
      return on(r.active)
        ? { parts: [{ summary: WORDS.activated }], bullets: [WORDS.activeWhat(n)] }
        : { parts: [{ summary: WORDS.deactivated }], bullets: [WORDS.inactiveWhat(n)] };
    case "borrowing":
      return on(r.enabled)
        ? { parts: [{ summary: WORDS.borrowOn }], bullets: [WORDS.borrowOnWhat(n)] }
        : { parts: [{ summary: WORDS.borrowOff }], bullets: [WORDS.borrowOffWhat(n)] };
    default:
      // The eMode kinds: their words, no bullets yet.
      return { parts: [{ summary: c.words }], bullets: [] };
  }
}

/** Every change (newest first, as `reserveChanges` gives them) explained, in the same order. */
export function reserveChangesExplained(changes: ReserveChange[], n: N): ReserveChangeExplained[] {
  let lastCollateral: Record<string, number> | undefined;
  const out: ReserveChangeExplained[] = [];
  for (const c of [...changes].reverse()) {
    const read = readRow(n, c, lastCollateral);
    if (c.row.kind === "collateral")
      lastCollateral = { ltv: Number(c.row.ltv), lt: Number(c.row.lt), bonus: Number(c.row.bonus) };
    const figures = read.parts.filter((p) => p.figure);
    out.push({
      headline: read.parts.map((p, i) => (i ? low1(p.summary) : p.summary)).join(", "),
      ...(figures.length === 1 ? { figure: figures[0].figure } : {}),
      bullets: read.bullets,
    });
  }
  return out.reverse();
}
