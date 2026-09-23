// Receipts for a Moonwell market note — the share-rate step and the position's
// own slice across it.
// ----------------------------------------------------------------------------
// A market note states a fact about the MARKET, not about the account, so its
// receipts have to answer a question the event receipts never face: where did a
// number about somebody else's transaction come from, and how would a reader
// confirm it without trusting Rails.
//
// The answer is that the share rate is not read anywhere — it is DERIVED from
// two fields the market's own logs already carry. Every Mint and Redeem emits
// the underlying `amount` and the `mintTokens`/`redeemTokens` it was exchanged
// for; their quotient is the market's exchange rate at that block. So each end
// of a step is one log, named by transaction hash and log index, and anyone can
// divide the two numbers in it themselves. Nothing is interpolated between the
// two ends: the step's whole claim is that these two logs are adjacent in the
// market and their rates differ.
//
// Shaped after `driftSliceProv` in lib/fx/event-provenance.ts — the shipped
// precedent for a receipted fact that sits BETWEEN two of a position's own
// events rather than on one of them.

import type { Provenance } from "@/components/shared/provenance";
import type { MarketNotePoint, ShareRateStepNote } from "@/lib/shared/market-note";
import { formatShareRate } from "@/lib/shared/market-note";

/** The detector's own bound, as the share-rate endpoint states it in `rule`:
 *  a rate change counts as a step only when it exceeds the interest the market
 *  could have accrued over the same blocks by this factor, and the accrual
 *  bound itself is capped at this share per day where the market's stored
 *  supply rate is missing. Restated here so the receipt can name the rule the
 *  number was found by; the endpoint remains the source. */
const TOLERANCE = 10;
const CEILING_PER_DAY = "5%";

const DERIVATION = "the underlying `amount` divided by the `mintTokens`/`redeemTokens` in the same log";

const shortHex = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** How one end of a step reads in prose: whose log it is and where to find it. */
const endClause = (p: MarketNotePoint): string =>
  `${shortHex(p.wallet)}'s ${p.kind} at block ${p.block} (${shortHex(p.txHash)}, log ${p.logIndex})`;

/** The live end in prose: no log to name (the market's own current exchange
 *  rate, read at the chain head, not derived from any account's log). */
const liveEndClause = (note: ShareRateStepNote): string =>
  `m${note.marketSymbol}'s own exchangeRateStored(), read live at block ${note.to.block}`;

const stepLeaves = (note: ShareRateStepNote) => [
  {
    label: "rate before",
    value: formatShareRate(note.from.value),
    kind: "chain-derived" as const,
    pclass: "emitted" as const,
    note: note.live
      ? `this account's own ${note.from.kind} at block ${note.from.block} (${shortHex(note.from.txHash)}, log ${note.from.logIndex}) — ${DERIVATION}`
      : `${endClause(note.from)} — ${DERIVATION}`,
  },
  {
    label: "rate after",
    value: formatShareRate(note.to.value),
    kind: "chain-derived" as const,
    pclass: "emitted" as const,
    note: note.live ? liveEndClause(note) : `${endClause(note.to)} — ${DERIVATION}`,
  },
];

/**
 * The step itself: the two rates, the ratio between them, or the block range
 * they bracket. One builder, three faces, because the row states one fact in
 * three places and a reader who opens any of them should land on the same
 * derivation.
 */
