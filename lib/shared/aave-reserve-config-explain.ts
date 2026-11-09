// An Aave V3 reserve's configuration change explained (anatomy M3.6; Aave V3,
// SparkLend, Seamless): one row of aave-reserve-config-words.ts at a time, the
// timeline row's head (a verb summary and the figure that moved) and, opened,
// plain-language bullets on what the setting does and what this change means
// for a supplier or a borrower (components/shared/config-change-timeline.tsx).
// The eMode kinds keep config-words' text as the head, except an isolation row
// that restates its category's value, which says so. Every string is in WORDS;
// the logic below picks and fills them. Pure: type imports only, so the unit
// test (scripts/test/aave-reserve-config-explain.test.mjs) runs it under node.
//
// The facts, from aave-dao/aave-v3-origin at 8305565 (src/contracts/protocol/):
//   libraries/logic/ValidationLogic.sol: supply 39–70 (active, not paused, not
//     frozen, under the supply cap; 0 is no cap), withdraw 72–83 and repay
//     167–188 (active, not paused), borrow 103–157 (active, not paused, not
//     frozen, borrowing on or, in eMode, borrowable in the category, 121–131;
//     under the borrow cap), liquidation 253–300 (both reserves active and not
//     paused), the ltvzero asset withdrawn first 398–429, transfer 436–438 (not
//     paused), a reserve's LTV in eMode 524–549 (the category's LTV for its
//     collateral, 0 for an ltvzero asset, 0 for other collateral in an isolated
//     category, else the reserve's)
//   libraries/logic/GenericLogic.sol 77–131: the category's liquidation
//     threshold for its collateral
//   libraries/logic/LiquidationLogic.sol 226–236: the category's bonus for its
//     collateral
//   libraries/types/DataTypes.sol 141–151: a category's terms, bitmaps and
//     isolation
//   pool/PoolConfigurator.sol 328–373 (setEModeCategory emits the category and
//     its isolation together), 376–441 (collateral, borrowable, ltvzero)
// and at v3.1.0 (e627c74, src/core/contracts/protocol/), where a reserve named
// its one category: pool/PoolConfigurator.sol 453–470 (setAssetEModeCategory),
// libraries/logic/GenericLogic.sol 117–146 and ValidationLogic.sol 219–221
// (the category's terms for its assets; borrowing in eMode only those).

import type { ReserveChange } from "./aave-reserve-config-words";

export interface ReserveExplainNames {
  symbol: string;
  /** The compact figure (lib/shared/compact-figure.ts `compactFigure`). */
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

