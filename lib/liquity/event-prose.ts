// The Liquity V2 event prose generator: one event in, its five levels out as
// data (BRIEF 5 Oct 2026; rails-ops TO-DO-ui-jobs 273). The card's header,
// opened grid, explanation and "?" modal, the Copy for LLM block, the test
// exports and the JSON route all read what this returns; the strings come from
// content/liquity-v2/event-prose.yaml (loaded by lib/liquity/event-templates.ts)
// and nowhere else.
//
//   L1  the header line          L4  the explanation's sentences (and list)
//   L2  the opened card's grid   L5  the "?" modal
//   L3  the ledgers — lib/liquity/event-ledgers.ts, from the page's replay
//
// Every value a template reads is kept unrounded in `values`; a sentence is
// its id, the placeholders it read, and its text as segments, so the page can
// bold a figure or attach its receipt without the text changing.
//
// Pure TypeScript with no React, so the export script loads it with type
// stripping (scripts/exports-liquity-v2.mjs).

import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import type { BaseActivityEvent, GasCost } from "@/lib/shared/types/activity";
import type { FocusEvent } from "@/lib/shared/flow-focus";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import {
  CONTEXT_WORDS,
  FOOTER_WORDS,
  FRAGMENTS,
  GROUP_WORDS,
  L1_WORDS,
  L2_WORDS,
  L5,
  PLACEHOLDERS,
  SHARED_SENTENCES,
  TEMPLATES,
  type EventTemplate,
  type L5Key,
  type Rounding,
  type SentenceTemplate,
} from "@/lib/liquity/event-templates";
import {
  fmtAccrued,
  fmtColl,
  fmtCr,
  fmtDebt,
  fmtRate,
  fmtRateChange,
  fmtRateNum,
  fmtUsdWhole,
} from "@/lib/liquity/figure-format";
import { ledgerFigure } from "@/lib/shared/coll-figure";
import { fmtHeaderMagnitude } from "@/lib/shared/spine-format";
import { liquityBeforeAmounts, liquityEventSafety } from "@/lib/liquity/event-safety";
import { exactCollAfter, exactDebtAfter } from "@/lib/liquity/utils/interest-calculator";
import { isLiquityEvent } from "@/lib/shared/types/activity";
import { LQ } from "@/lib/shared/liquity-flows";
import {
  accrualNoun,
  batchFeeAfter,
  batchRateDebtMove,
  liquityAccrual,
  type BatchFeeAfter,
  type LiquityAccrual,
} from "@/lib/liquity/accrual";
import { collChangeProv, debtChangeProv, liquityRedistOnAdjust } from "@/lib/liquity/event-provenance";
import { isNoChangeAdjust, LIQUITY_MIN_DEBT, TROVE_DELTA_EPSILON } from "@/lib/liquity/trove-ops";
import { getBatchManagerByAddress, getBatchManagerName } from "@/lib/liquity/batch-managers";
import { formatDate, formatMonthDay } from "@/lib/date";
import { formatGasCost } from "@/lib/shared/format-event";
import { usdShown } from "@/lib/shared/usd-display";

// ── Output ───────────────────────────────────────────────────────────────────

/** The receipt a figure echoes on the page (components/protocol/liquity/
 *  event-prose-render.tsx maps each to its provenance builder). */
export type EchoKey = "coll_change" | "debt_change" | "rate_after" | "upfront_fee" | "redist_debt" | "redist_coll";
export type Emphasis = EchoKey | "bold";

export interface ProseSeg {
  text: string;
  /** The placeholder this text fills. */
  name?: string;
  emph?: Emphasis;
  /** A ratio pair: the page bolds whichever form the viewer's ratio setting shows. */
  pair?: { cr: string; ltv: string };
  /** An address the page links to the explorer. */
  address?: string;
  tone?: "manager" | "address";
}

export interface ProseSentence {
  sentence_id: string;
  text: string;
  uses: string[];
  segs: ProseSeg[];
  /** The `group_words` id it sits under; set only when the explanation is
   *  grouped (`grouped`). */
  group?: string;
}

export type ProseValue = number | string | null;

export interface LiquityL2 {
  showGrid: boolean;
  /** A batch manager's rate change shows only the rate cell. */
  rateOnly: boolean;
  isClose: boolean;
  isRedemption: boolean;
  isLiquidation: boolean;
  price: number;
  coll: { before: number; after: number; beforeUsd: number; afterUsd: number };
  /** `before`: the debt recorded at the previous event, as the Debt ledger's
   *  closing line states it. `accrued`: the accrual since then comes to a
   *  printed figure; `accrualMove`: it is the whole move ("+8,580.12
   *  interest = 667,073.79"). */
  debt: {
    before: number;
    after: number;
    upfrontFee: number;
    accrued: boolean;
    accrualMove: boolean;
    /** The accrual as printed: with the replay, the printed move less the
     *  event's other rows, so it is the sum of the ledger's "since last
     *  event" rows. */
    accrualShown: number;
  };
  cr: { before: number; after: number };
  rate: { before: number; after: number; yearly: number; yearlyFee: number };
  accrual: LiquityAccrual;
  batchFee: BatchFeeAfter | null;
  batched: boolean;
  redemption: {
    plHistoric: number;
    showPl: boolean;
    claimable: number | null;
    /** T2's row under the price chip (ui-jobs 283): where the redeemed
     *  collateral at the latest block's price sits on the other side of the
     *  debt it paid off. */
    today: string | null;
  } | null;
  redeemer: string | null;
  lines: string[];
}

export interface LiquityEventProse {
  template: { id: string; variant: string; version: string };
  title: string;
  L1: string;
  L2: LiquityL2 | null;
  /** L4: the teaser is the first sentence. */
  L4: ProseSentence[];
  /** A liquidation's payout legs, under the bullets. */
  list: ProseSentence[];
  L5: { key: L5Key; content: LearnMoreContent };
  footer: {
    gas: string | null;
    /** The gas the owner paid, for the card's gas figure (ui-jobs 289). */
    gasCost: { eth: number; usd: number } | null;
    /** The no-change run's transaction count where the gas covers a run. */
    gasRun: number | null;
    tx: string;
    block: number;
  };
  values: Record<string, ProseValue>;
}

export interface LiquityProseInput {
  ctx: LiquityContext;
  event: { id: string; txHash: string; blockNumber: number; timestamp: number; gas?: GasCost };
  previousEvent?: BaseActivityEvent;
  /** The event as a timeline row (accrual and the batch rate move read it). */
  currentEvent?: BaseActivityEvent;
  /** Today's oracle price for the collateral (redemption's "today" variant). */
  currentPrice?: number;
  /** The page's replay of this event, where it has one (FlowFocus). */
  ledger?: FocusEvent | null;
  /** The decimals the card's ledgers print at, where the page has them. */
  collDecimals?: number | null;
  debtDecimals?: number | null;
  /** When the owner claimed a liquidation's surplus: undefined while unclaimed
   *  or unknown, null when claimed but undated. */
  surplusClaimedAt?: number | null;
}

