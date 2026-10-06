// Liquity V2 event prose: every string an event's card, its Copy for LLM block,
// the test exports and the template catalogue print, and nothing else. The
// logic that chooses a template, a variant and the sentences, and fills the
// placeholders, is lib/liquity/event-prose.ts; the catalogue
// (exports/liquity-v2/catalogue.md) is generated from this module by
// scripts/exports-liquity-v2.mjs, and the prose team's edits to the catalogue
// come back as edits here.
//
// A placeholder is `{name}`, printed at the rounding PLACEHOLDERS gives the
// name, or `{name|rounding}` to override it for one sentence. Every rounding is
// a function in event-prose.ts (`ROUNDING`), described for the catalogue in
// ROUNDINGS below.
//
// Pure data: no imports beyond types and the FAQ links, so the export script
// can load it with type stripping.

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { FAQ_URLS } from "@/components/transaction-timeline/explanation/shared/faqUrls";

export type Rounding =
  | "coll"
  | "coll_trim"
  | "debt"
  | "accrued"
  | "accrued_signed"
  | "amount"
  | "usd"
  | "usd_about"
  | "usd_cents"
  | "ratio"
  | "ratio_whole"
  | "ratio_pair"
  | "rate"
  | "rate_step"
  | "pct_whole"
  | "pct3"
  | "count"
  | "compact"
  | "date"
  | "day_short"
  | "span"
  | "manager"
  | "address"
  | "text";

/** What each rounding prints, for the catalogue. */
export const ROUNDINGS: Record<Rounding, string> = {
  coll: "collateral at the decimals the card's ledger prints (772.334); four places where the page has no ledger",
  coll_trim: "the same, trailing zeros dropped (125, 0.497)",
  debt: "whole units from 1,000 up (1,056,120), up to two places below (843.5)",
  accrued: "two places, grouped (2.20)",
  accrued_signed: "two places with a + or − sign (+258.54)",
  amount: "whole units from 1,000 up, four places from 1, more below 1 so the figure never reads 0",
  usd: "whole dollars ($4,490); under $0.01 reads < $0.01",
  usd_about: "from $10,000: 'about' and the nearest thousand (about $561,000); below, whole dollars ($2,222)",
  usd_cents: "dollars and cents ($2,221.83); under $0.01 reads < $0.01",
  ratio: "two places (328.34%)",
  ratio_whole: "whole percent (328%); two places where before and after would read alike",
  ratio_pair:
    "the collateral ratio and its LTV at two places (328.34% (LTV 30.46%)); the viewer's ratio setting bolds one",
  rate: "an annual rate at the protocol's two places (1.71%)",
  rate_step: "a rate change at two places, widened until before and after read apart (4.12% → 4.115%)",
  pct_whole: "whole percent of a fraction (0.665 → 66%), unsigned",
  pct3: "three places (0.512%)",
  count: "a whole number, grouped (23,267,256)",
  compact: "the header's compact form (125, 2.2K, 1.1M, 0.4974)",
  date: "a UTC day (1 Sep 2025)",
  day_short: "a short UTC day (Sep 1; with the year when not this year)",
  span: "hours under a day (5 hours), else days at one place (3.2 days)",
  manager: "the batch manager's name and short address (ARM (0xe507…b60a)), linked to the explorer",
  address: "a short address (0xf060…45f8), linked to the explorer",
  text: "a word or name as given",
};

/** Every placeholder: its default rounding and what it stands for. */
export const PLACEHOLDERS: Record<string, { rounding: Rounding; means: string }> = {
  coll_symbol: { rounding: "text", means: "the branch's collateral token (WETH, wstETH, rETH)" },
  debt_symbol: { rounding: "text", means: "the debt token (BOLD)" },
  label: { rounding: "text", means: "the header's event label" },
  coll_change: { rounding: "compact", means: "the collateral the event moved, as the header prints it" },
  debt_change: { rounding: "compact", means: "the debt the event moved, as the header prints it" },
  coll_label: { rounding: "text", means: "Add or Withdraw, on a row that moved both sides" },
  debt_label: { rounding: "text", means: "Borrow or Repay, on a row that moved both sides" },
  redist_l1: { rounding: "text", means: "a redistribution the touch applied, as the header prints it" },
  surplus_l1: { rounding: "text", means: "a liquidation's claimable surplus, as the header prints it" },
  debt_move_abs: { rounding: "compact", means: "the debt's move on a batch rate change, as the header prints it" },
  mcr: { rounding: "pct_whole", means: "the branch's minimum collateral ratio (110% for WETH)" },
  min_debt: { rounding: "count", means: "Liquity V2's minimum debt (2,000 BOLD)" },
  price_at_event: { rounding: "usd", means: "the collateral's oracle price at the event's block" },
  price_prev: { rounding: "usd", means: "the collateral's oracle price at the trove's previous event" },
  price_change: { rounding: "pct_whole", means: "the price's move since the previous event, as a fraction" },
  price_today: { rounding: "usd", means: "the collateral's oracle price today (redemption only)" },
  cr_before: { rounding: "ratio_pair", means: "collateral ratio before the event, percent" },
  cr_before_same_price: {
    rounding: "ratio_whole",
    means: "collateral ratio before the event at this event's price, percent",
  },
  cr_after: { rounding: "ratio_whole", means: "collateral ratio after the event, percent" },
  cr_at_liquidation: { rounding: "ratio_pair", means: "collateral ratio at the liquidation's price, percent" },
  liq_price_before: { rounding: "usd", means: "the price at which the trove would reach the minimum, before" },
  liq_price_after: { rounding: "usd", means: "the price at which the trove would reach the minimum, after" },
  liq_distance_before: { rounding: "pct_whole", means: "how far the price would have to fall to liquidation, before" },
  liq_distance_after: { rounding: "pct_whole", means: "how far the price would have to fall to liquidation, after" },
  added: { rounding: "coll_trim", means: "collateral the owner added" },
  added_usd: { rounding: "usd_about", means: "that collateral at the event's price" },
  withdrawn: { rounding: "coll_trim", means: "collateral the owner withdrew" },
  withdrawn_usd: { rounding: "usd_about", means: "that collateral at the event's price" },
  borrowed: { rounding: "debt", means: "debt the owner borrowed" },
  repaid: { rounding: "debt", means: "debt the owner repaid" },
  upfront_fee: { rounding: "debt", means: "the upfront fee added to the debt" },
  accrued_total: { rounding: "accrued", means: "interest and any management fee accrued since the previous event" },
  accrued_fee: { rounding: "accrued", means: "the management fee part of it" },
  debt_before: { rounding: "debt", means: "the trove's debt before the event" },
  debt_after: { rounding: "debt", means: "the trove's debt after the event" },
  coll_after: { rounding: "coll", means: "the trove's collateral after the event" },
  coll_after_usd: { rounding: "usd", means: "that collateral at the event's price" },
  rate_before: { rounding: "rate", means: "the annual interest rate before the event" },
  rate_after: { rounding: "rate", means: "the annual interest rate after the event" },
  rate_setter: { rounding: "text", means: "the batch manager's name, where a batch manager sets the rate" },
  manager: { rounding: "manager", means: "the batch manager" },
  former_manager: { rounding: "address", means: "the batch manager the trove left" },
  manager_address: { rounding: "address", means: "the batch manager" },
  batch_rate: { rounding: "rate", means: "the batch's rate on joining" },
  batch_fee_rate: { rounding: "rate", means: "the batch's annual management fee on joining" },
  redist_debt: { rounding: "debt", means: "debt a liquidated trove's redistribution passed to this one" },
  redist_coll: { rounding: "coll", means: "collateral a liquidated trove's redistribution passed to this one" },
  redist_coll_usd: { rounding: "usd_cents", means: "that collateral at the event's price" },
  debt_terms: { rounding: "text", means: "the debt's move, term by term (FRAGMENTS)" },
  net_benefit: {
    rounding: "usd_cents",
    means: "redistributed collateral at the price less the debt inherited, unsigned",
  },
  debt_cleared: { rounding: "debt", means: "debt the event cleared" },
  coll_taken: { rounding: "coll_trim", means: "collateral a redemption took" },
  coll_taken_usd: { rounding: "usd", means: "that collateral at the redemption's price" },
  redemption_result_usd: {
    rounding: "usd",
    means: "debt cleared less the collateral taken at the redemption's price: the fee the trove kept",
  },
  redemption_vs_today_usd: {
    rounding: "usd",
    means: "debt cleared less the collateral taken at today's price, unsigned",
  },
  coll_liquidated: { rounding: "coll", means: "collateral the liquidation took" },
  coll_liquidated_usd: { rounding: "usd", means: "that collateral at the liquidation's price" },
  coll_surplus: { rounding: "coll", means: "collateral left to the borrower above the debt and penalty" },
  coll_surplus_usd: { rounding: "usd_cents", means: "that surplus at the liquidation's price" },
  claimed_at: { rounding: "date", means: "when the borrower claimed the surplus" },
  est_loss: { rounding: "usd_cents", means: "the borrower's estimated loss after the surplus" },
  coll_to_sp: { rounding: "coll", means: "collateral sent to the Stability Pool" },
  coll_to_sp_usd: { rounding: "usd_cents", means: "that collateral at the liquidation's price" },
  coll_gas_comp: { rounding: "coll", means: "collateral paid to the liquidator as gas compensation" },
  incentive_coll: { rounding: "coll", means: "the 5% liquidation incentive, in collateral" },
  incentive_usd: { rounding: "usd_cents", means: "that incentive in dollars" },
  principal: { rounding: "debt", means: "debt borrowed on open, before the upfront fee" },
  debt_repaid: { rounding: "debt", means: "debt a close repaid" },
  coll_retrieved: { rounding: "coll", means: "collateral a close returned" },
  dust: { rounding: "amount", means: "the debt a no-change adjustment repaid" },
  run_count: { rounding: "count", means: "how many no-change adjustments the row stands for" },
  run_first: { rounding: "day_short", means: "the first of them" },
  run_last: { rounding: "day_short", means: "the last of them" },
  debt_move: { rounding: "accrued_signed", means: "the debt's move since the trove's previous event" },
  prev_date: { rounding: "date", means: "the trove's previous event" },
  move_interest: { rounding: "accrued", means: "interest over that span" },
  move_rate: { rounding: "rate", means: "the rate in force over that span" },
  move_span: { rounding: "span", means: "the time since the previous event" },
  move_fee: { rounding: "accrued", means: "management fee over that span" },
  move_fee_rate: { rounding: "rate", means: "the batch's management fee in force over that span" },
  move_upfront: { rounding: "accrued", means: "the upfront fee: the rest of the move" },
  block: { rounding: "count", means: "the event's block" },
  block_events: { rounding: "count", means: "how many of this trove's events the block holds" },
  block_position: { rounding: "text", means: "this event's place among them (1 of 2)" },
  from_address: { rounding: "address", means: "the NFT's previous holder" },
  to_address: { rounding: "address", means: "the NFT's new holder" },
  operation: { rounding: "text", means: "the contract operation's name" },
};

