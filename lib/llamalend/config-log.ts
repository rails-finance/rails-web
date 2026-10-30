// A LlamaLend market's governance changes across a position's life (rails-ops
// reference/lifetime-price-chart.md, the LlamaLend rows and ruling 10;
// ui-jobs 328 step 8): its Controller's SetBorrowingDiscounts and
// SetMonetaryPolicy logs as rails-server keeps them
// (/api/at-block/llamalend/config-log, through
// /api/chain/llamalend/config-log), turned into the events row's
// protocol-change markers.
//
// RULES (the Controller's source, curve-stablecoin v1 contracts/Controller.vy).
// - The constructor sets both discounts and the policy without a log, so the
//   value before a market's first set is the route's `before`, read at the
//   block before it; each later set's is the set before it.
// - A set that moved the liquidation discount is a marker ("Liquidation
//   discount 6 % → 9.21 %"), one that moved the loan discount another, a new
//   policy a third. A set that moved neither discount is not marked.
// - The line does not step at a change. Health takes the liquidation discount
//   stored on the position (`liquidation_discounts[user]`), which the
//   Controller rewrites only when the owner borrows, moves collateral or
//   repays, in a transaction that logs the position's UserState: an event the
//   page reads. So a change reaches the line at the owner's next such event,
//   where that event's read (and its row's UserState) carries the new
//   discount, and the marker's receipt names that event. The loan discount
//   places a new band at the same moments and moves neither health nor a
//   band in place; a policy sets the rate the debt grows at, which each read
//   includes.
// - No setter logs the AMM's price oracle on any market, so none is marked.
// - A policy is named by the kind rails-server read from its getters at the
//   set block, and its main setting there ("Semi-log, 0.5–35 %", "Secondary,
//   target 85 %"); each side carries its address linked to Etherscan, and a
//   side whose kind was not told is the address alone. The setters on a policy
//   (SetRates, SetParameters) are not read: its settings are the ones it held
//   at the set.
//
// Pure.

import { logOrder } from "@/lib/shared/log-order";
import { flowChange, pctWords, type FlowChange, type FlowChangeLink } from "@/lib/shared/flows-changes";
import { explorerUrl } from "@/lib/shared/chains";
import type { Provenance } from "@/components/shared/provenance";

export type LlamalendConfigSet =
  | {
      block: number;
      timestamp: number;
      txHash: string;
      logIndex: number;
      /** The transaction's index in the block; `logIndex` is then the log's place in it (lib/shared/log-order.ts). */
      transactionIndex?: number;
      kind: "discounts";
      loanDiscount: number;
      liquidationDiscount: number;
    }
  | {
      block: number;
      timestamp: number;
      txHash: string;
      logIndex: number;
      /** The transaction's index in the block; `logIndex` is then the log's place in it (lib/shared/log-order.ts). */
      transactionIndex?: number;
      kind: "policy";
      policy: string;
      /** The replaced and the new policy, each read at this block. */
      policies?: { before: LlamalendPolicyInfo | null; after: LlamalendPolicyInfo | null };
    };

export type LlamalendPolicyKind =
  | "semilog"
  | "secondary"
  | "susde"
  | "ema"
  | "hyperbolic-dynamic"
  | "hyperbolic"
  | "aggregate"
  | "kinked";

/** A policy's kind (null where no getter told it) and its settings: rates a
 *  year as fractions, utilisations and ratios as fractions. */
export interface LlamalendPolicyInfo {
  address: string;
  kind: LlamalendPolicyKind | null;
  settings: Record<string, number>;
}

/** /api/chain/llamalend/config-log?controller= */
export interface LlamalendConfigLog {
  controller: string;
  chainId: number;
  fromBlock: number;
  /** The last stored block. */
  toBlock: number;
  before: {
    discounts: { block: number; loanDiscount: number; liquidationDiscount: number } | null;
    policy: { block: number; policy: string } | null;
  };
  sets: LlamalendConfigSet[];
}

export type LlamalendConfigLine = "liquidation" | "loan" | "policy";