export const shareRateStepProv = (
  note: ShareRateStepNote,
  part: "rate" | "ratio" | "blocks" | "elapsed",
): Provenance => {
  const marketPair = `${note.marketSymbol} market's share rate`;
  if (part === "elapsed") return elapsedProv(note, `the ${note.marketSymbol} market's two logs`);
  const summary = note.live
    ? part === "rate"
      ? `The ${marketPair}, before and now — the earlier figure is ${DERIVATION}, taken at this account's own last Mint or Redeem in the market; the later one is the market's own exchangeRateStored(), read live at the chain head. Neither figure is a price: the earlier is a quotient of two fields in a log the account itself emitted, the later a slot read at head. Nothing between them is stated, because the account has transacted nothing in this market since.`
      : part === "ratio"
        ? `How far the ${marketPair} has moved since this account's own last Mint or Redeem — the live rate divided by the rate that log implied. A ratio, not a return: it says what one mToken is worth in underlying now against what it was worth at that log, and says nothing about any account's gain or loss.`
        : `The block the step runs from, and the chain head it runs TO — this account's own last Mint or Redeem in the ${note.marketSymbol} market, and the block the live rate was read at. The later block is not a log at all; it is simply the latest one Rails could read the market's rate against.`
    : part === "rate"
      ? `The ${marketPair}, before and after the step — ${DERIVATION}, taken at the last Mint or Redeem in the market before block ${note.to.block} and at the first one at or after it. Neither figure is a price and neither is read from a slot: both are quotients of two fields in a log the market emitted. Nothing between the two observations is stated, because nothing between them was observed.`
      : part === "ratio"
        ? `How far the ${marketPair} moved across the step — the after rate divided by the before rate, both derived from the market's own Mint/Redeem logs. A ratio, not a return: it says what one mToken came to be worth in underlying against what it was worth at the previous observation, and says nothing about any account's gain or loss.`
        : `The blocks the step is bracketed by — the block of the last Mint or Redeem in the ${note.marketSymbol} market before the change and the block of the first one after it. The market's rate is only observed where the market emits a log, so these two blocks are the whole of what is known: the change happened at or between them, and Rails does not state where.`;
  const value =
    part === "rate"
      ? `${formatShareRate(note.from.value)} → ${formatShareRate(note.to.value)}`
      : part === "ratio"
        ? String(note.ratio)
        : `${note.from.block} → ${note.to.block}`;
  return {
    kind: "chain-derived",
    pclass: "emitted",
    summary,
    contract: { name: `m${note.marketSymbol}`, address: note.marketAddress },
    via: note.live
      ? "this account's own Mint/Redeem log · exchangeRateStored() at read time"
      : "market Mint/Redeem logs · amount ÷ mTokens at each",
    formula: part === "ratio" ? "rate after ÷ rate before" : "amount ÷ mTokens",
    verify: {
      kind: "recompute",
      text: note.live
        ? `Open this account's own last Mint or Redeem on this page and divide its amount by its mToken amount for the earlier figure; re-run exchangeRateStored() on m${note.marketSymbol} for the later one — it moves, so an exact repeat is not expected.`
        : `Read the two logs on the market's own explorer page — ${endClause(note.from)} and ${endClause(note.to)} — and divide each log's amount by its mToken amount. A step is only stated where the change exceeds ${TOLERANCE}× the interest the market could have accrued over the same blocks (bounded at ${CEILING_PER_DAY} a day), so ordinary accrual between two observations never appears here.`,
    },
    inputs: [
      ...stepLeaves(note),
      {
        label: "blocks",
        value,
        kind: "chain",
        pclass: "emitted",
        note: note.live
          ? `this account's own last log's block (${note.from.block}) and the block the live rate was read at (${note.to.block})`
          : `the two logs' own block numbers — ${note.from.block} and ${note.to.block}`,
      },
    ],
  };
};

/**
 * The position's own slice across the step: the mToken balance it held at the
 * first observation, and what that balance counted in underlying at each end.
 * The balance is the account's own replayed figure; the two valuations are it
 * multiplied by each end's rate.
 */