// ── L1: the header's words ───────────────────────────────────────────────────
// The header (components/protocol/liquity/liquity-event-header.tsx) prints
// these beside its figures; the L1 line of the Markdown joins the same words
// and figures with " · " in the order each template's L1 lists.

export const L1_WORDS = {
  open: "Open",
  close: "Close",
  liquidated: "Liquidated",
  liquidation: "Liquidation",
  add: "Add",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  adjust: "Adjust",
  no_change: "No change",
  no_change_run: "No change ×{run_count}",
  rate_up: "Increase interest rate",
  rate_down: "Decrease interest rate",
  rate_change: "Rate change",
  apply_debt: "Apply debt",
  redemption: "Redemption",
  redeemed: "Redeemed",
  delegate: "Delegate",
  leave_delegate: "Leave delegate",
  transfer: "Transfer",
  batch_rate: "Interest rate",
  supply: "Supply",
  cleared: "Cleared",
  took: "Took",
  debt: "Debt",
  from_liquidation: "From a liquidation",
  and: "and",
  claimable: "claimable",
  claimed: "claimable, claimed",
  zombie: "Zombie",
} as const;
export type L1WordKey = keyof typeof L1_WORDS;

/** One group of an L1 line: words and figures, printed with spaces between. A
 *  group whose figure the event lacks is left out. */
export type L1Part =
  | { word: L1WordKey }
  | { figure: string; symbol?: "coll_symbol" | "debt_symbol"; rounding?: Rounding; sign?: boolean };
export type L1Spec = L1Part[][];

// ── L2: the opened card's words ──────────────────────────────────────────────

export const L2_WORDS = {
  collateral: "Collateral",
  debt: "Debt",
  interest_rate: "Interest Rate",
  price: "{coll_symbol} price",
  /** The debt cell's sub-line. */
  incl: "incl. +{accrued_total} {accrual_noun}",
  interest: "interest",
  interest_and_fees: "interest and fees",
  fee: "{upfront_fee} fee",
  /** The rate cell's sub-lines. */
  yearly_interest: "{yearly_interest} {debt_symbol} / year interest",
  excl_fee: ", excl. management fee",
  yearly_fee: "+ {batch_fee_rate} management fee · {yearly_fee} {debt_symbol} / year",
  closed: "CLOSED",
  not_applicable: "N/A",
  redeemed_by: "Redeemed by:",
  pl: "P/L",
  or: "or",
  today: "today",
  claimable: "claimable",
} as const;

// ── Footer ───────────────────────────────────────────────────────────────────

export const FOOTER_WORDS = {
  gas: "Gas {gas}",
  gas_run: "Gas across {run_count} transactions {gas}",
  tx: "tx {tx}",
  block: "block {block}",
} as const;

// ── Copy for LLM: the context header ────────────────────────────────────────

export const CONTEXT_WORDS = {
  title: "# Liquity V2 · {title} · {utc} UTC",
  position: "Liquity V2 · {chain} · {coll_symbol} trove {trove} · owner {owner}",
  event: "Event #{n} of {total} · tx {tx} · {url}",
  prices:
    'Prices are {coll_symbol} oracle prices at the time of the event unless marked "today". Not financial advice.',
} as const;

// ── Fragments: parts of a sentence the generator joins ──────────────────────

export const FRAGMENTS: Record<string, string> = {
  "debt_term.repaid": "− {x} repaid",
  "debt_term.borrowed": "+ {x} borrowed",
  "debt_term.fee": "+ {x} fee",
  "debt_term.redist": "+ {x} from the liquidation",
  "debt_term.interest": "+ {x} interest",
  "debt_term.interest_and_fees": "+ {x} interest and fees",
};

// ── Sentences ────────────────────────────────────────────────────────────────

export interface SentenceTemplate {
  text: string;
  /** The condition under which the generator says it, for the catalogue. */
  when: string;
}

/** Sentences more than one template says. */
export const SHARED_SENTENCES: Record<string, SentenceTemplate> = {
  "market.fell": {
    text: "{coll_symbol} had fallen {price_change} since the previous event, from {price_prev} to {price_at_event}.",
    when: "the price fell since the trove's previous event by at least a quarter of the room the trove had above the minimum",
  },
  "market.rose": {
    text: "{coll_symbol} had risen {price_change} since the previous event, from {price_prev} to {price_at_event}.",
    when: "the price rose by the same measure",
  },
  "rate.moved": {
    text: "The annual interest rate moved from {rate_before} to {rate_after}.",
    when: "an adjustment also moved the rate",
  },
  "redist.debt": {
    text: "Liquidations on the {coll_symbol} branch passed this trove {redist_debt} {debt_symbol} of debt since its last change, applied at this touch.",
    when: "the touch applied a redistribution of debt only",
  },
  "redist.coll": {
    text: "Liquidations on the {coll_symbol} branch passed this trove {redist_coll} {coll_symbol} of collateral since its last change, applied at this touch.",
    when: "the touch applied a redistribution of collateral only",
  },
  "redist.both": {
    text: "Liquidations on the {coll_symbol} branch passed this trove {redist_debt} {debt_symbol} of debt and {redist_coll} {coll_symbol} of collateral since its last change, applied at this touch.",
    when: "the touch applied a redistribution of both",
  },
  "redist.balance": {
    text: "Debt: {debt_before} before {debt_terms} = {debt_after} {debt_symbol}.",
    when: "a redistribution of debt arrived with the touch",
  },
  "fee.borrow": {
    text: "Borrowing more charged a one-time fee of {upfront_fee} {debt_symbol}, equal to 7 days of average interest on the {coll_symbol} branch.",
    when: "the adjustment charged an upfront fee",
  },
  "accrual.interest": {
    text: "Interest of {accrued_total} {debt_symbol} accrued since the last operation.",
    when: "more than 0.01 accrued and the trove was not batched",
  },
  "accrual.batched": {
    text: "Interest and fees of {accrued_total} {debt_symbol} accrued since the last operation.",
    when: "more than 0.01 accrued on a batched trove",
  },
  "accrual.batched_fee": {
    text: "Interest and fees of {accrued_total} {debt_symbol} accrued since the last operation, including a {accrued_fee} {debt_symbol} management fee.",
    when: "the same, with the management fee told apart",
  },
  "state.debt_now": {
    text: "Its debt now stands at {debt_after} {debt_symbol}.",
    when: "the trove has debt after the event",
  },
  "state.cr": {
    text: "The collateral ratio is {cr_after|ratio_pair}.",
    when: "the trove has a ratio after the event",
  },
  "liq.after": {
    text: "Liquidation would now come at {coll_symbol} {liq_price_after}, {liq_distance_after} below that price.",
    when: "the liquidation price is below the event's price",
  },
  "liq.after_before": {
    text: "Liquidation would now come at {coll_symbol} {liq_price_after}, {liq_distance_after} below that price, against {liq_price_before} before.",
    when: "the same, where the liquidation price moved",
  },
  same_block: {
    text: "This trove had {block_events} events in block {block}; this is {block_position}, in the order the block recorded them.",
    when: "the block holds more than one of the trove's events",
  },
};