/** One setting a set moved: the value before and after (a fraction, or the
 *  policy's address). */
export interface LlamalendConfigStep {
  line: LlamalendConfigLine;
  block: number;
  timestamp: number;
  txHash: string;
  logIndex: number;
  /** The transaction's index in the block; `logIndex` is then the log's place in it (lib/shared/log-order.ts). */
  transactionIndex?: number;
  before: number | string | null;
  after: number | string;
  /** The loan discount the same set left, for the liquidation marker's receipt. */
  loanDiscount?: number;
  /** A policy step's two policies as read at the set. */
  policies?: { before: LlamalendPolicyInfo | null; after: LlamalendPolicyInfo | null };
}

const usable = (log: LlamalendConfigLog | null | undefined): log is LlamalendConfigLog =>
  log != null && Array.isArray(log.sets) && log.before != null;

/** "6 %", "9.21 %", "3.5 %". */
export const llamalendPctWords = (fraction: number): string => {
  const p = Math.round(fraction * 1e4) / 100;
  return pctWords(p, Number.isInteger(p) ? 0 : Number.isInteger(p * 10) ? 1 : 2);
};

/** "0x1e7d…daae". */
const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const KIND_WORDS: Record<LlamalendPolicyKind, string> = {
  semilog: "Semi-log",
  secondary: "Secondary",
  susde: "sUSDe-tracking",
  ema: "Yield-tracking",
  "hyperbolic-dynamic": "Hyperbolic",
  hyperbolic: "Hyperbolic",
  aggregate: "Aggregate",
  kinked: "Kinked",
};

/** What each kind sets the rate from, for the receipt. */
const KIND_SENTENCE: Record<LlamalendPolicyKind, string> = {
  semilog: "a semi-log policy runs the rate from its minimum at 0 % utilisation to its maximum at 100 % on a log scale",
  secondary: "a secondary policy takes the crvUSD mint rate (its AMM's) and meets it at the target utilisation",
  susde: "an sUSDe-tracking policy takes sUSDe's yield and meets it at the target utilisation",
  ema: "a yield-tracking policy takes a vault's yield and meets it at the target utilisation",
  "hyperbolic-dynamic": "a hyperbolic policy takes a vault's yield and meets it at the target utilisation",
  hyperbolic: "a hyperbolic policy meets its target rate at the target utilisation",
  aggregate:
    "an aggregate policy sets the crvUSD mint rate from its base rate, moved by crvUSD's price and the PegKeepers' debt",
  kinked: "a kinked policy meets its base rate at the target utilisation",
};

/** "0.5–35 %", or "0 %" where both ends print the same. */
const rangeWords = (lo: number, hi: number) => {
  const a = llamalendPctWords(lo);
  const b = llamalendPctWords(hi);
  return a === b ? a : `${a.replace(/ %$/, "")}–${b}`;
};

/** "Semi-log, 0.5–35 %", "Secondary, target 85 %", "Aggregate, base 11.55 %"; null where the kind was not told. */
export function llamalendPolicyWords(p: LlamalendPolicyInfo | null | undefined): string | null {
  if (!p?.kind) return null;
  const s = p.settings ?? {};
  const name = KIND_WORDS[p.kind];
  if (p.kind === "semilog")
    return s.minRate != null && s.maxRate != null ? `${name}, ${rangeWords(s.minRate, s.maxRate)}` : name;
  if (p.kind === "aggregate") return s.rate0 != null ? `${name}, base ${llamalendPctWords(s.rate0)}` : name;
  return s.targetUtilization != null ? `${name}, target ${llamalendPctWords(s.targetUtilization)}` : name;
}

