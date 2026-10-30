// Dolomite's source for the Lifetime flows chart's health view (rails-ops
// reference/lifetime-price-chart.md, ruling 15; ui-jobs 328 steps 5 and 8; the view
// is lib/shared/flows-health.ts), in the card's terms: the margin ratio
// against the account's liquidation line.
//
// RULES.
// - A day's margin ratio is the core's adjusted supply ÷ adjusted borrow:
//   Σ supply × price ÷ (1 + premium) over Σ borrow × price × (1 + premium),
//   the flows replay's balances at the day's close (grown by each market's
//   index) at the day's price (each row's oracle price at its block, the
//   daily store's close between rows). With the account's risk override set
//   the core skips the premiums, so each counts 1.
// - The line is 1 + the account's margin ratio (the override where one is
//   set, the global ratio otherwise), the card's "Liquidation line".
// - The global ratio, the override and each market's premium are read at the
//   end of the block of each picked event (/api/chain/dolomite/risk-at-block;
//   the last event of each of the latest 60 days with events), held to the
//   next pick; the days before the first pick take its figures, dotted.
// - Each LogSetMarginRatio, and each LogSetMarginPremium on a market the
//   account used, that moved a value is a protocol-change marker
//   (/api/chain/dolomite/risk-log).
// - The card states no liquidation price, so the view draws no level on an
//   asset's price.
// - On an open position today's ratio and line are the card's.
//
// Pure.

import { logOrder } from "@/lib/shared/log-order";
import type { FactorRead, HealthSource } from "@/lib/shared/flows-health";
import { flowChange, pctWords, type FlowChange } from "@/lib/shared/flows-changes";
import { DOLOMITE_ADDRESSES } from "@/lib/dolomite/asset-catalog";

const DAY_S = 86_400;

/** The account's risk figures now, from the page's live read. */
export interface DolomiteRisk {
  /** The block the live read is at. */
  block: number;
  /** 1 + the account's margin ratio: the line. */
  required: number;
  /** The override is set: the core skips the premiums. */
  override: boolean;
  /** The card's margin ratio, null with no debt. */
  ratio: number | null;
}

/** /api/chain/dolomite/risk-at-block: the account's risk figures at the end
 *  of one block, fractions of 1. */
export interface DolomiteRiskAtAnswer {
  block: number;
  marginRatio: number;
  marginRatioForAccount: number;
  overrideMarginRatio: number | null;
  premiums: Record<string, number>;
}

export function isDolomiteRiskAt(b: unknown): b is DolomiteRiskAtAnswer {
  const a = b as DolomiteRiskAtAnswer | null;
  return (
    a != null &&
    typeof a.block === "number" &&
    typeof a.marginRatioForAccount === "number" &&
    a.marginRatioForAccount > 0 &&
    a.premiums != null &&
    typeof a.premiums === "object"
  );
}

/** One pick's answer as the view's read: the line 1 + the core's ratio for
 *  the account, each market's premium (skipped under the override). A
 *  market the core did not list at the block is left out: it cannot have
 *  been held there. */
export function dolomiteRiskRead(a: DolomiteRiskAtAnswer, timestamp: number): FactorRead {
  const line = 1 + a.marginRatioForAccount;
  const override = a.overrideMarginRatio != null;
  const lt: Record<string, number> = {};
  const dw: Record<string, number> = {};
  for (const [m, premium] of Object.entries(a.premiums)) {
    const p = override ? 0 : premium;
    lt[m] = 1 / ((1 + p) * line);
    if (p > 0) dw[m] = 1 + p;
  }
  return {
    day: Math.floor(timestamp / DAY_S),
    block: a.block,
    lt,
    ...(Object.keys(dw).length > 0 ? { dw } : {}),
    line,
  };
}

/** /api/chain/dolomite/risk-log */
export interface DolomiteRiskLog {
  fromBlock: number;
  toBlock: number;
  sets: {
    block: number;
    timestamp: number;
    txHash: string;
    logIndex: number;
    /** The transaction's index in the block; `logIndex` is then the log's place in it (lib/shared/log-order.ts). */
    transactionIndex?: number;
    /** Read from victoria's mainnet Sieve's table; a row without it is rails-server's store. */
    sieve?: true;
    kind: "margin-ratio" | "margin-premium";
    marketId: number | null;
    value: number;
  }[];
}