export interface EventTemplate {
  id: string;
  /** The context header's event label. */
  title: string;
  /** Operations and state that select it. */
  when: string;
  variants: Record<string, string>;
  L1: L1Spec;
  /** Its sentences, in the order the generator says them. */
  sentences: Record<string, SentenceTemplate>;
  /** Shared sentences it can say, placed among its sentences (by id). */
  order: string[];
  /** The liquidation's payout legs, said as a list under the bullets. */
  list?: string[];
  L5: L5Key;
}

const COLL = { symbol: "coll_symbol" } as const;
const DEBT = { symbol: "debt_symbol" } as const;
/** A liquidated neighbour's redistribution an adjustment applied. */
const REDIST: L1Part[] = [{ word: "from_liquidation" }, { figure: "redist_l1" }];

export const TEMPLATES: EventTemplate[] = [
  // ── Adjust family ──────────────────────────────────────────────────────────
  {
    id: "liquity2.adjust.add_coll",
    title: "Add collateral",
    when: "adjustTrove that added collateral and moved no debt",
    variants: { default: "always" },
    L1: [[{ figure: "label" }], [{ figure: "coll_change", ...COLL }], REDIST],
    sentences: {
      "add.what": {
        text: "The owner added {added} {coll_symbol} ({added_usd}) of collateral to the trove.",
        when: "always",
      },
      "add.safety": {
        text: "With more collateral behind the same debt, the trove is safer: its collateral ratio rose from {cr_before_same_price} to {cr_after}.",
        when: "the ratio moved",
      },
      "add.liq_distance": {
        text: "{coll_symbol} would now need to fall {liq_distance_after}, to about {liq_price_after}, before liquidation, compared with {liq_distance_before} before this deposit.",
        when: "the trove has debt before and after",
      },
      "add.rest": {
        text: "Its debt and interest rate are unchanged.",
        when: "no redistribution arrived and the rate held",
      },
    },
    order: [
      "add.what",
      "add.safety",
      "add.liq_distance",
      "market.fell",
      "market.rose",
      "redist.debt",
      "redist.coll",
      "redist.both",
      "redist.balance",
      "add.rest",
      "rate.moved",
      "same_block",
    ],
    L5: "adjust",
  },
  {
    id: "liquity2.adjust.withdraw_coll",
    title: "Withdraw collateral",
    when: "adjustTrove that withdrew collateral and moved no debt",
    variants: { default: "always" },
    L1: [[{ figure: "label" }], [{ figure: "coll_change", ...COLL }], REDIST],
    sentences: {
      "withdraw.what": {
        text: "The owner withdrew {withdrawn} {coll_symbol} ({withdrawn_usd}) of collateral from the trove.",
        when: "always",
      },
      "withdraw.safety": {
        text: "With less collateral behind the same debt, the trove is less safe: its collateral ratio fell from {cr_before_same_price} to {cr_after}.",
        when: "the ratio moved",
      },
      "withdraw.liq_distance": {
        text: "{coll_symbol} would now need to fall {liq_distance_after}, to about {liq_price_after}, before liquidation, compared with {liq_distance_before} before this withdrawal.",
        when: "the trove has debt before and after",
      },
      "withdraw.margin_far": {
        text: "The trove stays far above the {mcr} minimum, and its debt and interest rate are unchanged.",
        when: "the ratio after is at least twice the minimum, no redistribution arrived and the rate held",
      },
      "withdraw.margin": {
        text: "The trove stays above the {mcr} minimum, and its debt and interest rate are unchanged.",
        when: "the ratio after is under twice the minimum, no redistribution arrived and the rate held",
      },
    },
    order: [
      "withdraw.what",
      "withdraw.safety",
      "withdraw.liq_distance",
      "market.fell",
      "market.rose",
      "redist.debt",
      "redist.coll",
      "redist.both",
      "redist.balance",
      "withdraw.margin_far",
      "withdraw.margin",
      "rate.moved",
      "same_block",
    ],
    L5: "adjust",
  },
  {
    id: "liquity2.adjust.borrow",
    title: "Borrow",
    when: "adjustTrove that borrowed more and moved no collateral",
    variants: { default: "always" },
    L1: [[{ figure: "label" }], [{ figure: "debt_change", ...DEBT }], REDIST],
    sentences: {
      "borrow.what": {
        text: "The owner borrowed {borrowed} {debt_symbol} more against the trove.",
        when: "always",
      },
      "borrow.safety": {
        text: "With more debt against the same collateral, the trove is less safe: its collateral ratio fell from {cr_before_same_price} to {cr_after}.",
        when: "the ratio moved",
      },
      "borrow.liq_distance": {
        text: "{coll_symbol} would now need to fall {liq_distance_after}, to about {liq_price_after}, before liquidation, compared with {liq_distance_before} before this borrow.",
        when: "the trove has debt before and after",
      },
      "borrow.margin_far": {
        text: "The trove stays far above the {mcr} minimum, and its collateral and interest rate are unchanged.",
        when: "the ratio after is at least twice the minimum, no redistribution arrived and the rate held",
      },
      "borrow.margin": {
        text: "The trove stays above the {mcr} minimum, and its collateral and interest rate are unchanged.",
        when: "the ratio after is under twice the minimum, no redistribution arrived and the rate held",
      },
    },
    order: [
      "borrow.what",
      "borrow.safety",
      "borrow.liq_distance",
      "market.fell",
      "market.rose",
      "fee.borrow",
      "redist.debt",
      "redist.coll",
      "redist.both",
      "redist.balance",
      "borrow.margin_far",
      "borrow.margin",
      "rate.moved",
      "same_block",
    ],
    L5: "adjust",
  },
  {
    id: "liquity2.adjust.repay",
    title: "Repay",
    when: "adjustTrove that repaid debt and moved no collateral",
    variants: { default: "always" },
    L1: [[{ figure: "label" }], [{ figure: "debt_change", ...DEBT }], REDIST],
    sentences: {
      "repay.what": {
        text: "The owner repaid {repaid} {debt_symbol} of the trove’s debt.",
        when: "always",
      },
      "repay.safety": {
        text: "With less debt against the same collateral, the trove is safer: its collateral ratio rose from {cr_before_same_price} to {cr_after}.",
        when: "the ratio moved",
      },
      "repay.liq_distance": {
        text: "{coll_symbol} would now need to fall {liq_distance_after}, to about {liq_price_after}, before liquidation, compared with {liq_distance_before} before this repayment.",
        when: "the trove has debt before and after",
      },
      "repay.rest": {
        text: "Its collateral and interest rate are unchanged.",
        when: "no redistribution arrived and the rate held",
      },
    },
    order: [
      "repay.what",
      "repay.safety",
      "repay.liq_distance",
      "market.fell",
      "market.rose",
      "redist.debt",
      "redist.coll",
      "redist.both",
      "redist.balance",
      "repay.rest",
      "rate.moved",
      "same_block",
    ],
    L5: "adjust",
  },
  {
    id: "liquity2.adjust.combined",
    title: "Adjust trove",
    when: "adjustTrove that moved both collateral and debt",
    variants: {
      add_borrow: "added collateral and borrowed",
      add_repay: "added collateral and repaid",
      withdraw_borrow: "withdrew collateral and borrowed",
      withdraw_repay: "withdrew collateral and repaid",
    },
    L1: [
      [{ figure: "coll_label" }, { figure: "coll_change", ...COLL }],
      [{ figure: "debt_label" }, { figure: "debt_change", ...DEBT }],
      REDIST,
    ],
    sentences: {
      "combined.what.add_borrow": {
        text: "The owner added {added} {coll_symbol} ({added_usd}) of collateral and borrowed {borrowed} {debt_symbol} more.",
        when: "variant add_borrow",
      },
      "combined.what.add_repay": {
        text: "The owner added {added} {coll_symbol} ({added_usd}) of collateral and repaid {repaid} {debt_symbol} of debt.",
        when: "variant add_repay",
      },
      "combined.what.withdraw_borrow": {
        text: "The owner withdrew {withdrawn} {coll_symbol} ({withdrawn_usd}) of collateral and borrowed {borrowed} {debt_symbol} more.",
        when: "variant withdraw_borrow",
      },
      "combined.what.withdraw_repay": {
        text: "The owner withdrew {withdrawn} {coll_symbol} ({withdrawn_usd}) of collateral and repaid {repaid} {debt_symbol} of debt.",
        when: "variant withdraw_repay",
      },
      "combined.safety_rose": {
        text: "Together, these changes raised the collateral ratio from {cr_before_same_price} to {cr_after}.",
        when: "the ratio rose",
      },
      "combined.safety_fell": {
        text: "Together, these changes lowered the collateral ratio from {cr_before_same_price} to {cr_after}.",
        when: "the ratio fell",
      },
      "combined.liq_distance": {
        text: "{coll_symbol} would now need to fall {liq_distance_after}, to about {liq_price_after}, before liquidation, compared with {liq_distance_before} before this adjustment.",
        when: "the trove has debt before and after",
      },
      "combined.rate": {
        text: "Its interest rate is unchanged.",
        when: "the rate held",
      },
    },
    order: [
      "combined.what.add_borrow",
      "combined.what.add_repay",
      "combined.what.withdraw_borrow",
      "combined.what.withdraw_repay",
      "combined.safety_rose",
      "combined.safety_fell",
      "combined.liq_distance",
      "market.fell",
      "market.rose",
      "fee.borrow",
      "redist.debt",
      "redist.coll",
      "redist.both",
      "redist.balance",
      "combined.rate",
      "rate.moved",
      "same_block",
    ],
    L5: "adjust",
  },
  {
    id: "liquity2.adjust.no_change",
    title: "No change",
    when: "adjustTrove that moved neither side past display precision, or the server's run of them",
    variants: { single: "one touch", run: "a run of touches the server collapsed into one row" },
    L1: [[{ figure: "label" }]],
    sentences: {
      "nochange.run": {
        text: "This row stands in for {run_count} adjustments between {run_first} and {run_last}, every one of which left the trove unchanged.",
        when: "variant run",
      },
      "nochange.run_repaid": {
        text: "Together they repaid {dust} {debt_symbol}, the interest that accrued between touches.",
        when: "variant run, debt repaid",
      },
      "nochange.dust": {
        text: "This adjustment moved no collateral and repaid only {dust} {debt_symbol}, the interest that had accrued since the trove was last touched.",
        when: "variant single, debt repaid",
      },
      "nochange.none": {
        text: "This adjustment moved no collateral and no debt.",
        when: "variant single, nothing repaid",
      },
      "nochange.at_min": {
        text: "The debt sits at Liquity V2’s {min_debt} {debt_symbol} minimum.",
        when: "the debt after is the minimum",
      },
      "nochange.capped_run": {
        text: "A repayment stops at that floor unless it closes the trove, so every larger attempt in this stretch was capped at the interest accrued since the last touch.",
        when: "variant run at the minimum",
      },
      "nochange.capped": {
        text: "A repayment stops at that floor unless it closes the trove, so any larger attempt was capped at the interest accrued since the last touch.",
        when: "variant single at the minimum",
      },
      "nochange.bot": {
        text: "Repeated no-change adjustments like this are typically sent by an automated manager retrying an operation the protocol clamps to nothing.",
        when: "always",
      },
      "nochange.gas": {
        text: "Each attempt costs the sender only gas.",
        when: "always",
      },
    },
    order: [
      "nochange.run",
      "nochange.run_repaid",
      "nochange.dust",
      "nochange.none",
      "nochange.at_min",
      "nochange.capped_run",
      "nochange.capped",
      "nochange.bot",
      "nochange.gas",
      "same_block",
    ],
    L5: "adjust",
  },
  {
    id: "liquity2.adjust.rate",
    title: "Interest rate change",
    when: "adjustTroveInterestRate: the owner set a new rate",
    variants: { raised: "the rate rose", lowered: "the rate fell" },
    L1: [[{ figure: "label" }], [{ figure: "rate_after", rounding: "rate" }]],
    sentences: {
      "rate.raised": {
        text: "This adjustment raised the trove’s interest rate from {rate_before} to {rate_after} APR.",
        when: "variant raised",
      },
      "rate.lowered": {
        text: "This adjustment lowered the trove’s interest rate from {rate_before} to {rate_after} APR.",
        when: "variant lowered",
      },
      "rate.fee": {
        text: "An upfront fee of {upfront_fee} {debt_symbol} was added to the debt, because the rate changed within 7 days of the trove’s previous rate change; the fee equals 7 days of average interest.",
        when: "the change charged an upfront fee",
      },
      "rate.coll": {
        text: "The collateral remains {coll_after} {coll_symbol} ({coll_after_usd}).",
        when: "the trove holds priced collateral",
      },
    },
    order: [
      "rate.raised",
      "rate.lowered",
      "accrual.interest",
      "accrual.batched",
      "accrual.batched_fee",
      "rate.fee",
      "state.debt_now",
      "rate.coll",
      "state.cr",
      "same_block",
    ],
    L5: "interest_rate",
  },
  // ── Redemption ─────────────────────────────────────────────────────────────
  {
    id: "liquity2.redemption",
    title: "Redemption",
    when: "redeemCollateral, or a zombie trove's adjustZombieTrove / adjustUnredeemableZombieTrove",
    variants: {
      price_lower_now: "the collateral's price today is below its price at the redemption",
      price_higher_now:
        "the price today is far enough above it that the redeemed collateral would now be worth more than the debt it paid off",
      at_event: "no price today, or one that reads the same, or a rise smaller than the fee",
      no_detail: "the event carries no redemption log",
    },
    L1: [
      [{ figure: "label" }],
      [{ word: "cleared" }, { figure: "debt_change", ...DEBT }],
      [{ word: "took" }, { figure: "coll_change", ...COLL }],
    ],
    sentences: {
      "redeem.no_detail": {
        text: "The {coll_symbol} trove was redeemed.",
        when: "variant no_detail",
      },
      "redeem.what": {
        text: "A redeemer exchanged {debt_cleared} {debt_symbol} for this trove’s {coll_symbol}, clearing that much debt and taking {coll_taken} {coll_symbol} ({coll_taken_usd}) of collateral.",
        when: "always",
      },
      "redeem.result": {
        text: "In effect, some collateral was sold at {price_at_event} to repay debt, and the trove kept a {redemption_result_usd} fee, so the owner came out slightly ahead.",
        when: "the fee the trove kept reads at least $1",
      },
      "redeem.result_no_fee": {
        text: "In effect, some collateral was sold at {price_at_event} to repay the same amount of debt.",
        when: "the fee reads under $1",
      },
      "redeem.today_lower": {
        text: "{coll_symbol} has since fallen to {price_today} today, so the redeemed {coll_symbol} would now be worth {redemption_vs_today_usd} less than the debt it paid off.",
        when: "variant price_lower_now",
      },
      "redeem.today_higher": {
        text: "{coll_symbol} has since risen to {price_today} today, so if the trove had kept the redeemed {coll_symbol}, it would now be worth {redemption_vs_today_usd} more than the debt it paid off.",
        when: "variant price_higher_now",
      },
      "redeem.why_batch": {
        text: "It was redeemed because its {rate_after} rate, set by batch manager {rate_setter}, was among the lowest in the {coll_symbol} branch.",
        when: "not a zombie, the trove is batched",
      },
      "redeem.why_owner": {
        text: "It was redeemed because its {rate_after} rate was among the lowest in the {coll_symbol} branch.",
        when: "not a zombie, the owner sets the rate",
      },
      "redeem.zero": {
        text: "The trove now holds 0 {debt_symbol} of debt.",
        when: "the redemption cleared all the debt, not a zombie",
      },
      "redeem.zombie_zero": {
        text: "The trove now holds 0 {debt_symbol} of debt and remains open with collateral only, a zero-debt zombie trove.",
        when: "a zombie with no debt left",
      },
      "redeem.zombie_zero_rate": {
        text: "With no debt, interest accrual has stopped and the {rate_after} rate is inactive.",
        when: "a zombie with no debt left",
      },
      "redeem.zombie_zero_next": {
        text: "It can be closed by withdrawing the remaining collateral, or re-activated by borrowing {min_debt} {debt_symbol} or more.",
        when: "a zombie with no debt left",
      },
      "redeem.zombie_low": {
        text: "The trove now holds {debt_after} {debt_symbol} of debt, a low-debt zombie trove below the {min_debt} {debt_symbol} minimum.",
        when: "a zombie with debt left",
      },
      "redeem.zombie_low_queue": {
        text: "It is removed from the normal redemption order and may be prioritised in later redemptions to clear the below-minimum debt.",
        when: "a zombie with debt left",
      },
      "redeem.zombie_low_rate": {
        text: "Interest keeps accruing at {rate_after}; if the debt later rises back above {min_debt} {debt_symbol}, the trove returns to normal behaviour.",
        when: "a zombie with debt left",
      },
      "redeem.zombie_low_next": {
        text: "It can be resolved by repaying the remaining debt and withdrawing collateral to close it, or by borrowing more to bring the debt above {min_debt} {debt_symbol}.",
        when: "a zombie with debt left",
      },
    },
    order: [
      "redeem.no_detail",
      "redeem.what",
      "redeem.result",
      "redeem.result_no_fee",
      "redeem.today_lower",
      "redeem.today_higher",
      "redeem.why_batch",
      "redeem.why_owner",
      "redeem.zero",
      "redeem.zombie_zero",
      "redeem.zombie_zero_rate",
      "redeem.zombie_zero_next",
      "redeem.zombie_low",
      "redeem.zombie_low_queue",
      "redeem.zombie_low_rate",
      "redeem.zombie_low_next",
      "same_block",
    ],
    L5: "redemption",
  },
  // ── Delegation ─────────────────────────────────────────────────────────────
  {
    id: "liquity2.delegation.join",
    title: "Join batch manager",
    when: "setInterestBatchManager",
    variants: { default: "always" },
    L1: [[{ figure: "label" }], [{ figure: "rate_after", rounding: "rate" }], [{ figure: "rate_setter" }]],
    sentences: {
      "join.what": {
        text: "This trove delegated its interest-rate management to {manager}.",
        when: "the batch manager is known",
      },
      "join.what_plain": {
        text: "This trove delegated its interest-rate management.",
        when: "the batch manager is not known",
      },
      "join.debt_accrued": {
        text: "Its debt updated from {debt_before} {debt_symbol} to {debt_after} {debt_symbol}, reflecting accrued interest.",
        when: "the debt moved and interest accrued",
      },
      "join.debt_moved": {
        text: "Its debt updated from {debt_before} {debt_symbol} to {debt_after} {debt_symbol}.",
        when: "the debt moved, nothing accrued",
      },
      "join.debt_same": {
        text: "Its debt is unchanged at {debt_after} {debt_symbol}.",
        when: "the debt held",
      },
      "join.fee": {
        text: "An upfront fee of {upfront_fee} {debt_symbol} was added to the debt: joining a batch charges the upfront fee, 7 days of interest at the branch’s average rate.",
        when: "joining charged an upfront fee",
      },
      "join.coll": {
        text: "The collateral remains {coll_after} {coll_symbol}.",
        when: "the trove holds collateral",
      },
      "join.rate": {
        text: "The trove now accrues at a delegated rate of {rate_after} APR.",
        when: "the rate after is known",
      },
    },
    order: [
      "join.what",
      "join.what_plain",
      "join.debt_accrued",
      "join.debt_moved",
      "join.debt_same",
      "join.fee",
      "join.coll",
      "join.rate",
      "state.cr",
      "same_block",
    ],
    L5: "delegation",
  },
  {
    id: "liquity2.delegation.leave",
    title: "Leave batch manager",
    when: "removeFromBatch",
    variants: { default: "always" },
    L1: [[{ figure: "label" }], [{ figure: "rate_after", rounding: "rate" }]],
    sentences: {
      "leave.what": {
        text: "This trove left its batch manager and returned to managing its own interest rate, formerly delegated to {former_manager}.",
        when: "the batch manager is known",
      },
      "leave.what_plain": {
        text: "This trove left its batch manager and returned to managing its own interest rate.",
        when: "the batch manager is not known",
      },
      "leave.fees": {
        text: "About {accrued_fee} {debt_symbol} of batch management fees had accrued.",
        when: "more than 0.01 of management fee accrued since the previous event",
      },
      "leave.fee": {
        text: "An upfront fee of {upfront_fee} {debt_symbol} was added to the debt, because leaving a delegate within 7 days of the trove’s previous rate change counts as a rate change; the fee equals 7 days of average interest.",
        when: "leaving charged an upfront fee",
      },
      "leave.coll": {
        text: "The collateral is {coll_after} {coll_symbol} ({coll_after_usd}).",
        when: "the trove holds priced collateral",
      },
      "leave.rate": {
        text: "The rate moved from {rate_before} to a self-set {rate_after}.",
        when: "the rate moved",
      },
    },
    order: [
      "leave.what",
      "leave.what_plain",
      "leave.fees",
      "leave.fee",
      "state.debt_now",
      "leave.coll",
      "leave.rate",
      "state.cr",
      "same_block",
    ],
    L5: "delegation",
  },
  {
    id: "liquity2.delegation.rate_update",
    title: "Batch manager rate change",
    when: "setBatchManagerAnnualInterestRate: the trove's batch manager set the batch's rate",
    variants: { raised: "the rate rose", lowered: "the rate fell", kept: "the rate held" },
    L1: [
      [{ figure: "label" }],
      [{ figure: "rate_after", rounding: "rate" }],
      [{ figure: "rate_setter" }],
      [{ word: "debt" }, { figure: "debt_move_abs", sign: true, ...DEBT }],
    ],
    sentences: {
      "bru.raised": {
        text: "The batch manager raised the delegated interest rate from {rate_before|rate_step} to {rate_after|rate_step} APR.",
        when: "variant raised",
      },
      "bru.lowered": {
        text: "The batch manager lowered the delegated interest rate from {rate_before|rate_step} to {rate_after|rate_step} APR.",
        when: "variant lowered",
      },
      "bru.kept": {
        text: "The batch manager kept the delegated interest rate at {rate_after} APR.",
        when: "variant kept",
      },
      "bru.move": {
        text: "Debt {debt_move} {debt_symbol} since {prev_date}, the trove’s previous event.",
        when: "the debt moved by 0.01 or more and the previous event and batch fee are known",
      },
      "bru.interest": {
        text: "Interest {move_interest} {debt_symbol} at {move_rate} over {move_span}.",
        when: "interest of 0.005 or more",
      },
      "bru.mgmt": {
        text: "Management fee {move_fee} {debt_symbol} at the batch’s {move_fee_rate} a year.",
        when: "management fee of 0.005 or more",
      },
      "bru.upfront": {
        text: "Upfront fee {move_upfront} {debt_symbol}: the manager changed the rate again within 7 days.",
        when: "the change fell inside the 7-day cooldown and left a remainder",
      },
      "bru.setter": {
        text: "The rate is set by the delegate {manager_address}.",
        when: "the batch manager is known",
      },
      "bru.debt": {
        text: "The trove’s debt now stands at {debt_after} {debt_symbol}.",
        when: "the trove has debt",
      },
      "bru.coll": {
        text: "Its collateral is {coll_after} {coll_symbol} ({coll_after_usd|usd_cents}).",
        when: "the trove holds priced collateral",
      },
      "bru.cr": {
        text: "The collateral ratio is {cr_after|ratio}.",
        when: "the trove has a ratio",
      },
    },
    order: [
      "bru.raised",
      "bru.lowered",
      "bru.kept",
      "bru.move",
      "bru.interest",
      "bru.mgmt",
      "bru.upfront",
      "bru.setter",
      "bru.debt",
      "bru.coll",
      "bru.cr",
      "same_block",
    ],
    L5: "delegation",
  },
  // ── Open, close ────────────────────────────────────────────────────────────
  {
    id: "liquity2.open",
    title: "Open trove",
    when: "openTrove or openTroveAndJoinBatch",
    variants: { self: "the owner sets the rate", join_batch: "opened straight into a batch" },
    L1: [
      [{ figure: "label" }],
      [{ word: "supply" }, { figure: "coll_change", ...COLL }],
      [{ word: "borrow" }, { figure: "debt_change", ...DEBT }],
      [{ figure: "rate_after", rounding: "rate" }],
    ],
    sentences: {
      "open.what": {
        text: "This trove opened, depositing {coll_after} {coll_symbol} as collateral and borrowing {principal} {debt_symbol} against it.",
        when: "always",
      },
      "open.fee": {
        text: "A one-time borrowing fee of {upfront_fee} {debt_symbol} was added to the debt, equivalent to 7 days of average interest.",
        when: "opening charged an upfront fee",
      },
      "open.debt_fee": {
        text: "Its total initial debt stands at {debt_after} {debt_symbol}, including that fee.",
        when: "opening charged an upfront fee",
      },
      "open.debt": {
        text: "Its total initial debt stands at {debt_after} {debt_symbol}.",
        when: "no upfront fee",
      },
      "open.reserve": {
        text: "A 0.0375 ETH liquidation reserve is set aside on open and returned when the trove closes.",
        when: "always",
      },
      "open.value": {
        text: "At the price at the time, that collateral is worth {coll_after_usd} ({coll_symbol} at {price_at_event}).",
        when: "the event carries a price",
      },
      "open.cr": {
        text: "The trove opened at a {cr_after|ratio_pair} collateral ratio.",
        when: "always",
      },
      "open.rate": {
        text: "It accrues interest at {rate_after} a year, added to the debt as it accrues.",
        when: "always",
      },
      "open.join": {
        text: "The trove joined a batch manager on open, delegating its rate to {manager} at {batch_rate} APR, with a {batch_fee_rate} management fee.",
        when: "variant join_batch, manager and fee known",
      },
      "open.join_no_fee": {
        text: "The trove joined a batch manager on open, delegating its rate to {manager} at {batch_rate} APR.",
        when: "variant join_batch, no management fee",
      },
      "open.join_plain": {
        text: "The trove joined a batch manager on open.",
        when: "variant join_batch, manager not known",
      },
    },
    order: [
      "open.what",
      "open.fee",
      "open.debt_fee",
      "open.debt",
      "open.reserve",
      "open.value",
      "open.cr",
      "liq.after",
      "open.rate",
      "open.join",
      "open.join_no_fee",
      "open.join_plain",
      "same_block",
    ],
    L5: "open",
  },
  {
    id: "liquity2.close",
    title: "Close trove",
    when: "closeTrove",
    variants: { repaid: "the close repaid debt", zero_debt: "a redemption had already cleared the debt" },
    L1: [[{ figure: "label" }], [{ figure: "debt_change", ...DEBT }], [{ figure: "coll_change", ...COLL }]],
    sentences: {
      "close.repaid": {
        text: "This transaction closed the trove, repaying its {debt_repaid} {debt_symbol} of debt in full.",
        when: "variant repaid",
      },
      "close.zero": {
        text: "This transaction closed the trove; its debt was already zero, so nothing was repaid.",
        when: "variant zero_debt",
      },
      "close.coll": {
        text: "The borrower retrieved all {coll_retrieved} {coll_symbol} of collateral.",
        when: "always",
      },
      "close.reserve": {
        text: "The 0.0375 ETH liquidation reserve was returned.",
        when: "always",
      },
      "close.rate": {
        text: "Before closing, the trove was paying {rate_before} annual interest.",
        when: "variant repaid, a rate before",
      },
      "close.cr": {
        text: "It closed at a {cr_before} collateral ratio.",
        when: "variant repaid, a ratio before",
      },
      "close.nft": {
        text: "The trove NFT was sent to the burn address, ending its ownership.",
        when: "always",
      },
      "close.nothing": {
        text: "Nothing remains on either side.",
        when: "always",
      },
    },
    order: [
      "close.repaid",
      "close.zero",
      "close.coll",
      "close.reserve",
      "close.rate",
      "close.cr",
      "close.nft",
      "close.nothing",
      "same_block",
    ],
    L5: "close",
  },
  // ── Liquidation ────────────────────────────────────────────────────────────
  {
    id: "liquity2.liquidation",
    title: "Liquidation",
    when: "liquidate",
    variants: {
      destructive: "this trove was liquidated",
      redistribution_gain: "another trove's liquidation redistributed collateral and debt onto this one",
      no_detail: "the event carries no liquidation log",
    },
    L1: [
      [{ figure: "label" }],
      [{ word: "liquidated" }, { figure: "coll_change", ...COLL }],
      [{ word: "cleared" }, { figure: "debt_change", ...DEBT }],
      [{ figure: "surplus_l1" }],
    ],
    sentences: {
      "liq.no_detail": {
        text: "The {coll_symbol} trove was liquidated.",
        when: "variant no_detail",
      },
      "liq.gain.what": {
        text: "Another trove’s liquidation redistributed part of its collateral and debt onto this one.",
        when: "variant redistribution_gain",
      },
      "liq.gain.received": {
        text: "This trove received {redist_coll} {coll_symbol} from the liquidated trove (about {redist_coll_usd} at the price at the time).",
        when: "variant redistribution_gain, priced",
      },
      "liq.gain.received_unpriced": {
        text: "This trove received {redist_coll} {coll_symbol} from the liquidated trove.",
        when: "variant redistribution_gain, no price",
      },
      "liq.gain.inherited": {
        text: "It inherited {redist_debt} {debt_symbol} of debt in proportion to its collateral.",
        when: "variant redistribution_gain",
      },
      "liq.gain.net_pos": {
        text: "The net effect was +{net_benefit}, the redistribution penalty working in this trove’s favour.",
        when: "variant redistribution_gain, the collateral outweighed the debt",
      },
      "liq.gain.net_neg": {
        text: "The net effect was −{net_benefit}, a small cost.",
        when: "variant redistribution_gain, the debt outweighed the collateral",
      },
      "liq.gain.why": {
        text: "The redistribution happened because the Stability Pool could not fully cover the liquidation.",
        when: "variant redistribution_gain",
      },
      "liq.gain.cr": {
        text: "Its collateral ratio moved from {cr_before} to {cr_after|ratio_pair}.",
        when: "variant redistribution_gain, both ratios known",
      },
      "liq.gain.open": {
        text: "The trove remains open, now carrying the inherited debt.",
        when: "variant redistribution_gain",
      },
      "liq.what": {
        text: "This trove was liquidated: its collateral ratio had dropped to {cr_at_liquidation}, below the {mcr} liquidation line for {coll_symbol}.",
        when: "variant destructive",
      },
      "liq.debt": {
        text: "Its {debt_cleared} {debt_symbol} of debt was cleared.",
        when: "variant destructive",
      },
      "liq.coll": {
        text: "{coll_liquidated} {coll_symbol} of collateral was liquidated, worth {coll_liquidated_usd} at the price at the time.",
        when: "variant destructive",
      },
      "liq.surplus": {
        text: "The collateral’s value exceeded the debt, so {coll_surplus} {coll_symbol} of surplus ({coll_surplus_usd}) remains claimable by the borrower.",
        when: "variant destructive, a surplus, not claimed yet",
      },
      "liq.surplus_claimed": {
        text: "The collateral’s value exceeded the debt, so {coll_surplus} {coll_symbol} of surplus ({coll_surplus_usd}) was left claimable by the borrower, who claimed it on {claimed_at}.",
        when: "variant destructive, the surplus since claimed",
      },
      "liq.surplus_claimed_undated": {
        text: "The collateral’s value exceeded the debt, so {coll_surplus} {coll_symbol} of surplus ({coll_surplus_usd}) was left claimable by the borrower, who claimed it.",
        when: "variant destructive, the surplus since claimed, date unknown",
      },
      "liq.loss": {
        text: "After that surplus, the borrower’s estimated loss was about {est_loss}.",
        when: "variant destructive, the collateral was worth more than the debt",
      },
      "liq.partial": {
        text: "The Stability Pool could not fully cover the liquidation, so part of the debt was redistributed to other troves.",
        when: "variant destructive, the pool covered part",
      },
      "liq.leg.sp": {
        text: "The Stability Pool received {coll_to_sp} {coll_symbol} ({coll_to_sp_usd}).",
        when: "variant destructive, collateral went to the pool",
      },
      "liq.leg.gas_comp": {
        text: "The liquidator received {coll_gas_comp} {coll_symbol} in gas compensation.",
        when: "variant destructive, collateral gas compensation",
      },
      "liq.leg.gas_weth": {
        text: "The liquidator received 0.0375 WETH in gas compensation.",
        when: "variant destructive",
      },
      "liq.leg.incentive": {
        text: "The liquidator received {incentive_coll} {coll_symbol} ({incentive_usd}) as the 5% liquidation incentive.",
        when: "variant destructive, debt cleared",
      },
      "liq.leg.nft": {
        text: "The trove NFT was burned in the liquidation.",
        when: "variant destructive",
      },
    },
    order: [
      "liq.no_detail",
      "liq.gain.what",
      "liq.gain.received",
      "liq.gain.received_unpriced",
      "liq.gain.inherited",
      "liq.gain.net_pos",
      "liq.gain.net_neg",
      "liq.gain.why",
      "liq.gain.cr",
      "liq.gain.open",
      "liq.what",
      "liq.debt",
      "liq.coll",
      "liq.surplus",
      "liq.surplus_claimed",
      "liq.surplus_claimed_undated",
      "liq.loss",
      "liq.partial",
      "same_block",
    ],
    list: ["liq.leg.sp", "liq.leg.gas_comp", "liq.leg.gas_weth", "liq.leg.incentive", "liq.leg.nft"],
    L5: "liquidation",
  },
  // ── The rest ───────────────────────────────────────────────────────────────
  {
    id: "liquity2.apply_pending_debt",
    title: "Apply pending debt",
    when: "applyPendingDebt",
    variants: { default: "always" },
    L1: [[{ figure: "label" }], [{ figure: "debt_change", ...DEBT }], [{ figure: "coll_change", ...COLL }]],
    sentences: {
      "apply.what": {
        text: "This event applied {redist_debt} {debt_symbol} of pending redistribution debt to the trove.",
        when: "no collateral arrived",
      },
      "apply.what_coll": {
        text: "This event applied {redist_debt} {debt_symbol} of pending redistribution debt to the trove, along with {redist_coll} {coll_symbol} of redistributed collateral.",
        when: "collateral arrived too",
      },
      "apply.batch": {
        text: "A batch manager applied the trove’s accrued interest at the same time.",
        when: "a batch update rode with it",
      },
      "apply.coll": {
        text: "The collateral is unchanged at {coll_after} {coll_symbol} ({coll_after_usd}).",
        when: "the trove holds priced collateral",
      },
      "apply.coll_unpriced": {
        text: "The collateral is unchanged at {coll_after} {coll_symbol}.",
        when: "the trove holds collateral, no price",
      },
      "apply.rate": {
        text: "Interest accrues at {rate_after} a year.",
        when: "always",
      },
    },
    order: [
      "apply.what",
      "apply.what_coll",
      "apply.batch",
      "state.debt_now",
      "apply.coll",
      "apply.coll_unpriced",
      "apply.rate",
      "state.cr",
      "same_block",
    ],
    L5: "interest_rate",
  },
  {
    id: "liquity2.transfer",
    title: "Transfer",
    when: "transferTrove: the trove NFT changed hands",
    variants: {
      transfer: "a transfer between wallets",
      mint: "the NFT's mint",
      burn: "the NFT's burn",
      no_detail: "no transfer log",
    },
    L1: [[{ figure: "label" }]],
    sentences: {
      "transfer.no_detail": {
        text: "The {coll_symbol} trove’s ownership was transferred.",
        when: "variant no_detail",
      },
      "transfer.mint": {
        text: "The trove NFT was minted to {to_address}.",
        when: "variant mint",
      },
      "transfer.burn": {
        text: "The trove NFT was burned from {from_address}.",
        when: "variant burn",
      },
      "transfer.move": {
        text: "The trove NFT moved from {from_address} to {to_address}.",
        when: "variant transfer",
      },
      "transfer.state": {
        text: "The transferred trove holds {debt_after} {debt_symbol} of debt against {coll_after} {coll_symbol} of collateral, at a {cr_after|ratio_pair} ratio and a {rate_after} interest rate ({coll_symbol} at {price_at_event}).",
        when: "variant transfer, the trove holds something, priced",
      },
      "transfer.state_unpriced": {
        text: "The transferred trove holds {debt_after} {debt_symbol} of debt against {coll_after} {coll_symbol} of collateral, at a {cr_after|ratio_pair} ratio and a {rate_after} interest rate.",
        when: "variant transfer, the trove holds something, no price",
      },
      "transfer.unchanged": {
        text: "The trove’s debt and collateral balances are unchanged by the transfer.",
        when: "variant transfer",
      },
    },
    order: [
      "transfer.no_detail",
      "transfer.mint",
      "transfer.burn",
      "transfer.move",
      "transfer.state",
      "transfer.state_unpriced",
      "transfer.unchanged",
      "same_block",
    ],
    L5: "transfer",
  },
  {
    id: "liquity2.fallback",
    title: "Trove event",
    when: "any operation no other template takes",
    variants: { default: "always" },
    L1: [[{ figure: "label" }]],
    sentences: {
      "fallback.what": {
        text: "This was a {operation} on the {coll_symbol} trove.",
        when: "always",
      },
    },
    order: ["fallback.what", "same_block"],
    L5: "fallback",
  },
];