/** The settings beyond the main one, for the receipt ("0.5× at 0 %, 3× at 100 %, plus 4 %"). */
function policyDetailWords(p: LlamalendPolicyInfo): string | null {
  const s = p.settings ?? {};
  const x = (v: number) => `${Math.round(v * 100) / 100}×`;
  const parts: string[] = [];
  if (p.kind === "aggregate") {
    if (s.sigma != null) parts.push(`sigma ${llamalendPctWords(s.sigma)}`);
    if (s.targetDebtFraction != null) parts.push(`target PegKeeper debt ${llamalendPctWords(s.targetDebtFraction)}`);
    if (s.extraConst) parts.push(`plus ${llamalendPctWords(s.extraConst)}`);
  } else if (p.kind !== "semilog") {
    if (s.lowRatio != null) parts.push(`${x(s.lowRatio)} at 0 %`);
    if (s.highRatio != null) parts.push(`${x(s.highRatio)} at 100 %`);
    if (s.rateShift) parts.push(`plus ${llamalendPctWords(s.rateShift)}`);
  }
  return parts.length ? parts.join(", ") : null;
}

const policyLink = (address: string): FlowChangeLink => ({
  text: shortAddress(address),
  href: explorerUrl(1, "address", address),
});

/** Each setting a set moved, oldest first. */
export function llamalendConfigSteps(log: LlamalendConfigLog | null | undefined): LlamalendConfigStep[] {
  if (!usable(log)) return [];
  const sets = [...log.sets].sort(logOrder);
  let liq: number | null = log.before.discounts?.liquidationDiscount ?? null;
  let loan: number | null = log.before.discounts?.loanDiscount ?? null;
  let policy: string | null = log.before.policy?.policy ?? null;
  const out: LlamalendConfigStep[] = [];
  const same = (a: number | null, b: number) => a != null && Math.abs(a - b) < 1e-12;
  for (const s of sets) {
    const at = {
      block: s.block,
      timestamp: s.timestamp,
      txHash: s.txHash,
      logIndex: s.logIndex,
      transactionIndex: s.transactionIndex,
    };
    if (s.kind === "discounts") {
      if (!same(liq, s.liquidationDiscount))
        out.push({
          ...at,
          line: "liquidation",
          before: liq,
          after: s.liquidationDiscount,
          loanDiscount: s.loanDiscount,
        });
      if (!same(loan, s.loanDiscount)) out.push({ ...at, line: "loan", before: loan, after: s.loanDiscount });
      liq = s.liquidationDiscount;
      loan = s.loanDiscount;
    } else {
      const p = s.policy.toLowerCase();
      if (p !== policy) out.push({ ...at, line: "policy", before: policy, after: p, policies: s.policies });
      policy = p;
    }
  }
  return out;
}

/** A row as the receipts read it: its block, time and the discount its
 *  UserState stored (null where it states none). */
export interface LlamalendDiscountRow {
  block: number;
  ts: number;
  discount: number | null;
}

const dateWords = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The first of the position's rows after `block` whose UserState stored
 *  `discount`: where a change reached the position. */
export function llamalendDiscountTaken(
  rows: readonly LlamalendDiscountRow[],
  block: number,
  discount: number,
): LlamalendDiscountRow | null {
  return rows.find((r) => r.block > block && r.discount != null && Math.abs(r.discount - discount) < 1e-9) ?? null;
}

const NAME: Record<LlamalendConfigLine, string> = {
  liquidation: "Liquidation discount",
  loan: "Loan discount",
  policy: "Rate policy replaced",
};

/** Each change to the market's discounts or policy, as markers; a
 *  liquidation discount change's receipt names the event of this position's
 *  that took it, where one did. */