export const shareRateSliceProv = (note: ShareRateStepNote, part: "units" | "before" | "after"): Provenance => {
  const slice = note.slice;
  const mSym = slice?.unitSymbol ?? `m${note.marketSymbol}`;
  const rate = part === "after" ? note.to : note.from;
  const liveRate = part === "after" && note.live;
  const summary = note.live
    ? part === "units"
      ? `${mSym} this position holds NOW — the account's own live mToken balance (\`mtokenBalanceRaw\` on the position overlay), read at the chain head rather than replayed at any particular block. Held fixed here: the two valuations beside it move only the rate.`
      : `What this position's ${mSym} counts in ${note.marketSymbol} ${part === "after" ? "now" : "at the last observation before now"} — the live balance multiplied by the market's rate ${part === "after" ? "read live at the chain head" : `at this account's own last Mint or Redeem (block ${rate.block})`}. A count of underlying at that rate, not a valuation: no price of any kind enters it, and the account neither gained nor lost anything by the multiplication.`
    : part === "units"
      ? `${mSym} this position held across the step — the account's own mToken balance after its last supply-side event in the ${note.marketSymbol} market at or before block ${note.from.block}, replayed from every mToken Transfer touching this wallet. It is the same figure the account's own event cards state, carried across a stretch in which the account did nothing.`
      : `What this position's ${mSym} counted in ${note.marketSymbol} ${part === "after" ? "after" : "before"} the step — the balance multiplied by the market's share rate at ${part === "after" ? "the first observation after" : "the last observation before"} the change (block ${rate.block}). A count of underlying at that rate, not a valuation: no price of any kind enters it, and the account neither gained nor lost anything by the multiplication.`;
  return {
    kind: "chain-derived",
    pclass: "state",
    summary,
    contract: { name: `m${note.marketSymbol}`, address: note.marketAddress },
    via: note.live
      ? part === "units"
        ? "the position overlay's own live mToken balanceOf"
        : "the position overlay's own live mToken balance × the market's rate at the observation"
      : part === "units"
        ? "replayed mToken balance (Σ ±amount across Transfer logs)"
        : "replayed mToken balance × the market's rate at the observation",
    ...(part === "units" ? {} : { formula: "mTokens held × rate" }),
    verify: {
      kind: "recompute",
      text: note.live
        ? part === "units"
          ? `Re-run the mToken balanceOf eth_call at the chain head against an archive node — it matches the live figure exactly.`
          : liveRate
            ? `Re-run the mToken balanceOf eth_call at the chain head, and exchangeRateStored() on m${note.marketSymbol} at the same block, and multiply the two.`
            : `Re-run the mToken balanceOf eth_call at the chain head, divide this account's own last Mint or Redeem's amount by its mToken amount, and multiply the two.`
        : part === "units"
          ? `Re-run the mToken balanceOf eth_call at block ${note.from.block} against an archive node — the replayed balance matches the slot exactly.`
          : `Re-run the mToken balanceOf eth_call at block ${note.from.block}, divide ${endClause(rate)}'s amount by its mToken amount, and multiply the two.`,
    },
    inputs: [
      {
        label: "mTokens held",
        value: slice ? String(slice.units) : undefined,
        kind: "chain",
        pclass: "state",
        note: note.live
          ? `the account's LIVE mToken balance, read at the chain head — the position overlay's own \`mtokenBalanceRaw\``
          : `the account's mToken balance at block ${note.from.block} — equal to the mToken's own accountTokens slot (balanceOf) there`,
      },
      ...(part === "units"
        ? []
        : [
            {
              label: "rate",
              value: formatShareRate(rate.value),
              kind: "chain-derived" as const,
              pclass: "emitted" as const,
              note: liveRate
                ? `m${note.marketSymbol}'s own exchangeRateStored(), read live at block ${rate.block}`
                : `${endClause(rate)} — ${DERIVATION}`,
            },
          ]),
    ],
  };
};

/**
 * The time between the two ends: the difference of the two blocks' own
 * timestamps, each the header of the block the log sits in. Exact — it is not
 * a block count times an assumed block time, and it says nothing about when
 * inside the stretch the change happened.
 */
const elapsedProv = (note: ShareRateStepNote, logs: string): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  summary: `The time between the two observations — the later block's timestamp less the earlier's, both read from the block headers ${logs} sit in. Exact, not an estimate from a block count. It bounds when the change happened and says nothing about where inside the stretch it fell.`,
  contract: { name: `m${note.marketSymbol}`, address: note.marketAddress },
  via: "block headers · timestamp at each end",
  formula: "timestamp after − timestamp before",
  verify: {
    kind: "recompute",
    text: `Open each block on the chain's explorer — ${note.from.block} and ${note.to.block} — and subtract the two timestamps.`,
  },
  inputs: [
    {
      label: "timestamps",
      value: `${note.from.timestamp} → ${note.to.timestamp}`,
      kind: "chain",
      pclass: "emitted",
      note: `Unix seconds of blocks ${note.from.block} and ${note.to.block}`,
    },
  ],
});