// ── L5: the "?" modal, one per kind of event ────────────────────────────────

export type L5Key =
  | "adjust"
  | "redemption"
  | "delegation"
  | "interest_rate"
  | "open"
  | "close"
  | "liquidation"
  | "transfer"
  | "fallback";

/** The liquidation modal names the branch's minimum; the interest-rate modal
 *  names who controls the trove's rate. */
export interface L5Options {
  collateralType?: string;
  delegated?: boolean;
  delegateName?: string;
}

export const L5: Record<L5Key, (o?: L5Options) => LearnMoreContent> = {
  adjust: () => ({
    title: "How adjusting a trove works",
    intro:
      "An adjustment changes a trove without closing it. The owner can add or withdraw collateral, borrow more BOLD, or repay some of the debt.",
    extraParagraphs: [
      "Adding collateral or repaying makes the trove safer. Withdrawing collateral or borrowing more brings it closer to liquidation, and borrowing more adds a one-time fee. Every adjustment must leave the collateral ratio above the branch minimum (110% for WETH), or the transaction is rejected.",
      "Adjusting doesn't change the interest rate, which is a separate action. The rate matters because it decides how early the trove is redeemed against.",
    ],
    links: [
      { label: "How do I decide on my collateral ratio?", url: FAQ_URLS.LTV_COLLATERAL_RATIO },
      { label: "Are there other borrowing fees?", url: FAQ_URLS.BORROWING_FEES },
      { label: "What is a Trove?", url: FAQ_URLS.WHAT_IS_TROVE },
    ],
  }),
  redemption: () => ({
    title: "How redemptions work",
    intro:
      "Anyone holding BOLD can exchange it for $1 of collateral per BOLD. Because the swap happens at face value, bots redeem whenever BOLD trades below $1, which helps hold BOLD at its peg.",
    extraParagraphs: [
      "For the borrower, a redemption works like selling some collateral at the current price to repay the same amount of debt, plus a small fee kept in the trove. It isn't a loss at the time, but it leaves the owner with less exposure to the collateral's price.",
      "Troves are redeemed in order of interest rate, lowest first, so a higher rate pushes a trove further back in the queue.",
    ],
    video: {
      label: "9 min video",
      url: "https://www.youtube.com/watch?v=CQVmjFx987A",
      description:
        "Watch this video on redemptions from Liquity to understand how they work and how to manage redemption risk.",
    },
    links: [
      {
        label: "What are redemptions?",
        url: "https://docs.liquity.org/v2-faq/redemptions-and-delegation#what-are-redemptions",
      },
      {
        label: "What happens if my Trove gets redeemed?",
        url: "https://docs.liquity.org/v2-faq/redemptions-and-delegation#what-happens-if-my-trove-gets-redeemed",
      },
      {
        label: "How can I stay protected?",
        url: "https://docs.liquity.org/v2-faq/redemptions-and-delegation#how-can-i-stay-protected",
      },
      {
        label: "Is there a redemption fee?",
        url: "https://docs.liquity.org/v2-faq/redemptions-and-delegation#is-there-a-redemption-fee",
      },
    ],
  }),
  liquidation: (o) => {
    const collateralType = o?.collateralType;
    const isETH = collateralType === "WETH" || collateralType === "ETH";
    const minCR = isETH ? "110%" : "120%";
    const maxLTV = isETH ? "90.91%" : "83.33%";
    return {
      title: "How Liquidations Work",
      intro: `Troves become eligible for liquidation when the collateral ratio falls below the minimum threshold (${minCR} for ${collateralType ?? "this collateral"}, equivalent to a maximum ${maxLTV} LTV). Once eligible, anyone can trigger a liquidation transaction.`,
      extraParagraphs: [
        "If the Stability Pool has sufficient BOLD, it absorbs the debt and receives the collateral. Otherwise, debt and collateral are redistributed proportionally to other active borrowers in the same market.",
        "Liquidators receive a 5% incentive on the debt cleared, plus a gas compensation of 0.0375 WETH. Any remaining collateral above what is needed to cover debt + penalty is claimable by the original borrower as surplus.",
      ],
      links: [
        {
          label: "How do liquidations work?",
          url: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#how-do-liquidations-work-in-liquity-v2",
        },
        {
          label: "What is the liquidation threshold?",
          url: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#how-do-liquidations-work-in-liquity-v2",
        },
        {
          label: "How does the Stability Pool work?",
          url: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#how-do-liquidations-work-in-liquity-v2",
        },
      ],
    };
  },
  open: () => ({
    title: "How Borrowing Works",
    intro:
      "Liquity V2 allows users to borrow BOLD (a decentralized stablecoin) by depositing collateral into a Trove. The Trove is represented by an NFT that provides full control over the position. The interest rate set at opening determines redemption risk \u2014 higher rates provide better protection against redemptions but cost more over time.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Collateral ratio",
        text: "the value of the collateral relative to the debt. Must stay above the liquidation threshold.",
      },
      {
        bold: "Interest rate",
        // This modal also serves openTroveAndJoinBatch, so the sentence names
        // the delegation route.
        text: "the borrower sets the rate, or delegates it to a batch manager. Lower rates save money but increase redemption risk.",
      },
      {
        bold: "Upfront fee",
        text: "a one-time borrowing fee equivalent to 7 days of average interest, added to the Trove's debt.",
      },
      {
        bold: "Liquidation reserve",
        text: "0.0375 ETH set aside to incentivise liquidators. Refunded when the Trove is closed.",
      },
    ],
    video: {
      label: "video guide",
      url: "https://www.youtube.com/watch?v=o1miCKLIPYs",
      description: "Learn how to borrow on Liquity and manage a Trove effectively.",
    },
    links: [
      { label: "What is a Trove?", url: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#what-is-a-trove" },
      {
        label: "Understanding borrowing fees",
        url: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#are-there-any-other-fees-related-to-borrowing",
      },
      {
        label: "What is the liquidation reserve?",
        url: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#what-is-the-refundable-gas-deposit",
      },
      {
        label: "How user-set interest rates work",
        url: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#what-are-user-set-rates",
      },
    ],
  }),
  close: () => ({
    title: "How Closing a Trove Works",
    intro:
      "Closing a trove repays its entire debt and returns the collateral, ending the position. The trove's NFT is burned once it closes.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Full repayment",
        text: "closing requires repaying the whole debt — principal plus accrued interest — in BOLD.",
      },
      {
        bold: "Liquidation reserve",
        text: "the 0.0375 ETH gas reserve set aside when the trove opened is refunded on close.",
      },
      {
        bold: "Trove NFT",
        text: "the NFT representing the position is burned when the trove closes, freeing the slot.",
      },
    ],
    links: [
      { label: "What is a Trove?", url: FAQ_URLS.WHAT_IS_TROVE },
      { label: "What is the liquidation reserve?", url: FAQ_URLS.LIQUIDATION_RESERVE },
      { label: "How many troves can I open with the same address?", url: FAQ_URLS.NFT_TROVES },
    ],
  }),
  interest_rate: (o) => {
    const delegated = o?.delegated ?? false;
    const delegateLabel = o?.delegateName ? `the ${o.delegateName} delegate` : "a batch-manager delegate";
    return {
      title: "How Interest Rates Work",
      intro: delegated
        ? `Each trove carries an annual interest rate that accrues continuously to its debt. This trove's rate is managed by ${delegateLabel} the borrower appointed, which sets one shared rate across a group of troves; the borrower can take back direct control by removing the trove from the batch.`
        : "Each trove carries an annual interest rate that accrues continuously to its debt. The borrower can change the rate at any time, or delegate that to a batch manager that runs one shared rate for a group of troves.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Who sets the rate",
          text: delegated
            ? "the appointed delegate sets the rate on the borrower's behalf, until the borrower leaves the batch. Lower rates cost less but sit earlier in the redemption queue."
            : "the borrower sets the rate, or delegates it to a batch manager. Lower rates cost less but sit earlier in the redemption queue.",
        },
        {
          bold: "Continuous accrual",
          text: "interest compounds onto the principal over time rather than being charged upfront.",
        },
        {
          bold: "Premium on change",
          text: "changing the rate soon after the last adjustment can incur an upfront premium, discouraging rate-gaming.",
        },
      ],
      links: [
        { label: "How do user-set interest rates work?", url: FAQ_URLS.USER_SET_RATES },
        { label: "What are redemptions?", url: FAQ_URLS.REDEMPTIONS },
      ],
    };
  },
  delegation: () => ({
    title: "How Interest Delegation Works",
    intro:
      "A trove can delegate interest-rate management to a batch manager — a delegate that sets one shared rate for a group of troves and charges a management fee.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Batch manager",
        text: "a delegate that sets a single interest rate applied to every trove in its batch.",
      },
      {
        bold: "Management fee",
        text: "an annual fee, on top of the interest, that accrues to the debt as the delegate's compensation.",
      },
      {
        bold: "Joining & leaving",
        text: "a trove can join or exit a batch at any time; leaving returns rate control to the owner.",
      },
    ],
    links: [
      { label: "What is interest-rate delegation?", url: FAQ_URLS.DELEGATION },
      { label: "How do user-set interest rates work?", url: FAQ_URLS.USER_SET_RATES },
    ],
  }),
  transfer: () => ({
    title: "How Trove Transfers Work",
    intro: "A trove is an ERC-721 NFT, so its ownership can be transferred to another wallet like any other token.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Trove NFT",
        text: "ownership of the position is a transferable NFT — whoever holds it controls the trove.",
      },
      {
        bold: "Transfer effects",
        text: "transferring the NFT hands full control of the collateral and debt to the new owner.",
      },
      {
        bold: "Multiple troves",
        text: "one address can hold many troves, each a separate NFT and position.",
      },
    ],
    links: [
      { label: "How many troves can I open with the same address?", url: FAQ_URLS.NFT_TROVES },
      { label: "What is a Trove?", url: FAQ_URLS.WHAT_IS_TROVE },
    ],
  }),
  fallback: () => ({
    title: "How Liquity V2 Troves Work",
    intro:
      "Liquity V2 lets a borrower take out BOLD against collateral in a trove — a self-custodied position represented by an NFT.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Trove",
        text: "the borrowing position — collateral in, BOLD out, with a collateral ratio to keep above the threshold.",
      },
      {
        bold: "Interest rate",
        text: "a user-set rate that accrues to the debt and sets the trove's place in the redemption queue.",
      },
      {
        bold: "Redemptions",
        text: "BOLD can be redeemed for collateral at face value, starting with the lowest-rate troves.",
      },
    ],
    links: [
      { label: "What is a Trove?", url: FAQ_URLS.WHAT_IS_TROVE },
      { label: "How do user-set interest rates work?", url: FAQ_URLS.USER_SET_RATES },
      { label: "What are redemptions?", url: FAQ_URLS.REDEMPTIONS },
    ],
  }),
};