export function llamalendConfigChanges(
  log: LlamalendConfigLog | null | undefined,
  rows: readonly LlamalendDiscountRow[],
  market: string,
): FlowChange[] {
  if (!usable(log)) return [];
  const sorted = [...rows].sort((a, b) => a.block - b.block);
  return llamalendConfigSteps(log).map((s) => {
    const tx = s.txHash.toLowerCase();
    const blockWords = s.block.toLocaleString("en-US");
    let from: string | null;
    let to: string;
    let summary: string;
    let fromLink: FlowChangeLink | undefined;
    let toLink: FlowChangeLink | undefined;
    let inputs: Provenance["inputs"];
    if (s.line === "policy") {
      const before = typeof s.before === "string" ? s.before : null;
      const after = String(s.after);
      const info = (a: string, side: LlamalendPolicyInfo | null | undefined) =>
        side && side.address.toLowerCase() === a ? side : null;
      const was = before ? info(before, s.policies?.before) : null;
      const now = info(after, s.policies?.after);
      fromLink = before ? policyLink(before) : undefined;
      toLink = policyLink(after);
      from = before ? (llamalendPolicyWords(was) ?? shortAddress(before)) : null;
      to = llamalendPolicyWords(now) ?? shortAddress(after);
      const sideSentence = (label: string, a: string, p: LlamalendPolicyInfo | null) => {
        const words = llamalendPolicyWords(p);
        const detail = p ? policyDetailWords(p) : null;
        return words
          ? `${label} ${a}: ${words}${detail ? ` (${detail})` : ""}; ${KIND_SENTENCE[p!.kind!]}.`
          : `${label} ${a}, whose kind its getters did not tell.`;
      };
      summary = [
        `The ${market} market's monetary policy, replaced in its Controller's SetMonetaryPolicy log at block ${blockWords}.`,
        before ? sideSentence("Before it,", before, was) : null,
        sideSentence("The new policy,", after, now),
        `Each policy's kind is told by its getters and its settings read at the block of the set. The policy sets the rate the market's debt grows at; the health read at each event includes the debt it grew.`,
      ]
        .filter(Boolean)
        .join(" ");
      const leaf = (label: string, a: string, p: LlamalendPolicyInfo | null) => ({
        label,
        value: llamalendPolicyWords(p) ?? shortAddress(a),
        kind: "chain" as const,
        pclass: "state" as const,
        note: `read at block ${blockWords}`,
        contract: { name: p?.kind ? `${KIND_WORDS[p.kind]} policy` : "Policy", address: a },
      });
      inputs = [...(before ? [leaf("Policy replaced", before, was)] : []), leaf("New policy", after, now)];
    } else {
      const after = Number(s.after);
      from = typeof s.before === "number" ? llamalendPctWords(s.before) : null;
      to = llamalendPctWords(after);
      const set = `The ${market} market's ${NAME[s.line].toLowerCase()}, set to ${to} by its Controller's SetBorrowingDiscounts log at block ${blockWords}${from != null ? `. Before it, ${from}` : ""}.`;
      if (s.line === "loan") {
        summary = `${set} The loan discount sets how much a position may borrow against its collateral and where its band is placed; it reaches this position when its owner next borrows, moves collateral or repays, and moves neither its health nor a band in place.`;
      } else {
        const taken = llamalendDiscountTaken(sorted, s.block, after);
        const held = [...sorted].reverse().find((r) => r.block <= s.block && r.discount != null)?.discount ?? null;
        const tail = taken
          ? `this position took ${to} at its event at block ${taken.block.toLocaleString("en-US")} on ${dateWords(taken.ts)}.`
          : held != null
            ? `this position kept ${llamalendPctWords(held)} through the rest of this history.`
            : `no event of this position after it stored ${to}.`;
        summary = `${set} The Controller keeps on each position the discount in force at its owner's last borrow, collateral move or repay, and the position's health takes that one: ${tail}`;
      }
    }
    return flowChange({
      ts: s.timestamp,
      block: s.block,
      txHash: tx,
      name: NAME[s.line],
      from,
      to,
      ...(fromLink ? { fromLink } : {}),
      ...(toLink ? { toLink } : {}),
      prov: {
        kind: "chain",
        pclass: "emitted",
        summary,
        ...(inputs ? { inputs } : {}),
        contract: { name: `LlamaLend ${market} Controller`, address: log.controller },
        via: "rails-server at-block store · /api/at-block/llamalend/config-log",
        source: { block: s.block, txHash: tx },
      },
    });
  });
}

/** Whether a liquidation discount change falls between `first` and `last`
 *  (UTC day numbers, inclusive). */
export const llamalendLifeHasDiscountChange = (changes: readonly FlowChange[], first: number, last: number): boolean =>
  changes.some((c) => c.name === NAME.liquidation && c.day >= first && c.day <= last);