/** "17.65 %", "6.25 %", "0 %". */
const riskPct = (fraction: number) => {
  const p = Math.round(fraction * 1e4) / 100;
  return pctWords(p, Number.isInteger(p) ? 0 : 2);
};

/** Each set that moved the global margin ratio, or the premium of a market in
 *  `markets` (by id, with its symbol), as a marker. A market's first set is
 *  its listing and draws none. */
export function dolomiteRiskChanges(log: DolomiteRiskLog | null, markets: ReadonlyMap<string, string>): FlowChange[] {
  if (!log || !Array.isArray(log.sets)) return [];
  const last = new Map<string, number>();
  const out: FlowChange[] = [];
  for (const s of [...log.sets].sort(logOrder)) {
    const key = s.kind === "margin-ratio" ? "ratio" : `m${s.marketId}`;
    const before = last.get(key);
    last.set(key, s.value);
    if (before == null || riskPct(before) === riskPct(s.value)) continue;
    const symbol = s.marketId != null ? markets.get(String(s.marketId)) : undefined;
    if (s.kind === "margin-premium" && symbol == null) continue;
    const block = s.block.toLocaleString("en-US");
    const premium = s.kind === "margin-premium";
    out.push(
      flowChange({
        ts: s.timestamp,
        block: s.block,
        txHash: s.txHash,
        name: premium ? `${symbol} margin premium` : "Margin ratio",
        from: riskPct(before),
        to: riskPct(s.value),
        prov: {
          kind: "chain",
          pclass: "emitted",
          summary: premium
            ? `${symbol}'s margin premium (market ${s.marketId}), set to ${riskPct(s.value)} by the core's LogSetMarginPremium at block ${block}. Before it, ${riskPct(before)}. The premium multiplies the margin ratio for every account that supplies or borrows the market, except an account whose risk override is set, which skips the premiums.`
            : `The core's global margin ratio, set to ${riskPct(s.value)} by its LogSetMarginRatio at block ${block}. Before it, ${riskPct(before)}. Every account without a risk override is held to 1 + this ratio.`,
          contract: { name: "DolomiteMargin", address: DOLOMITE_ADDRESSES.MARGIN },
          via: `${s.sieve ? "the mainnet Sieve's capture of the core's LogSetMarginRatio and LogSetMarginPremium" : "eth_getLogs on the core for LogSetMarginRatio and LogSetMarginPremium"} · /api/chain/dolomite/risk-log`,
          source: { block: s.block, txHash: s.txHash },
        },
      }),
    );
  }
  return out;
}

/** Dolomite's source: the core's oracle, its margin ratio, premiums and
 *  override at each picked block. */
export const DOLOMITE_HEALTH_SOURCE: HealthSource = {
  oracle: "the Dolomite core's oracle",
  pool: "the Dolomite core",
  chain: 1,
  factors: ["margin ratio and premiums", "margin ratio and market premiums"],
  readAt: "read at the block of each day's last event",
  held: "the margin ratio, market premiums and any account override the core held after the event at block {block}",
  live: "the card's margin ratio now: adjusted supply ÷ adjusted borrow, the core's getAdjustedAccountValues",
  levels: {
    of: () => new Map(),
    formula: "none: the card states no liquidation price",
  },
  ratio: {
    label: "Margin ratio",
    liquidates: "below",
    digits: 2,
    formula: "Σ supply × price ÷ (1 + premium) ÷ Σ borrow × price × (1 + premium)",
    line: {
      formula: "below 1 + the account's margin ratio the account can be liquidated",
      summary:
        "Liquidation line — 1 + the account's margin ratio (the account's override where one is set) as the core held it after the day's last event, read at that block and held to the next. Below it Dolomite can liquidate the account.",
    },
    help: "on the same days: the account's supply over its borrow at the core's oracle price each day, each market adjusted by its margin premium. The red line is 1 + the account's margin ratio. The ratio, the premiums and any account override (which skips the premiums, and can come and go with the markets the account holds) are the ones in force at each event, read at the block of each day's last event and held to the next; a day before the earliest read (a life of more than 60 days with events) takes its figures and is drawn dotted. Below the line the account can be liquidated. The list in the tip picks it or a market's price.",
  },
};
