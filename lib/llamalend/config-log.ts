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
//
// Pure.

import { flowChange, pctWords, type FlowChange } from "@/lib/shared/flows-changes";

export type LlamalendConfigSet =
  | {
      block: number;
      timestamp: number;
      txHash: string;
      logIndex: number;
      kind: "discounts";
      loanDiscount: number;
      liquidationDiscount: number;
    }
  | { block: number; timestamp: number; txHash: string; logIndex: number; kind: "policy"; policy: string };

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
  before: number | string | null;
  after: number | string;
  /** The loan discount the same set left, for the liquidation marker's receipt. */
  loanDiscount?: number;
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

/** Each setting a set moved, oldest first. */
export function llamalendConfigSteps(log: LlamalendConfigLog | null | undefined): LlamalendConfigStep[] {
  if (!usable(log)) return [];
  const sets = [...log.sets].sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
  let liq: number | null = log.before.discounts?.liquidationDiscount ?? null;
  let loan: number | null = log.before.discounts?.loanDiscount ?? null;
  let policy: string | null = log.before.policy?.policy ?? null;
  const out: LlamalendConfigStep[] = [];
  const same = (a: number | null, b: number) => a != null && Math.abs(a - b) < 1e-12;
  for (const s of sets) {
    const at = { block: s.block, timestamp: s.timestamp, txHash: s.txHash, logIndex: s.logIndex };
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
      if (p !== policy) out.push({ ...at, line: "policy", before: policy, after: p });
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
  policy: "Rate policy",
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
    if (s.line === "policy") {
      from = typeof s.before === "string" ? shortAddress(s.before) : null;
      to = shortAddress(String(s.after));
      summary = `The ${market} market's monetary policy, replaced by ${String(s.after)} in its Controller's SetMonetaryPolicy log at block ${blockWords}${typeof s.before === "string" ? `; before it, ${s.before}` : ""}. The policy sets the rate the market's debt grows at; the health read at each event includes the debt it grew.`;
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
      prov: {
        kind: "chain",
        pclass: "emitted",
        summary,
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