  eModeWhat:
    "An eMode category is a set of assets with its LTV, liquidation threshold and liquidation bonus; a borrower who chooses the category borrows on those terms.",
  joined: (n: N, cat: string) =>
    `Borrowers who choose ${cat} count ${n.symbol} at the category's LTV and liquidation threshold, and can borrow it there.`,
  leftAll: (n: N) =>
    `${n.symbol} belongs to no eMode category now: every borrower counts it at the reserve's LTV and liquidation threshold.`,
  collateralOn: (n: N, cat: string) =>
    `Borrowers who choose ${cat} count ${n.symbol} as collateral at the category's LTV and liquidation threshold.`,
  collateralOff: (n: N, cat: string) => `Borrowers in ${cat} lose the category's terms on ${n.symbol} collateral.`,
  borrowableOn: (n: N, cat: string) => `Borrowers who choose ${cat} can borrow ${n.symbol}.`,
  borrowableOff: (n: N, cat: string) =>
    `Borrowers in ${cat} can take no new ${n.symbol} loans; open loans stay open and can be repaid.`,
  ltvzeroOn: (n: N, cat: string) =>
    `For borrowers in ${cat}, ${n.symbol} supports no borrowing and still counts toward the health factor.`,
  ltvzeroFirst: (n: N, cat: string) =>
    `A borrower in ${cat} holding ${n.symbol} with other collateral must withdraw the ${n.symbol} before withdrawing any other collateral.`,
  ltvzeroOff: (n: N, cat: string) => `Borrowers in ${cat} count ${n.symbol} at the category's LTV again.`,
  isolatedWhat: (cat: string) =>
    `${cat} is isolated: for its borrowers, only the category's collateral supports borrowing.`,
  notIsolatedWhat: (cat: string) => `A borrower in ${cat} counts collateral outside the category at its reserve's LTV.`,
  unIsolated: (cat: string) =>
    `${cat} is no longer isolated: its borrowers count collateral outside the category at its reserve's LTV again.`,
  isolationRestated: (words: string) => `${words}, restated`,
  isolationWithTerms: "Each update to a category's terms writes its isolation again, in the same transaction.",
  isolationSame: "The Pool wrote the category's isolation again with the same value.",
  eLtv: (cat: string, per100: string) =>
    `For borrowers in ${cat}, each $100 of the category's collateral supports up to $${per100} of borrowing.`,
  eLt: (cat: string, per100: string) =>
    `For borrowers in ${cat}, each $100 of the category's collateral counts as $${per100} toward the health factor.`,
  eBonus: (cat: string, p: string) =>
    `A liquidator of a position in ${cat} takes ${p} extra of the category's collateral over the debt repaid.`,
  eSame: "The Pool wrote the category's terms again with the same values.",
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

/** What the eMode rows are read against: each category's name, and its
 *  terms and isolation as last written. */
interface EModeState {
  name: (id: unknown) => string;
  terms: Map<number, Record<string, number>>;
  isolated: Map<number, boolean>;
  /** Transactions that wrote a category's terms, by "tx:category". */
  termTxs: Set<string>;
}

function eModeRow(n: N, c: ReserveChange, e: EModeState): Read | null {
  const r = c.row;
  const on = (v: unknown) => v === true;
  const id = Number(r.categoryId);
  const cat = e.name(r.categoryId);
  switch (r.kind) {
    case "asset-category": {
      const to = Number(r.to);
      return {
        parts: [{ summary: c.words }],
        bullets: [WORDS.eModeWhat, to === 0 ? WORDS.leftAll(n) : WORDS.joined(n, e.name(to))],
      };
    }
    case "emode-collateral":
      return {
        parts: [{ summary: c.words }],
        bullets: [WORDS.eModeWhat, on(r.collateral) ? WORDS.collateralOn(n, cat) : WORDS.collateralOff(n, cat)],
      };
    case "emode-borrowable":
      return {
        parts: [{ summary: c.words }],
        bullets: [WORDS.eModeWhat, on(r.borrowable) ? WORDS.borrowableOn(n, cat) : WORDS.borrowableOff(n, cat)],
      };
    case "emode-ltvzero":
      return {
        parts: [{ summary: c.words }],
        bullets: on(r.ltvzero) ? [WORDS.ltvzeroOn(n, cat), WORDS.ltvzeroFirst(n, cat)] : [WORDS.ltvzeroOff(n, cat)],
      };
    case "emode-isolation": {
      const now = on(r.isolated);
      const was = e.isolated.get(id);
      const what = now ? WORDS.isolatedWhat(cat) : was === true ? WORDS.unIsolated(cat) : WORDS.notIsolatedWhat(cat);
      if (e.isolated.get(id) !== now) return { parts: [{ summary: c.words }], bullets: [what] };
      return {
        parts: [{ summary: WORDS.isolationRestated(c.words) }],
        bullets: [
          e.termTxs.has(`${r.txHash}:${id}`) ? WORDS.isolationWithTerms : WORDS.isolationSame,
          ...(now ? [WORDS.isolatedWhat(cat)] : []),
        ],
      };
    }
    case "category": {
      const next = { ltv: Number(r.ltv), lt: Number(r.lt), bonus: Number(r.bonus) };
      const prev = e.terms.get(id);
      const per100 = (v: number) => String(v / 100);
      const bullets: string[] = prev ? [] : [WORDS.eModeWhat];
      if (!prev || prev.ltv !== next.ltv) bullets.push(WORDS.eLtv(cat, per100(next.ltv)));
      if (!prev || prev.lt !== next.lt) bullets.push(WORDS.eLt(cat, per100(next.lt)));
      if (!prev || prev.bonus !== next.bonus) bullets.push(WORDS.eBonus(cat, pct(next.bonus - 10_000)));
      return { parts: [{ summary: c.words }], bullets: bullets.length ? bullets : [WORDS.eSame] };
    }
    default:
      return null;
  }
}

function readRow(n: N, c: ReserveChange, prevCollateral: Record<string, number> | undefined, e: EModeState): Read {
  const r = c.row;
  const eMode = eModeRow(n, c, e);
  if (eMode) return eMode;
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
      return { parts: [{ summary: c.words }], bullets: [] };
  }
}

/** Every change (newest first, as `reserveChanges` gives them) explained, in the same order. */
export function reserveChangesExplained(changes: ReserveChange[], n: N): ReserveChangeExplained[] {
  let lastCollateral: Record<string, number> | undefined;
  // A category's name as config-words writes it: "PT-srUSDe Stablecoins (47)".
  const labels = new Map<number, string>();
  for (const { row } of changes)
    if (row.kind === "category" && row.label) labels.set(Number(row.categoryId), String(row.label));
  const e: EModeState = {
    name: (v) => {
      const id = Number(v);
      const label = labels.get(id);
      return label ? `${label} (${id})` : `eMode category ${id}`;
    },
    terms: new Map(),
    isolated: new Map(),
    termTxs: new Set(
      changes.filter((c) => c.row.kind === "category").map((c) => `${c.row.txHash}:${Number(c.row.categoryId)}`),
    ),
  };
  const out: ReserveChangeExplained[] = [];
  for (const c of [...changes].reverse()) {
    const read = readRow(n, c, lastCollateral, e);
    const r = c.row;
    if (r.kind === "collateral") lastCollateral = { ltv: Number(r.ltv), lt: Number(r.lt), bonus: Number(r.bonus) };
    if (r.kind === "category")
      e.terms.set(Number(r.categoryId), { ltv: Number(r.ltv), lt: Number(r.lt), bonus: Number(r.bonus) });
    if (r.kind === "emode-isolation") e.isolated.set(Number(r.categoryId), r.isolated === true);
    const figures = read.parts.filter((p) => p.figure);
    out.push({
      headline: read.parts.map((p, i) => (i ? low1(p.summary) : p.summary)).join(", "),
      ...(figures.length === 1 ? { figure: figures[0].figure } : {}),
      bullets: read.bullets,
    });
  }
  return out.reverse();
}