// ── Rounding ─────────────────────────────────────────────────────────────────

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The old explanation's free figure: whole from 1,000, four places from 1. */
function fmtAmount(n: number): string {
  if (!isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  const decimals = Math.min(8, Math.ceil(-Math.log10(abs)) + 2);
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

function fmtUsdCents(value: number): string {
  if (value < 0.01) return "< $0.01";
  if (value < 1) return `$${value.toFixed(2)}`;
  return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDay(tsSeconds: number): string {
  const d = new Date(tsSeconds * 1000);
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  const base = formatMonthDay(d);
  return sameYear ? base : `${base}, ${String(d.getUTCFullYear()).slice(-2)}`;
}

function fmtSpan(seconds: number): string {
  const hours = seconds / 3600;
  if (hours < 24) {
    const h = Math.max(1, Math.round(hours));
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  return `${(hours / 24).toFixed(1)} days`;
}

interface FmtEnv {
  values: Record<string, ProseValue>;
  collDecimals: number | null;
}

const num = (v: ProseValue): number => (typeof v === "number" ? v : Number(v));

/** A collateral figure at the ledger's decimals. */
const collAt = (n: number, dec: number | null) => ledgerFigure(n, dec, fmtColl(n));

/** Each rounding, as the file's `roundings` (ROUNDINGS) describes it. */
const ROUNDING: Record<Rounding, (v: ProseValue, name: string, env: FmtEnv) => string> = {
  coll: (v, _n, env) => collAt(num(v), env.collDecimals),
  coll_trim: (v, _n, env) => {
    const t = collAt(num(v), env.collDecimals);
    return t.includes(".") ? t.replace(/\.?0+$/, "") : t;
  },
  debt: (v) => fmtDebt(num(v)),
  accrued: (v) => fmtAccrued(num(v)),
  accrued_signed: (v) => `${num(v) >= 0 ? "+" : "−"}${fmtAccrued(Math.abs(num(v)))}`,
  amount: (v) => fmtAmount(num(v)),
  usd: (v) => fmtUsdWhole(num(v)),
  usd_about: (v) =>
    num(v) >= 10_000 ? `about $${(Math.round(num(v) / 1000) * 1000).toLocaleString("en-US")}` : fmtUsdWhole(num(v)),
  usd_cents: (v) => fmtUsdCents(num(v)),
  ratio: (v) => fmtCr(num(v)),
  ratio_whole: (v, _n, env) => {
    const b = env.values.cr_before_same_price;
    const a = env.values.cr_after;
    const alike = typeof b === "number" && typeof a === "number" && Math.round(b) === Math.round(a);
    return alike ? fmtCr(num(v)) : `${Math.round(num(v))}%`;
  },
  ratio_pair: (v) => `${fmtCr(num(v))} (LTV ${(10000 / num(v)).toFixed(2)}%)`,
  rate: (v) => fmtRate(num(v)),
  rate_step: (v, name, env) => {
    const step = fmtRateChange(num(env.values.rate_before), num(env.values.rate_after));
    return name === "rate_before" ? step.before : step.after;
  },
  pct_whole: (v) => `${Math.round(Math.abs(num(v)) * 100)}%`,
  pct3: (v) => `${num(v).toFixed(3)}%`,
  count: (v) => num(v).toLocaleString("en-US"),
  compact: (v) => fmtHeaderMagnitude(Math.abs(num(v))),
  date: (v) => formatDate(num(v)),
  day_short: (v) => fmtDay(num(v)),
  span: (v) => fmtSpan(num(v)),
  manager: (v, name, env) => {
    const n = env.values[`${name}_name`];
    return typeof n === "string" && n ? `${n} (${short(String(v))})` : short(String(v));
  },
  address: (v) => short(String(v)),
  text: (v) => String(v ?? ""),
};

const TOKEN = /\{([a-z_0-9]+)(?:\|([a-z_]+))?\}/g;

/** The placeholders a string reads. */
export function placeholdersOf(text: string): { name: string; rounding: Rounding }[] {
  return [...text.matchAll(TOKEN)].map((m) => ({
    name: m[1],
    rounding: (m[2] as Rounding | undefined) ?? PLACEHOLDERS[m[1]]?.rounding ?? "text",
  }));
}

/** Fill a string's placeholders. A placeholder the values lack is an error in
 *  the generator, so it throws. */
function fill(
  text: string,
  env: FmtEnv,
  emph: Record<string, Emphasis> = {},
): { text: string; segs: ProseSeg[]; uses: string[] } {
  const segs: ProseSeg[] = [];
  const uses: string[] = [];
  let at = 0;
  for (const m of text.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > at) segs.push({ text: text.slice(at, i) });
    const name = m[1];
    const rounding = (m[2] as Rounding | undefined) ?? PLACEHOLDERS[name]?.rounding ?? "text";
    const v = env.values[name];
    if (v === undefined || v === null) throw new Error(`event prose: no value for {${name}} in "${text}"`);
    const out = ROUNDING[rounding](v, name, env);
    const seg: ProseSeg = { text: out, name };
    if (emph[name]) seg.emph = emph[name];
    if (rounding === "ratio_pair") seg.pair = { cr: fmtCr(num(v)), ltv: `${(10000 / num(v)).toFixed(2)}%` };
    if (rounding === "manager" || rounding === "address") {
      seg.address = String(v);
      seg.tone = rounding;
    }
    segs.push(seg);
    if (!uses.includes(name)) uses.push(name);
    at = i + m[0].length;
  }
  if (at < text.length) segs.push({ text: text.slice(at) });
  return { text: segs.map((s) => s.text).join(""), segs, uses };
}

/** A string's text around the named placeholders, the others filled: for a
 *  page that wraps those figures in their receipts. `names` in the order
 *  they appear; the result has one more piece than `names`. */
export function wordsAround(text: string, names: string[], values: Record<string, ProseValue> = {}): string[] {
  const out: string[] = [];
  let rest = text;
  for (const name of names) {
    const at = rest.indexOf(`{${name}}`);
    if (at < 0) throw new Error(`event prose: no {${name}} in "${text}"`);
    out.push(fillText(rest.slice(0, at), values));
    rest = rest.slice(at + name.length + 2);
  }
  out.push(fillText(rest, values));
  return out;
}

/** Fill a string's placeholders to text. */
export function fillText(text: string, values: Record<string, ProseValue>, collDecimals: number | null = null): string {
  return fill(text, { values, collDecimals }).text;
}

// ── Templates ────────────────────────────────────────────────────────────────

const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

export function liquityTemplate(id: string): EventTemplate {
  const t = BY_ID.get(id);
  if (!t) throw new Error(`event prose: no template ${id}`);
  return t;
}

/** A sentence of the template, or a shared one it lists. */
function sentenceOf(t: EventTemplate, id: string): SentenceTemplate {
  const s = t.sentences[id] ?? (t.order.includes(id) ? SHARED_SENTENCES[id] : undefined);
  if (!s) throw new Error(`event prose: ${t.id} has no sentence ${id}`);
  return s;
}

/** A short content hash of a template's strings: the sidecar's version, so a
 *  regenerated export shows which templates changed. */
export function templateVersion(t: EventTemplate): string {
  const shared = t.order.filter((id) => SHARED_SENTENCES[id]).map((id) => SHARED_SENTENCES[id].text);
  const src = JSON.stringify([t.title, t.L1, Object.values(t.sentences).map((s) => s.text), shared, t.groups]);
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ── L1 ───────────────────────────────────────────────────────────────────────

const REDEMPTION_OPS = new Set(["redeemCollateral", "adjustZombieTrove", "adjustUnredeemableZombieTrove"]);

/** The header's label for the event. */
export function liquityL1Label(ctx: LiquityContext): string {
  switch (ctx.operation) {
    case "openTrove":
    case "openTroveAndJoinBatch":
      return L1_WORDS.open;
    case "closeTrove":
      return L1_WORDS.close;
    case "liquidate":
      return L1_WORDS.liquidation;
    case "adjustTrove": {
      if (ctx.noChangeRun) return fillText(L1_WORDS.no_change_run, { run_count: ctx.noChangeRun.count });
      if (ctx.troveOperation) {
        const debtOp = ctx.troveOperation.debtChangeFromOperation;
        const collOp = ctx.troveOperation.collChangeFromOperation;
        const hasDebt = Math.abs(debtOp) >= TROVE_DELTA_EPSILON;
        const hasColl = Math.abs(collOp) >= TROVE_DELTA_EPSILON;
        if (!hasDebt && !hasColl) return L1_WORDS.no_change;
        const c = collOp > 0 ? L1_WORDS.add : L1_WORDS.withdraw;
        const d = debtOp > 0 ? L1_WORDS.borrow : L1_WORDS.repay;
        if (hasDebt && !hasColl) return d;
        if (hasColl && !hasDebt) return c;
        return `${c} + ${d}`;
      }
      return L1_WORDS.adjust;
    }
    case "adjustTroveInterestRate":
      if (ctx.stateBefore && ctx.stateAfter)
        return ctx.stateAfter.annualInterestRate > ctx.stateBefore.annualInterestRate
          ? L1_WORDS.rate_up
          : L1_WORDS.rate_down;
      return L1_WORDS.rate_change;
    case "applyPendingDebt":
      return L1_WORDS.apply_debt;
    case "redeemCollateral":
      return L1_WORDS.redemption;
    case "adjustZombieTrove":
    case "adjustUnredeemableZombieTrove":
      return L1_WORDS.redeemed;
    case "setInterestBatchManager":
      return L1_WORDS.delegate;
    case "removeFromBatch":
      return L1_WORDS.leave_delegate;
    case "transferTrove":
      return L1_WORDS.transfer;
    case "setBatchManagerAnnualInterestRate":
      return L1_WORDS.batch_rate;
    default:
      return ctx.operation;
  }
}

function l1Line(t: EventTemplate, values: Record<string, ProseValue>, env: FmtEnv): string {
  const groups: string[] = [];
  for (const group of t.L1) {
    const words: string[] = [];
    let missing = false;
    for (const p of group) {
      if ("word" in p) {
        words.push(L1_WORDS[p.word]);
        continue;
      }
      const v = values[p.figure];
      if (v == null || (typeof v === "number" && !(Math.abs(v) > 0))) {
        missing = true;
        break;
      }
      let text = ROUNDING[p.rounding ?? PLACEHOLDERS[p.figure]?.rounding ?? "text"](v, p.figure, env);
      if (p.sign) text = `${num(values[`${p.figure}_sign`]) < 0 ? "−" : "+"}${text}`;
      words.push(p.symbol ? `${text} ${values[p.symbol]}` : text);
    }
    if (!missing && words.length) groups.push(words.join(" "));
  }
  return groups.join(" · ");
}

// ── The generator ────────────────────────────────────────────────────────────

class Speaker {
  private said = new Map<string, ProseSentence>();
  private t: EventTemplate;
  private env: FmtEnv;
  constructor(t: EventTemplate, env: FmtEnv) {
    this.t = t;
    this.env = env;
  }
  say(id: string, emph?: Record<string, Emphasis>): void {
    const s = sentenceOf(this.t, id);
    const f = fill(s.text, this.env, emph);
    this.said.set(id, { sentence_id: id, text: f.text, uses: f.uses, segs: f.segs });
  }
  /** The sentences said, in the template's order; the list apart. */
  out(): { L4: ProseSentence[]; list: ProseSentence[] } {
    const L4 = this.t.order.filter((id) => this.said.has(id)).map((id) => this.said.get(id)!);
    const list = (this.t.list ?? []).filter((id) => this.said.has(id)).map((id) => this.said.get(id)!);
    return { L4, list };
  }
}

function pick(ctx: LiquityContext): { id: string; variant: string } {
  const op = ctx.troveOperation;
  switch (ctx.operation) {
    case "openTrove":
      return { id: "liquity2.open", variant: "self" };
    case "openTroveAndJoinBatch":
      return { id: "liquity2.open", variant: "join_batch" };
    case "closeTrove": {
      const repaid = op ? Math.abs(op.debtChangeFromOperation) : ctx.stateBefore.debt;
      return { id: "liquity2.close", variant: repaid > 0 ? "repaid" : "zero_debt" };
    }
    case "adjustTrove": {
      if (ctx.noChangeRun) return { id: "liquity2.adjust.no_change", variant: "run" };
      if (!op) return { id: "liquity2.fallback", variant: "default" };
      if (isNoChangeAdjust(ctx)) return { id: "liquity2.adjust.no_change", variant: "single" };
      const hasColl = Math.abs(op.collChangeFromOperation) >= TROVE_DELTA_EPSILON;
      const hasDebt = Math.abs(op.debtChangeFromOperation) >= TROVE_DELTA_EPSILON;
      const c = op.collChangeFromOperation > 0 ? "add" : "withdraw";
      const d = op.debtChangeFromOperation > 0 ? "borrow" : "repay";
      if (hasColl && hasDebt) return { id: "liquity2.adjust.combined", variant: `${c}_${d}` };
      if (hasColl)
        return { id: c === "add" ? "liquity2.adjust.add_coll" : "liquity2.adjust.withdraw_coll", variant: "default" };
      return { id: d === "borrow" ? "liquity2.adjust.borrow" : "liquity2.adjust.repay", variant: "default" };
    }
    case "adjustTroveInterestRate":
      return {
        id: "liquity2.adjust.rate",
        variant: ctx.stateAfter.annualInterestRate > ctx.stateBefore.annualInterestRate ? "raised" : "lowered",
      };
    case "redeemCollateral":
    case "adjustZombieTrove":
    case "adjustUnredeemableZombieTrove":
      return { id: "liquity2.redemption", variant: ctx.redemption ? "at_event" : "no_detail" };
    case "setInterestBatchManager":
      return { id: "liquity2.delegation.join", variant: "default" };
    case "removeFromBatch":
      return { id: "liquity2.delegation.leave", variant: "default" };
    case "setBatchManagerAnnualInterestRate": {
      const step = fmtRateChange(ctx.stateBefore.annualInterestRate, ctx.stateAfter.annualInterestRate);
      return {
        id: "liquity2.delegation.rate_update",
        variant: !step.changed
          ? "kept"
          : ctx.stateAfter.annualInterestRate > ctx.stateBefore.annualInterestRate
            ? "raised"
            : "lowered",
      };
    }
    case "liquidate": {
      if (!ctx.liquidation) return { id: "liquity2.liquidation", variant: "no_detail" };
      const gain = ctx.stateAfter.debt > 0 && op && op.collIncreaseFromRedist > 0;
      return { id: "liquity2.liquidation", variant: gain ? "redistribution_gain" : "destructive" };
    }
    case "applyPendingDebt":
      return { id: "liquity2.apply_pending_debt", variant: "default" };
    case "transferTrove":
      return { id: "liquity2.transfer", variant: ctx.transfer ? ctx.transfer.transferType : "no_detail" };
    default:
      return { id: "liquity2.fallback", variant: "default" };
  }
}

/** Which redemption-vs-today variant applies, by where the price has gone
 *  since; null with no today price, or where the redeemed collateral at
 *  today's price still sits on the same side of the debt it paid off as at
 *  the redemption (a move smaller than the fee). */
function redemptionToday(
  priceAtEvent: number,
  priceToday: number | undefined,
  debtCleared: number,
  collTaken: number,
): "lower" | "higher" | null {
  if (!priceToday || !(priceToday > 0) || fmtUsdWhole(priceToday) === fmtUsdWhole(priceAtEvent)) return null;
  const vsToday = collTaken * priceToday - debtCleared;
  if (priceToday < priceAtEvent) return vsToday < 0 ? "lower" : null;
  return vsToday > 0 ? "higher" : null;
}

function l5For(key: L5Key, ctx: LiquityContext, variant: string): LearnMoreContent {
  return L5[key]({
    collateralType: ctx.collateralType,
    delegated: ctx.isInBatch,
    delegateName: ctx.batchManager ? getBatchManagerByAddress(ctx.batchManager)?.name : undefined,
    zeroDebt: variant === "zero_debt",
  });
}

/** The event's five levels (L3 apart: lib/liquity/event-ledgers.ts). */
export function liquityEventProse(input: LiquityProseInput): LiquityEventProse {
  const { ctx, event, previousEvent, currentEvent, currentPrice, ledger, surplusClaimedAt } = input;
  const collDecimals = input.collDecimals ?? null;
  const values: Record<string, ProseValue> = {};
  const env: FmtEnv = { values, collDecimals };
  const sel = pick(ctx);
  const variant = sel.variant;
  const t = liquityTemplate(sel.id);
  const sp = new Speaker(t, env);
  const v = values;

  const collSym = ctx.collateralType;
  const debtSym = ctx.assetType ?? "BOLD";
  const { stateBefore, stateAfter, troveOperation: op } = ctx;
  const price = ctx.collateralPrice ?? 0;
  v.coll_symbol = collSym;
  v.debt_symbol = debtSym;
  v.label = liquityL1Label(ctx);
  v.block = event.blockNumber;
  v.min_debt = LIQUITY_MIN_DEBT;
  if (price > 0) v.price_at_event = price;

  // The header's change figures (event-provenance.ts), for L1.
  const collCp = stateAfter && stateBefore ? collChangeProv(ctx) : undefined;
  const debtCp = stateAfter && stateBefore ? debtChangeProv(ctx) : undefined;
  if (collCp && Math.abs(collCp.change) >= 0.01) v.coll_change = Math.abs(collCp.change);
  if (debtCp && Math.abs(debtCp.change) >= 0.01) v.debt_change = Math.abs(debtCp.change);

  const accrual = stateBefore && stateAfter ? liquityAccrual(ctx, previousEvent, currentEvent, ledger) : null;
  const safety = stateBefore && stateAfter ? liquityEventSafety(ctx, previousEvent) : null;
  if (safety) {
    v.mcr = safety.mcr;
    if (safety.crBefore != null) v.cr_before_same_price = safety.crBefore;
    if (safety.crAfter != null) v.cr_after = safety.crAfter;
    if (safety.liqPriceBefore != null) v.liq_price_before = safety.liqPriceBefore;
    if (safety.liqPriceAfter != null) v.liq_price_after = safety.liqPriceAfter;
    if (safety.liqPriceBefore != null && safety.price > 0)
      v.liq_distance_before = 1 - safety.liqPriceBefore / safety.price;
    if (safety.liqPriceAfter != null && safety.price > 0)
      v.liq_distance_after = 1 - safety.liqPriceAfter / safety.price;
    if (safety.prevPrice != null) v.price_prev = safety.prevPrice;
    if (safety.priceChange != null) v.price_change = safety.priceChange;
  }
  if (stateAfter) {
    v.debt_after = stateAfter.debt;
    const collAfter = exactCollAfter(ctx);
    v.coll_after = collAfter;
    v.rate_after = stateAfter.annualInterestRate;
    if (price > 0) v.coll_after_usd = collAfter * price;
  }
  if (stateBefore) {
    v.debt_before = stateBefore.debt;
    v.rate_before = stateBefore.annualInterestRate;
  }
  if (ctx.batchManager) {
    v.rate_setter = getBatchManagerName(ctx.batchManager);
  }
  const upfront = op?.debtIncreaseFromUpfrontFee ?? 0;
  if (upfront > 0) v.upfront_fee = upfront;
  if (accrual) {
    v.accrued_total = accrual.total;
    v.accrued_fee = accrual.fee;
  }

  const market = () => {
    if (!safety?.priceMoveMaterial || safety.priceChange == null || safety.prevPrice == null) return;
    sp.say(safety.priceChange < 0 ? "market.fell" : "market.rose");
  };
  const ratioMoved = () =>
    safety?.crBefore != null &&
    safety.crAfter != null &&
    safety.price > 0 &&
    fmtCr(safety.crBefore) !== fmtCr(safety.crAfter);
  const liqDistance = (id: string) => {
    if (v.liq_distance_after == null || v.liq_distance_before == null) return;
    if (!(num(v.liq_distance_after) > 0)) return;
    sp.say(id);
  };
  const accrualSentence = () => {
    if (!accrual || !(accrual.total > 0.01)) return;
    const bold = { accrued_total: "bold" as const };
    if (!accrual.batched) sp.say("accrual.interest", bold);
    else if (accrual.split && accrual.fee > 0.005) sp.say("accrual.batched_fee", bold);
    else sp.say("accrual.batched", bold);
  };
  const crPairNow = () => {
    if (stateAfter.collateralRatio > 0) {
      v.cr_after = stateAfter.collateralRatio;
      sp.say("state.cr");
    }
  };
  const ECHO_FEE = { upfront_fee: "upfront_fee" as const };

  switch (t.id) {
    // ── Adjust family ──
    case "liquity2.adjust.add_coll":
    case "liquity2.adjust.withdraw_coll":
    case "liquity2.adjust.borrow":
    case "liquity2.adjust.repay":
    case "liquity2.adjust.combined": {
      const collOp = op!.collChangeFromOperation;
      const debtOp = op!.debtChangeFromOperation;
      if (collOp > 0) {
        v.added = collOp;
        v.added_usd = collOp * price;
      } else if (collOp < 0) {
        v.withdrawn = -collOp;
        v.withdrawn_usd = -collOp * price;
      }
      if (debtOp > 0) v.borrowed = debtOp;
      else if (debtOp < 0) v.repaid = -debtOp;
      if (t.id === "liquity2.adjust.combined") {
        v.coll_label = collOp > 0 ? L1_WORDS.add : L1_WORDS.withdraw;
        v.debt_label = debtOp > 0 ? L1_WORDS.borrow : L1_WORDS.repay;
      }
      const echo = {
        added: "coll_change",
        withdrawn: "coll_change",
        borrowed: "debt_change",
        repaid: "debt_change",
      } as const;
      const kind = t.id.split(".")[2];
      if (kind === "combined") sp.say(`combined.what.${variant}`, echo);
      else sp.say(`${kind === "add_coll" ? "add" : kind === "withdraw_coll" ? "withdraw" : kind}.what`, echo);
      if (ratioMoved()) {
        if (kind === "combined")
          sp.say(num(v.cr_after) > num(v.cr_before_same_price) ? "combined.safety_rose" : "combined.safety_fell");
        else sp.say(`${kind === "add_coll" ? "add" : kind === "withdraw_coll" ? "withdraw" : kind}.safety`);
      }
      const base = kind === "add_coll" ? "add" : kind === "withdraw_coll" ? "withdraw" : kind;
      liqDistance(`${base}.liq_distance`);
      market();
      if (upfront > 0 && (kind === "borrow" || kind === "combined")) sp.say("fee.borrow", ECHO_FEE);
      // A liquidated neighbour's redistribution this touch applied.
      const redist = liquityRedistOnAdjust(ctx);
      if (redist) {
        if (redist.debt >= 0.01) v.redist_debt = redist.debt;
        if (redist.coll > 1e-9) v.redist_coll = redist.coll;
        const e = { redist_debt: "redist_debt", redist_coll: "redist_coll" } as const;
        if (redist.debt >= 0.01 && redist.coll > 1e-9) sp.say("redist.both", e);
        else if (redist.debt >= 0.01) sp.say("redist.debt", e);
        else sp.say("redist.coll", e);
        if (redist.debt >= 0.01) {
          const terms: string[] = [];
          const term = (k: string, x: string) => terms.push(fillText(FRAGMENTS[k], { x }));
          if (Math.abs(debtOp) >= TROVE_DELTA_EPSILON)
            term(debtOp < 0 ? "debt_term.repaid" : "debt_term.borrowed", fmtDebt(Math.abs(debtOp)));
          if (upfront > 0) term("debt_term.fee", fmtDebt(upfront));
          term("debt_term.redist", fmtDebt(redist.debt));
          if (accrual && accrual.total > 0.01)
            term(accrual.batched ? "debt_term.interest_and_fees" : "debt_term.interest", fmtAccrued(accrual.total));
          v.debt_terms = terms.join(" ");
          sp.say("redist.balance");
        }
      }
      const rateHeld = stateBefore.annualInterestRate === stateAfter.annualInterestRate;
      const unchangedOk = rateHeld && !redist;
      if (kind === "add_coll" && unchangedOk) sp.say("add.rest");
      if (kind === "repay" && unchangedOk) sp.say("repay.rest");
      if (kind === "combined" && rateHeld) sp.say("combined.rate");
      if (
        (kind === "withdraw_coll" || kind === "borrow") &&
        unchangedOk &&
        safety &&
        safety.mcr > 0 &&
        v.cr_after != null
      )
        sp.say(num(v.cr_after) >= 2 * safety.mcr * 100 ? `${base}.margin_far` : `${base}.margin`);
      if (!rateHeld) sp.say("rate.moved", { rate_before: "bold", rate_after: "rate_after" });
      break;
    }
    case "liquity2.adjust.no_change": {
      const run = ctx.noChangeRun;
      const dust = op ? op.debtChangeFromOperation : 0;
      if (dust < 0) v.dust = Math.abs(dust);
      if (run) {
        v.run_count = run.count;
        v.run_first = run.firstTimestamp;
        v.run_last = run.lastTimestamp;
        sp.say("nochange.run", { run_count: "bold" });
        if (dust < 0) sp.say("nochange.run_repaid");
      } else if (dust < 0) sp.say("nochange.dust");
      else sp.say("nochange.none");
      if (Math.abs(stateAfter.debt - LIQUITY_MIN_DEBT) < TROVE_DELTA_EPSILON) {
        sp.say("nochange.at_min");
        sp.say(run ? "nochange.capped_run" : "nochange.capped");
      }
      sp.say("nochange.bot");
      sp.say("nochange.gas");
      break;
    }
    case "liquity2.adjust.rate": {
      sp.say(variant === "raised" ? "rate.raised" : "rate.lowered", { rate_before: "bold", rate_after: "rate_after" });
      accrualSentence();
      if (upfront > 0) sp.say("rate.fee", ECHO_FEE);
      if (stateAfter.debt > 0) sp.say("state.debt_now", { debt_after: "bold" });
      if (stateAfter.coll > 0 && price > 0) sp.say("rate.coll", { coll_after: "bold", coll_after_usd: "bold" });
      crPairNow();
      break;
    }
    // ── Redemption ──
    case "liquity2.redemption": {
      const r = ctx.redemption;
      if (!r) {
        sp.say("redeem.no_detail");
        break;
      }
      const collTaken = op ? Math.abs(op.collChangeFromOperation) : r.ETHSent;
      const debtCleared = op ? Math.abs(op.debtChangeFromOperation) : r.actualBoldAmount;
      v.coll_taken = collTaken;
      v.debt_cleared = debtCleared;
      v.coll_taken_usd = collTaken * price;
      v.redemption_result_usd = debtCleared - collTaken * price;
      sp.say("redeem.what", { debt_cleared: "debt_change", coll_taken: "coll_change" });
      if (price > 0) {
        if (num(v.redemption_result_usd) >= 0.5) sp.say("redeem.result");
        else sp.say("redeem.result_no_fee");
      }
      const zombie = ctx.isZombieTrove;
      const rate = { rate_after: "rate_after" as const };
      if (!zombie) {
        if (ctx.isInBatch && ctx.batchManager) sp.say("redeem.why_batch", rate);
        else sp.say("redeem.why_owner", rate);
      }
      if (stateAfter.debt === 0) {
        if (zombie) {
          sp.say("redeem.zombie_zero");
          sp.say("redeem.zombie_zero_rate", { rate_after: "bold" });
          sp.say("redeem.zombie_zero_next");
        } else sp.say("redeem.zero");
      } else if (zombie) {
        sp.say("redeem.zombie_low", { debt_after: "bold" });
        sp.say("redeem.zombie_low_queue");
        sp.say("redeem.zombie_low_rate", rate);
        sp.say("redeem.zombie_low_next");
      }
      break;
    }
    // ── Delegation ──
    case "liquity2.delegation.join": {
      const mgr = ctx.batchUpdate?.interestBatchManager ?? ctx.batchManager;
      if (mgr) {
        v.manager = mgr;
        v.manager_name = getBatchManagerByAddress(mgr)?.name ?? null;
        sp.say("join.what");
      } else sp.say("join.what_plain");
      if (upfront > 0) {
        // The fee is charged on the debt with its accrual: that debt, then
        // the fee that brought it to the debt after.
        if (accrual && accrual.total > 0.01) {
          v.debt_accrued_before = stateAfter.debt - upfront;
          v.accrual_noun = accrualNoun(accrual);
          sp.say("join.debt_fee", { debt_accrued_before: "bold" });
        }
        sp.say("join.fee", { ...ECHO_FEE, debt_after: "bold" });
      } else if (stateAfter.debt > 0) {
        const moved = Math.abs(stateAfter.debt - stateBefore.debt) >= 0.01;
        const b = { debt_before: "bold", debt_after: "bold" } as const;
        if (!moved) sp.say("join.debt_same", b);
        else if (accrual && accrual.total > 0.01) sp.say("join.debt_accrued", b);
        else sp.say("join.debt_moved", b);
      }
      if (stateAfter.coll > 0) sp.say("join.coll", { coll_after: "bold" });
      if (stateAfter.annualInterestRate > 0) sp.say("join.rate", { rate_after: "rate_after" });
      crPairNow();
      break;
    }
    case "liquity2.delegation.leave": {
      const mgr = ctx.batchUpdate?.interestBatchManager;
      if (mgr) {
        v.former_manager = mgr;
        sp.say("leave.what");
      } else sp.say("leave.what_plain");
      if (accrual && accrual.split && accrual.fee > 0.01) sp.say("leave.fees");
      if (upfront > 0) sp.say("leave.fee", ECHO_FEE);
      if (stateAfter.debt > 0) sp.say("state.debt_now", { debt_after: "bold" });
      if (stateAfter.coll > 0 && price > 0) sp.say("leave.coll", { coll_after: "bold", coll_after_usd: "bold" });
      if (stateAfter.annualInterestRate !== stateBefore.annualInterestRate)
        sp.say("leave.rate", { rate_before: "bold", rate_after: "rate_after" });
      crPairNow();
      break;
    }
    case "liquity2.delegation.rate_update": {
      if (variant === "kept") sp.say("bru.kept", { rate_after: "rate_after" });
      else
        sp.say(variant === "raised" ? "bru.raised" : "bru.lowered", { rate_before: "bold", rate_after: "rate_after" });
      const move = batchRateDebtMove(ctx, previousEvent, currentEvent);
      if (move && Math.abs(move.total) >= 0.01) {
        v.debt_move = move.total;
        v.prev_date = move.since;
        sp.say("bru.move", { debt_move: "debt_change" });
        if (move.interest >= 0.005) {
          v.move_interest = move.interest;
          v.move_rate = move.rate;
          v.move_span = move.elapsed;
          sp.say("bru.interest", { move_rate: "bold" });
        }
        if (move.fee >= 0.005) {
          v.move_fee = move.fee;
          v.move_fee_rate = move.feeRate;
          sp.say("bru.mgmt", { move_fee_rate: "bold" });
        }
        if (move.upfront >= 0.005) {
          v.move_upfront = move.upfront;
          sp.say("bru.upfront");
        }
      }
      if (ctx.batchUpdate?.interestBatchManager) {
        v.manager_address = ctx.batchUpdate.interestBatchManager;
        sp.say("bru.setter");
      }
      if (stateAfter.debt > 0) sp.say("bru.debt");
      if (stateAfter.coll > 0 && price > 0) sp.say("bru.coll");
      if (stateAfter.collateralRatio > 0) {
        v.cr_after = stateAfter.collateralRatio;
        sp.say("bru.cr");
      }
      if (debtCp && Math.abs(debtCp.change) >= 0.01) {
        v.debt_move_abs = Math.abs(debtCp.change);
        v.debt_move_abs_sign = debtCp.change;
      }
      break;
    }
    // ── Open, close ──
    case "liquity2.open": {
      v.principal = stateAfter.debt - upfront;
      sp.say("open.what", { coll_after: "coll_change", principal: "bold" });
      if (upfront > 0) {
        sp.say("open.fee", ECHO_FEE);
        sp.say("open.debt_fee", { debt_after: "debt_change" });
      } else sp.say("open.debt", { debt_after: "debt_change" });
      sp.say("open.reserve");
      if (stateAfter.coll * price > 0) sp.say("open.value", { coll_after_usd: "bold", price_at_event: "bold" });
      v.cr_after = stateAfter.collateralRatio;
      sp.say("open.cr");
      if (safety?.liqPriceAfter != null && safety.price > 0 && 1 - safety.liqPriceAfter / safety.price > 0)
        sp.say("liq.after");
      sp.say("open.rate", { rate_after: "rate_after" });
      if (variant === "join_batch" && ctx.batchUpdate) {
        const bu = ctx.batchUpdate;
        const mgr = bu.interestBatchManager ?? ctx.batchManager;
        if (mgr) {
          v.manager = mgr;
          v.manager_name = getBatchManagerByAddress(mgr)?.name ?? null;
          v.batch_rate = bu.annualInterestRate;
          v.batch_fee_rate = bu.annualManagementFee;
          sp.say(bu.annualManagementFee > 0 ? "open.join" : "open.join_no_fee", { batch_rate: "bold" });
        } else sp.say("open.join_plain");
      }
      break;
    }
    case "liquity2.close": {
      v.debt_repaid = op ? Math.abs(op.debtChangeFromOperation) : stateBefore.debt;
      v.coll_retrieved = op ? Math.abs(op.collChangeFromOperation) : stateBefore.coll;
      if (variant === "repaid") sp.say("close.repaid", { debt_repaid: "debt_change" });
      else sp.say("close.zero");
      sp.say("close.coll", { coll_retrieved: "coll_change" });
      sp.say("close.reserve");
      if (variant === "repaid" && stateBefore.annualInterestRate > 0) sp.say("close.rate", { rate_before: "bold" });
      if (variant === "repaid" && stateBefore.collateralRatio > 0) {
        v.cr_before = stateBefore.collateralRatio;
        sp.say("close.cr");
      }
      sp.say("close.nft");
      sp.say("close.nothing");
      break;
    }
    // ── Liquidation ──
    case "liquity2.liquidation": {
      const liq = ctx.liquidation;
      if (!liq) {
        sp.say("liq.no_detail");
        break;
      }
      if (variant === "redistribution_gain") {
        const collGained = op!.collIncreaseFromRedist;
        const debtInherited = op!.debtIncreaseFromRedist;
        const usd = collGained * price;
        const net = usd - debtInherited;
        v.redist_coll = collGained;
        v.redist_debt = debtInherited;
        v.redist_coll_usd = usd;
        v.net_benefit = Math.abs(net);
        sp.say("liq.gain.what");
        sp.say(usd > 0 ? "liq.gain.received" : "liq.gain.received_unpriced", { redist_coll: "coll_change" });
        sp.say("liq.gain.inherited", { redist_debt: "debt_change" });
        sp.say(net >= 0 ? "liq.gain.net_pos" : "liq.gain.net_neg");
        sp.say("liq.gain.why");
        if (stateBefore.collateralRatio > 0 && stateAfter.collateralRatio > 0) {
          v.cr_before = stateBefore.collateralRatio;
          v.cr_after = stateAfter.collateralRatio;
          sp.say("liq.gain.cr");
        }
        sp.say("liq.gain.open");
        break;
      }
      const debtCleared = liq.debtOffsetBySP + liq.debtRedistributed;
      const collLiquidated = liq.collSentToSP + liq.collRedistributed + liq.collSurplus + liq.collGasCompensation;
      const collUsd = collLiquidated * liq.price;
      v.debt_cleared = debtCleared;
      v.coll_liquidated = collLiquidated;
      v.coll_liquidated_usd = collUsd;
      v.liquidation_price = liq.price;
      v.cr_at_liquidation =
        collUsd > 0 && debtCleared > 0 ? (collUsd / debtCleared) * 100 : stateBefore.collateralRatio;
      sp.say("liq.what");
      sp.say("liq.debt", { debt_cleared: "bold" });
      sp.say("liq.coll", { coll_liquidated: "bold", coll_liquidated_usd: "bold" });
      const claimable = liq.collSurplus > 0 && liq.debtRedistributed === 0;
      const surplusUsd = liq.collSurplus * liq.price;
      if (claimable) {
        v.coll_surplus = liq.collSurplus;
        v.coll_surplus_usd = surplusUsd;
        const e = { coll_surplus: "bold" as const };
        if (surplusClaimedAt === undefined) sp.say("liq.surplus", e);
        else if (surplusClaimedAt != null) {
          v.claimed_at = surplusClaimedAt;
          sp.say("liq.surplus_claimed", e);
        } else sp.say("liq.surplus_claimed_undated", e);
      }
      const equity = collUsd - debtCleared;
      const loss = equity > 0 ? equity - surplusUsd : 0;
      if (loss > 0) {
        v.est_loss = loss;
        sp.say("liq.loss");
      }
      if (liq.debtOffsetBySP > 0 && liq.debtRedistributed > 0) sp.say("liq.partial");
      // The payout legs.
      if (liq.collSentToSP > 0) {
        v.coll_to_sp = liq.collSentToSP;
        v.coll_to_sp_usd = liq.collSentToSP * liq.price;
        sp.say("liq.leg.sp");
      }
      if (liq.collGasCompensation > 0) {
        v.coll_gas_comp = liq.collGasCompensation;
        sp.say("liq.leg.gas_comp");
      }
      sp.say("liq.leg.gas_weth");
      if (debtCleared > 0 && liq.price > 0) {
        v.incentive_coll = (debtCleared * 0.05) / liq.price;
        v.incentive_usd = debtCleared * 0.05;
        sp.say("liq.leg.incentive");
      }
      sp.say("liq.leg.nft");
      if (liq.collSurplus > 0) {
        v.surplus_l1 = `${liq.collSurplus.toFixed(4)} ${collSym} ${surplusClaimedAt !== undefined ? L1_WORDS.claimed : L1_WORDS.claimable}${
          surplusClaimedAt != null ? ` ${formatDate(surplusClaimedAt)}` : ""
        }`;
      }
      break;
    }
    // ── The rest ──
    case "liquity2.apply_pending_debt": {
      const redistDebt = op?.debtIncreaseFromRedist ?? 0;
      const collGain = op?.collIncreaseFromRedist ?? 0;
      v.redist_debt = redistDebt;
      if (collGain > 0) {
        v.redist_coll = collGain;
        sp.say("apply.what_coll", { redist_debt: "debt_change", redist_coll: "coll_change" });
      } else sp.say("apply.what", { redist_debt: "debt_change" });
      if (ctx.batchUpdate) sp.say("apply.batch");
      sp.say("state.debt_now", { debt_after: "bold" });
      if (stateAfter.coll > 0)
        sp.say(price > 0 ? "apply.coll" : "apply.coll_unpriced", { coll_after: "bold", coll_after_usd: "bold" });
      sp.say("apply.rate", { rate_after: "rate_after" });
      crPairNow();
      break;
    }
    case "liquity2.transfer": {
      const tr = ctx.transfer;
      if (!tr) {
        sp.say("transfer.no_detail");
        break;
      }
      v.from_address = tr.fromAddress;
      v.to_address = tr.toAddress;
      if (tr.transferType === "mint") sp.say("transfer.mint");
      else if (tr.transferType === "burn") sp.say("transfer.burn");
      else {
        sp.say("transfer.move");
        if (stateAfter.debt > 0 || stateAfter.coll > 0) {
          v.cr_after = stateAfter.collateralRatio;
          const b = { debt_after: "bold", coll_after: "bold", rate_after: "bold", price_at_event: "bold" } as const;
          sp.say(price > 0 ? "transfer.state" : "transfer.state_unpriced", b);
        }
        sp.say("transfer.unchanged");
      }
      break;
    }
    default: {
      v.operation = ctx.operation;
      sp.say("fallback.what");
    }
  }

  // Same block: the header's "1 of 2" chip, said once.
  const g = ctx.blockGrouping;
  if (g?.isGrouped && g.sameBlockCount > 1) {
    v.block_events = g.sameBlockCount;
    v.block_position = `${g.sameBlockIndex} of ${g.sameBlockCount}`;
    sp.say("same_block", { block_position: "bold" });
  }

  // L1 extras the header prints on some rows.
  const redist = liquityRedistOnAdjust(ctx);
  if (redist) {
    const parts: string[] = [];
    if (redist.debt >= 0.01) parts.push(`${fmtHeaderMagnitude(redist.debt, debtSym)} ${debtSym}`);
    if (redist.coll > 1e-9) parts.push(`${fmtHeaderMagnitude(redist.coll, collSym)} ${collSym}`);
    v.redist_l1 = parts.join(` ${L1_WORDS.and} `);
  }

  const said = sp.out();
  const all = grouped(t, [...said.L4, ...said.list]);
  const L4 = all.slice(0, said.L4.length);
  const list = all.slice(said.L4.length);
  const paid = event.gas && event.gas.gasCostEth > 0 && !PASSIVE.has(ctx.operation) ? event.gas : null;
  const gas = paid
    ? ctx.noChangeRun
      ? fillText(FOOTER_WORDS.gas_run, { run_count: ctx.noChangeRun.count, gas: formatGasCost(paid) })
      : fillText(FOOTER_WORDS.gas, { gas: formatGasCost(paid) })
    : null;

  return {
    template: { id: t.id, variant, version: templateVersion(t) },
    title: t.title,
    L1: l1Line(t, values, env),
    L2: stateBefore && stateAfter ? liquityL2(input, accrual!) : null,
    L4,
    list,
    L5: { key: t.L5, content: l5For(t.L5, ctx, variant) },
    footer: {
      gas,
      gasCost: paid ? { eth: paid.gasCostEth, usd: paid.gasCostUsd } : null,
      gasRun: ctx.noChangeRun?.count ?? null,
      tx: event.txHash,
      block: event.blockNumber,
    },
    values,
  };
}

// ── L4's groups ──────────────────────────────────────────────────────────────

/** The sentences said, each with its group, when the explanation is grouped:
 *  two or more groups hold two or more bullets each (ui-jobs 282). A grouped
 *  explanation heads every group that has a bullet, one-bullet groups
 *  included. Otherwise the sentences come back as said, with no group. */
function grouped(t: EventTemplate, said: ProseSentence[]): ProseSentence[] {
  const groupOf = new Map<string, string>();
  for (const [g, ids] of Object.entries(t.groups)) for (const id of ids) groupOf.set(id, g);
  const sizes = new Map<string, number>();
  for (const s of said) {
    const g = groupOf.get(s.sentence_id);
    if (g == null) return said;
    sizes.set(g, (sizes.get(g) ?? 0) + 1);
  }
  const draw = [...sizes.values()].filter((n) => n >= 2).length >= 2;
  return draw ? said.map((s) => ({ ...s, group: groupOf.get(s.sentence_id) })) : said;
}

const GROUP_RANK = new Map(Object.keys(GROUP_WORDS).map((g, i) => [g, i]));

/** L4 as the explanation prints it: one run with no heading, or one run per
 *  group under its heading, in `group_words` order and the template's order
 *  within each. A liquidation's payout legs follow the bullets in the flat
 *  form and sit in their group in the grouped one. */
export function explanationRuns(p: LiquityEventProse): {
  group: string | null;
  heading: string | null;
  sentences: ProseSentence[];
}[] {
  const all = [...p.L4, ...p.list];
  if (!all.some((s) => s.group)) return all.length ? [{ group: null, heading: null, sentences: all }] : [];
  const runs: { group: string; heading: string; sentences: ProseSentence[] }[] = [];
  for (const s of [...all].sort((a, b) => GROUP_RANK.get(a.group!)! - GROUP_RANK.get(b.group!)!)) {
    const last = runs[runs.length - 1];
    if (last?.group === s.group) last.sentences.push(s);
    else runs.push({ group: s.group!, heading: GROUP_WORDS[s.group!], sentences: [s] });
  }
  return runs;
}

/** The replay's debt buckets that lower the debt. */
const DEBT_OUT = new Set<string>([LQ.repaid, LQ.debtRedeemed, LQ.debtLiquidated]);

/** Events a third party sends: its gas is not the owner's. */
const PASSIVE = new Set(["redeemCollateral", "liquidate", "applyPendingDebt"]);

// ── L2 ───────────────────────────────────────────────────────────────────────

/** The opened card's figures and their Markdown lines. */
export function liquityL2(input: LiquityProseInput, accrual: LiquityAccrual): LiquityL2 {
  const { ctx, previousEvent, currentPrice } = input;
  const { stateBefore, stateAfter, troveOperation: op, liquidation } = ctx;
  const isClose = ctx.operation === "closeTrove";
  const isLiquidation = ctx.operation === "liquidate";
  const isRedemption = REDEMPTION_OPS.has(ctx.operation);
  const rateOnly = ctx.operation === "setBatchManagerAnnualInterestRate";
  const price = ctx.collateralPrice ?? 0;
  const collSym = ctx.collateralType;
  const debtSym = ctx.assetType ?? "BOLD";

  // Before: the logged state, rebuilt where the event logs only the after.
  const rebuilt = liquityBeforeAmounts(ctx);
  const beforeDebt = rebuilt.debt;
  const beforeColl = rebuilt.coll;
  let beforeCr = stateBefore.collateralRatio;
  if (isLiquidation && liquidation) {
    const usd = beforeColl * liquidation.price;
    if (usd > 0 && beforeDebt > 0) beforeCr = (usd / beforeDebt) * 100;
  } else {
    // At this event's price (event-safety.ts), so the move is the event's.
    const s = liquityEventSafety(ctx, previousEvent);
    if (s.crBefore != null) beforeCr = s.crBefore;
    else if (isRedemption && op && beforeColl * price > 0 && beforeDebt > 0)
      beforeCr = ((beforeColl * price) / beforeDebt) * 100;
  }
  const collAfter = exactCollAfter(ctx);
  const afterUsd = collAfter * price;
  // The cells' befores are the balances the previous event recorded, as the
  // ledgers' closing lines state them (the replay's, where the page has it).
  const ledgerColl = input.ledger?.sides?.collateral;
  const collBefore = ledgerColl ? Math.max(0, ledgerColl.held - ledgerColl.amount) : beforeColl;
  const beforeUsd = isLiquidation && liquidation ? collBefore * liquidation.price : collBefore * price;
  let afterCr = stateAfter.collateralRatio;
  if (afterCr === 0 && price > 0 && stateAfter.debt > 0) afterCr = (afterUsd / stateAfter.debt) * 100;

  // The debt's: the accrual since the previous event is part of this event's
  // move, as the ledger counts it; with no replay, the previous event's after.
  const debtAfter = exactDebtAfter(ctx);
  const ledgerDebt = input.ledger?.sides?.debt;
  const prevCtx = previousEvent && isLiquityEvent(previousEvent) ? previousEvent.context.data : null;
  const recordedBefore = ledgerDebt
    ? Math.max(0, ledgerDebt.held - ledgerDebt.amount)
    : prevCtx?.stateAfter
      ? exactDebtAfter(prevCtx)
      : beforeDebt;

  const batchFee = batchFeeAfter(ctx, input.ledger);
  const rateAfter = stateAfter.annualInterestRate;
  const yearly = stateAfter.debt && rateAfter > 0 ? stateAfter.debt * (rateAfter / 100) : 0;
  const yearlyFee = stateAfter.debt && batchFee ? stateAfter.debt * (batchFee.fee / 100) : 0;

  let redemption: LiquityL2["redemption"] = null;
  if (ctx.operation === "redeemCollateral" && price > 0) {
    const debtChange = op
      ? op.debtChangeFromOperation + op.debtIncreaseFromRedist + op.debtIncreaseFromUpfrontFee
      : stateAfter.debt - stateBefore.debt;
    const collChange = op ? op.collChangeFromOperation + op.collIncreaseFromRedist : stateAfter.coll - stateBefore.coll;
    const cleared = Math.abs(debtChange);
    const lost = Math.abs(collChange);
    const plHistoric = cleared - lost * price;
    // The row's figures are the redemption log's, as the explanation's
    // "A redeemer exchanged …" sentence states them.
    const r = ctx.redemption;
    const collTaken = op ? Math.abs(op.collChangeFromOperation) : (r?.ETHSent ?? 0);
    const debtCleared = op ? Math.abs(op.debtChangeFromOperation) : (r?.actualBoldAmount ?? 0);
    const todaySide = r ? redemptionToday(price, currentPrice, debtCleared, collTaken) : null;
    redemption = {
      plHistoric,
      showPl: cleared > 0.01,
      claimable: ctx.isZombieTrove && stateAfter.debt === 0 && collAfter > 0 ? collAfter : null,
      today: null,
    };
    if (todaySide && currentPrice) {
      const price_today = currentPrice;
      const redemption_vs_today_usd = Math.abs(debtCleared - collTaken * currentPrice);
      redemption.today =
        todaySide === "lower"
          ? fillText(L2_WORDS.redemption_today_lower, { price_today, coll_symbol: collSym, redemption_vs_today_usd })
          : fillText(L2_WORDS.redemption_today_higher, { price_today, coll_symbol: collSym, redemption_vs_today_usd });
    }
  }

  const fig: LiquityL2 = {
    showGrid: beforeDebt > 0 || stateAfter.debt > 0 || isClose,
    rateOnly,
    isClose,
    isRedemption,
    isLiquidation,
    price,
    coll: { before: collBefore, after: collAfter, beforeUsd, afterUsd },
    debt: {
      before: recordedBefore,
      after: debtAfter,
      upfrontFee: op?.debtIncreaseFromUpfrontFee ?? 0,
      accrued: false,
      accrualMove: false,
      accrualShown: 0,
    },
    cr: { before: beforeCr, after: afterCr },
    rate: { before: stateBefore.annualInterestRate, after: rateAfter, yearly, yearlyFee },
    accrual,
    batchFee,
    batched: ctx.isInBatch,
    redemption,
    redeemer: isRedemption && ctx.redeemer ? ctx.redeemer : null,
    lines: [],
  };

  // The accrual is the whole move where nothing else moved the debt; a move
  // under half a cent still prints as one, as the ledger's row does.
  const cents = Math.round(fig.debt.after * 100) - Math.round(fig.debt.before * 100);
  const accrualCents = Math.round(accrual.total * 100);
  let shown = accrualCents;
  // As the ledger prints it: a cent or two of rounding between the recorded
  // balances and the event's rows goes to the accrual's row, never below 0.
  if (ledgerDebt && input.ledger?.legs.some((l) => l.accrual && l.symbol === ledgerDebt.symbol)) {
    let act = 0;
    for (const l of input.ledger.legs)
      if (!l.accrual && l.symbol === ledgerDebt.symbol && l.amount != null)
        act += (DEBT_OUT.has(l.bucket) ? -1 : 1) * Math.round(l.amount * 100);
    if (Math.abs(cents - act - accrualCents) <= 2 && cents - act >= 0) shown = cents - act;
  }
  fig.debt.accrualMove =
    !isClose && !isLiquidation && cents !== 0 && Math.abs(fig.debt.after - fig.debt.before - accrual.total) < 0.005;
  fig.debt.accrualShown = (fig.debt.accrualMove ? cents : shown) / 100;
  fig.debt.accrued = fig.debt.accrualShown !== 0;

  // ── The lines, as the cells print them ──
  const fc = (n: number) => (n === 0 ? "0" : ledgerFigure(n, input.collDecimals ?? null, fmtColl(n)));
  const fd = (n: number) => ledgerFigure(n, input.debtDecimals ?? null, fmtDebt(n));
  const lines: string[] = [];
  const arrow = (b: string | null, a: string) => (b != null ? `${b} → ${a}` : a);
  if (fig.showGrid && !rateOnly) {
    const cShowBefore = isClose
      ? fig.coll.before !== fig.coll.after
      : fig.coll.before !== 0 && fig.coll.before !== fig.coll.after;
    const cAfter = isClose ? L2_WORDS.closed : fc(fig.coll.after);
    let collLine = `${L2_WORDS.collateral}: ${arrow(cShowBefore ? fc(fig.coll.before) : null, cAfter)} ${collSym}`;
    const usdAfterShown = !isClose && fig.coll.after > 0 && afterUsd > 0 && usdShown(afterUsd);
    if (usdAfterShown) {
      const beforeKnown = cShowBefore && beforeUsd > 0 && usdShown(beforeUsd);
      collLine += ` (${arrow(beforeKnown ? fmtUsdWhole(beforeUsd) : null, fmtUsdWhole(afterUsd))})`;
    }
    lines.push(collLine);

    const d = fig.debt;
    const dShowBefore = isClose ? fd(d.before) !== fd(d.after) : d.before !== 0 && fd(d.before) !== fd(d.after);
    const dAfter = isClose ? L2_WORDS.closed : fd(d.after);
    const noun = accrualNoun(accrual);
    let debtLine: string;
    if (d.accrualMove) {
      const move = fillText(L2_WORDS.accrual_move, { accrued_total: d.accrualShown, accrual_noun: noun });
      debtLine = `${L2_WORDS.debt}: ${move} = ${dAfter} ${debtSym}`;
      if (usdShown(d.after)) debtLine += ` (${fmtUsdWhole(d.after)})`;
    } else {
      debtLine = `${L2_WORDS.debt}: ${arrow(dShowBefore ? fd(d.before) : null, dAfter)} ${debtSym}`;
      const debtUsd = !isClose && d.after > 0 && usdShown(d.after);
      if (debtUsd) debtLine += ` (${arrow(dShowBefore ? fmtUsdWhole(d.before) : null, fmtUsdWhole(d.after))})`;
      const sub: string[] = [];
      if (d.upfrontFee > 0) sub.push(fillText(L2_WORDS.fee, { upfront_fee: d.upfrontFee }));
      if (d.accrued) sub.push(fillText(L2_WORDS.accrual_since, { accrued_total: d.accrualShown, accrual_noun: noun }));
      if (sub.length) debtLine += ` (${sub.join(" · ")})`;
    }
    lines.push(debtLine);

    const crHasChange = fig.cr.before !== 0 && fig.cr.before !== fig.cr.after;
    const crAfter = isClose
      ? L2_WORDS.closed
      : stateAfter.debt === 0
        ? L2_WORDS.not_applicable
        : `${fig.cr.after.toFixed(2)}%`;
    lines.push(`${L2_WORDS.collateral_ratio}: ${arrow(crHasChange ? `${fig.cr.before.toFixed(2)}%` : null, crAfter)}`);
  }
  if (fig.showGrid) {
    const r = fig.rate;
    const hasChange = r.before > 0 && r.before !== r.after;
    const after = isClose ? L2_WORDS.closed : !(r.after > 0) ? L2_WORDS.not_applicable : `${fmtRateNum(r.after)}%`;
    let rateLine = `${L2_WORDS.interest_rate}: ${arrow(hasChange ? `${fmtRateNum(r.before)}%` : null, after)}`;
    if (!isClose && r.yearly > 0.01) {
      rateLine += ` · ${fillText(L2_WORDS.yearly_interest, { yearly_interest: fmtDebt(r.yearly), debt_symbol: debtSym })}`;
      if (fig.batched && !batchFee) rateLine += L2_WORDS.excl_fee;
    }
    if (!isClose && fig.batched && batchFee && r.yearlyFee > 0.01)
      rateLine += ` · ${fillText(L2_WORDS.yearly_fee, {
        batch_fee_rate: batchFee.fee,
        yearly_fee: fmtDebt(r.yearlyFee),
        debt_symbol: debtSym,
      })}`;
    lines.push(rateLine);
  }
  if (fig.redeemer) lines.push(`${L2_WORDS.redeemed_by} ${short(fig.redeemer)}`);
  if (price > 0) {
    if (redemption && (redemption.claimable != null || redemption.showPl)) {
      if (redemption.claimable != null)
        lines.push(`${redemption.claimable.toFixed(4)} ${collSym} ${L2_WORDS.claimable}`);
      if (redemption.showPl) {
        const pl = (n: number) => `${n >= 0 ? "+" : "−"}${fmtUsdWhole(Math.abs(n))}`;
        lines.push(`${L2_WORDS.pl} ${pl(redemption.plHistoric)}`);
      }
    }
    lines.push(`${fillText(L2_WORDS.price, { coll_symbol: collSym })}: ${fmtUsdWhole(price)}`);
    if (redemption?.today) lines.push(redemption.today);
  }
  fig.lines = lines;
  return fig;
}

// ── The context header ───────────────────────────────────────────────────────

export interface LiquityEventContext {
  troveId: string;
  owner: string | null;
  n: number;
  total: number;
  url: string;
  timestamp: number;
  chain?: string;
}

/** "1 Sep 2025 09:01" (UTC). */
export function utcStamp(ts: number): string {
  const d = new Date(ts * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${formatDate(d)} ${hh}:${mm}`;
}

export function contextHeader(p: LiquityEventProse, c: LiquityEventContext): string[] {
  const trove = `${c.troveId.slice(0, 6)}…${c.troveId.slice(-4)}`;
  const tx = `${p.footer.tx.slice(0, 10)}…`;
  return [
    fillText(CONTEXT_WORDS.title, { title: p.title, utc: utcStamp(c.timestamp) }),
    fillText(CONTEXT_WORDS.position, {
      chain: c.chain ?? CONTEXT_WORDS.chain_default,
      coll_symbol: String(p.values.coll_symbol),
      trove,
      owner: c.owner ? short(c.owner) : CONTEXT_WORDS.owner_unknown,
    }),
    fillText(CONTEXT_WORDS.event, { n: String(c.n), total: String(c.total), tx, url: c.url }),
    fillText(CONTEXT_WORDS.prices, { coll_symbol: String(p.values.coll_symbol) }),
  ];
}

/** The footer line's parts after "**Footer**". */
export function footerLine(p: LiquityEventProse): string {
  const parts: string[] = [];
  if (p.footer.gas) parts.push(p.footer.gas);
  parts.push(fillText(FOOTER_WORDS.tx, { tx: `${p.footer.tx.slice(0, 10)}…` }));
  parts.push(fillText(FOOTER_WORDS.block, { block: p.footer.block }));
  return parts.join(" · ");
}
