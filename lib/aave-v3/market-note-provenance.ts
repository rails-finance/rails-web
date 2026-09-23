// Receipts for an Aave-family market note — the reserve's own rate at each end
// of a stretch between two of a position's own touches, and the yearly
// interest that earlier touch's own holding would cost (or earn) at each rate.
// ----------------------------------------------------------------------------
// Shared by Aave V3 (Core / Prime / EtherFi) and SparkLend: they index the same
// Pool event into the same table and the notes are built by one selector
// (lib/aave-v3/market-notes.ts), so one receipt vocabulary serves both — the
// Pool the leaves NAME is the one thing that differs.
//
// WHAT THESE RECEIPTS HAVE TO ANSWER, and it is not what the Polaris ones
// answer. There the rate is already on the row and the question is which
// PrimaryRateSet it came from. Here nothing on the row carries the reserve's
// rate at all: both ends are the reserve's own `ReserveDataUpdated`, found by
// two DIFFERENT as-of rules, and a reader who does not know which rule found
// which end cannot tell the market's move from the position's own doing:
//
//   rate after the position's own action   the last ReserveDataUpdated at or
//   before the earlier touch's own log. The Pool emits it inside that touch's
//   own transaction, before the touch's own event, so it IS the rate the
//   action left in force.
//
//   rate before the position's next touch  the last one strictly before the
//   later touch's log AND not inside that touch's own transaction. Without the
//   exclusion a large borrow's own effect on utilisation would be stated as
//   something the market did to the position.
//
// So every leaf here names its rule in words, not just its coordinates. The
// live end names neither: it is `getReserveData` at the head, a slot read
// rather than a log, and it says so.
//
// Shaped after lib/polaris/market-note-provenance.ts — one builder per figure
// family, each returning the same Provenance shape whichever face of the
// sentence it backs.

import type { Provenance } from "@/components/shared/provenance";
import { aaveFamilyEndLabel, aaveFamilyRateNoun, type RateStepNote } from "@/lib/shared/market-note";
import { MARKET_NAME, POOL_BY_MARKET } from "./asset-catalog";

const shortHex = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

const pct = (n: number): string =>
  `${(n * 100).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}%`;

/** SparkLend's Pool. Restated here rather than imported from
 *  lib/spark/asset-catalog.ts so this module has one import per protocol
 *  family rather than a second catalog's whole surface; the address is the
 *  same constant that file states. */
const SPARK_POOL = "0xc13e21b648a5ee794902342038ff3adab66be987";

/** Which Pool a note's figures were read through. Core, Prime and EtherFi are
 *  three separate contracts with three separate rate histories, so a receipt
 *  that named Core's address on a Prime note would be wrong about the source,
 *  not merely imprecise. */
const poolOf = (note: RateStepNote) => {
  if (note.protocol === "spark") return { name: "SparkLend Pool", address: SPARK_POOL };
  // `marketName` is "Aave V3 Core" / "Aave V3 Prime" / "Aave V3 EtherFi"; the
  // key behind it is what POOL_BY_MARKET is keyed on.
  const key = Object.keys(MARKET_NAME).find((k) => note.marketName === `Aave V3 ${MARKET_NAME[k]}`) ?? "core";
  return { name: `${note.marketName ?? "Aave V3 Core"} Pool`, address: POOL_BY_MARKET[key] };
};

/** The field on the Pool's own log this side's rate is. */
const rateField = (note: RateStepNote): string => (note.side === "supply" ? "liquidityRate" : "variableBorrowRate");

/** The field on the chain overlay a LIVE end's rate is. */
const liveField = (note: RateStepNote): string => (note.side === "supply" ? "supplyApr" : "borrowApr");

/** The route the historical rates were served by. */
const ratesRoute = (note: RateStepNote): string =>
  note.protocol === "spark" ? "/api/spark/reserve-rates" : "/api/aave-v3/reserve-rates";

/** The route a live rate was read through. */
const overlayRoute = (note: RateStepNote): string =>
  note.protocol === "spark" ? "/api/chain/spark/position" : "/api/chain/aave-v3/position";

/** The scale a Pool rate is written at. Stated in the prose rather than as a
 *  `scaling` sentence: the route serves the ray integer beside the rate
 *  (`liquidityRateRaw` / `variableBorrowRateRaw`) but the note's shared
 *  `RateSetLog` shape does not carry it, so no raw reaches this builder and
 *  none is invented (receipts grammar §5). */
const RAY_SENTENCE = "The Pool writes a rate as a fraction with 27 decimal places, where 10^27 a year means 100%.";

/** How the rate at one end was found, in words. The RULE, not only the
 *  coordinates — the two ends are found differently and the difference is the
 *  whole point of the note. */
const rateLeafNote = (note: RateStepNote, which: "earlier" | "later"): string => {
  if (which === "later" && note.live) {
    return (
      `the Pool's getReserveData for this reserve, read at block ${note.to.block} through ` +
      `${overlayRoute(note)} — \`reserves[].${liveField(note)}\`, a slot the Pool holds at the head, not a log`
    );
  }
  const observed = which === "earlier" ? note.observed.from : note.observed.to;
  const point = which === "earlier" ? note.from : note.to;
  if (!observed) {
    return `this position's ${aaveFamilyEndLabel(point)} at block ${point.block} — the reserve's last ReserveDataUpdated at that touch`;
  }
  if (which === "earlier") {
    return (
      `the reserve's ReserveDataUpdated at block ${observed.block} (tx ${shortHex(observed.txHash)}, log ` +
      `${observed.logIndex}), \`${rateField(note)}\` ÷10^27 — the last one at or before this position's ` +
      `${aaveFamilyEndLabel(note.from)} at block ${note.from.block}. The Pool writes it inside that transaction, ` +
      `ahead of the position's event, so it is the rate that action left in force`
    );
  }
  return (
    `the reserve's ReserveDataUpdated at block ${observed.block} (tx ${shortHex(observed.txHash)}, log ` +
    `${observed.logIndex}), \`${rateField(note)}\` ÷10^27 — the last one strictly before this position's ` +
    `${aaveFamilyEndLabel(note.to)} at block ${note.to.block} and outside that transaction, so a move the ` +
    `position caused there is left out of the market's`
  );
};

const rateLeaf = (note: RateStepNote, which: "earlier" | "later") => ({
  label: `rate ${which}`,
  value: pct(which === "earlier" ? note.from.value : note.to.value),
  kind: "chain" as const,
  pclass: (which === "later" && note.live ? "state" : "emitted") as "state" | "emitted",
  note: rateLeafNote(note, which),
  contract: poolOf(note),
});

/**
 * The step itself: the two rates, the percentage-point move between them, the
 * two blocks, or the elapsed time. One builder, four faces, because the
 * sentence states one fact in several places and a reader who opens any of
 * them should land on the same two observations.
 */
export const aaveFamilyRateStepProv = (
  note: RateStepNote,
  part: "rate" | "delta" | "blocks" | "elapsed",
): Provenance => {
  if (part === "elapsed") return elapsedProv(note);
  const quantity = `${note.marketSymbol} ${aaveFamilyRateNoun(note)}`;
  const summary = note.live
    ? part === "rate"
      ? `The ${quantity} at each end of the stretch — the earlier one is the reserve's last ReserveDataUpdated at ` +
        `or before this position's last touch, the rate that touch left in force; the later one is the Pool's ` +
        `getReserveData read at the chain head. The rate belongs to the reserve: how much of it every account ` +
        `has borrowed sets it, and nobody picks it. ${RAY_SENTENCE}`
      : part === "delta"
        ? `How far the ${quantity} has moved since this position's last touch — the rate that touch left in ` +
          `force against the Pool's read just now. It is the move in the rate alone; the position's balances ` +
          `play no part in it.`
        : `The block the stretch runs from, and the chain head it runs to — this position's last touch, and the ` +
          `block the Pool answered at. The later block is one the position had no hand in: it is the latest ` +
          `block the reserve's rate could be read against.`
    : part === "rate"
      ? `The ${quantity} at each end of the stretch, both from the reserve's ReserveDataUpdated, found by two ` +
        `different rules. The earlier is the last one at or before this position's ` +
        `${aaveFamilyEndLabel(note.from)}, which the Pool writes inside that transaction ahead of the position's ` +
        `event, so it is the rate that action left in force. The later is the last one strictly before the ` +
        `position's next touch and outside that touch's transaction, so a large borrow's effect on the ` +
        `reserve's usage stays out of what the market did. Nothing is drawn between the two: the position ` +
        `transacted nothing there. ${RAY_SENTENCE}`
      : part === "delta"
        ? `How far the ${quantity} moved across the stretch — the rate before the position's next touch against ` +
          `the rate its earlier action left in force. It is the move in the rate alone; the position's balances ` +
          `play no part in it, and the later end leaves out the transaction the position made.`
        : `The two blocks the stretch runs between — this position's ${aaveFamilyEndLabel(note.from)} and ` +
          `${aaveFamilyEndLabel(note.to)}. The position's activity is what bounds the stretch: the rate is read ` +
          `against these two blocks because the position acted at each, and nothing is claimed about the rate's ` +
          `path in between.`;
  const value =
    part === "rate"
      ? `${pct(note.from.value)} → ${pct(note.to.value)}`
      : part === "delta"
        ? String(note.deltaPp)
        : `${note.from.block} → ${note.to.block}`;
  return {
    kind: "chain",
    pclass: "emitted",
    summary,
    contract: poolOf(note),
    // The first segment is dropped as custody in an embedded receipt, so the
    // route leads and the log name survives into view (receipts grammar §3).
    via: note.live
      ? `${ratesRoute(note)} · ReserveDataUpdated log · ${rateField(note)} ÷10^27 as of the position's last touch · ` +
        `getReserveData at the head (${overlayRoute(note)})`
      : `${ratesRoute(note)} · ReserveDataUpdated log · ${rateField(note)} ÷10^27, read around the position's two touches`,
    ...(part === "delta" ? { formula: "(rate before the next touch − rate after the earlier action) × 100" } : {}),
    verify: {
      kind: "recompute",
      text: note.live
        ? `Find the reserve's last ReserveDataUpdated at or before block ${note.from.block} log ${note.from.logIndex} ` +
          `on the ${poolOf(note).name} for the earlier rate; re-read getReserveData for the later one, which moves ` +
          `between reads.`
        : `On the ${poolOf(note).name}, take the reserve's last ReserveDataUpdated at or before block ` +
          `${note.from.block} log ${note.from.logIndex} for the earlier rate, and the last one before block ` +
          `${note.to.block} log ${note.to.logIndex} outside that touch's transaction for the later — ` +
          `\`${rateField(note)}\` ÷10^27 is the rate at each end.`,
    },
    inputs: [
      rateLeaf(note, "earlier"),
      rateLeaf(note, "later"),
      {
        label: "blocks",
        value,
        kind: "chain",
        pclass: "emitted",
        note: note.live
          ? `this position's last touch (${note.from.block}) and the block the overlay answered at (${note.to.block})`
          : `this position's two touches — ${note.from.block} and ${note.to.block}`,
      },
    ],
  };
};

/**
 * The time between the two touches: the difference of the two blocks' own
 * header timestamps. Exact — not a block count times an assumed block time —
 * and silent about where inside the stretch the rate actually moved.
 */
const elapsedProv = (note: RateStepNote): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  summary: note.live
    ? `The time since the earlier touch — the chain head's timestamp at read time, less the timestamp in the ` +
      `header of the block this position last touched in. Both come from block headers, so the figure is the ` +
      `seconds the chain records. It grows on every reload.`
    : `The time between the two touches — the later block's timestamp less the earlier's, both taken from the ` +
      `headers of the blocks this position's two touches sit in. It bounds when the rate moved and says nothing ` +
      `about where inside the stretch it did.`,
  contract: poolOf(note),
  via: note.live
    ? "the earlier touch's block header and the chain head's timestamp at read time"
    : "the timestamp in each touch's block header",
  formula: "timestamp after − timestamp before",
  verify: {
    kind: "recompute",
    text: note.live
      ? `Open this position's last touch on this page for block ${note.from.block}'s timestamp, and read the chain head's at read time; subtract the two.`
      : `Open each block on the chain's explorer — ${note.from.block} and ${note.to.block} — and subtract the two timestamps; or read the dates of the two touches on this page.`,
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

/**
 * What the rate move meant for this position: the yearly interest the holding
 * its own earlier touch recorded would cost — or earn — at each end's rate.
 *
 * `before`/`after` are the one pair of figures here the chain never stated.
 * They hold that holding fixed and move only the rate, the same "what that
 * state came to be worth" framing as the price gap's `crAfter`. Interest
 * actually charged or earned is whatever the reserve's own index does to the
 * balance between the two touches, and the position's next row states where it
 * actually stood; these figures are silent about it.
 */
export const aaveFamilyRateStepInterestProv = (note: RateStepNote, part: "amount" | "before" | "after"): Provenance => {
  const interest = note.interest;
  const rate = part === "after" ? note.to.value : note.from.value;
  const isSupply = note.side === "supply";
  const holding = isSupply ? "supplied" : "of debt";
  const verb = isSupply ? "earn" : "cost";
  const summary =
    part === "amount"
      ? `The ${note.marketSymbol} this position held ${isSupply ? "supplied" : "as debt"} at the earlier touch ` +
        `(block ${note.from.block}) — the balance its row records there: the running total of the amounts its ` +
        `events moved on this side, before any interest. It is held still across the stretch, so the interest ` +
        `figures beside it move only the rate.`
      : `The yearly interest the ${note.marketSymbol} this position held ${holding} at block ${note.from.block} ` +
        `would ${verb} at the ${part === "before" ? "earlier" : "later"} rate (${pct(rate)} a year) — the amount ` +
        `times the rate. The chain never stated this figure: it holds the earlier touch's balance still and ` +
        `moves only the rate. What the position ${isSupply ? "earned" : "paid"} is what the reserve's index did ` +
        `to the balance across the stretch, which ${
          part === "after" && note.live ? "this position's next touch will record" : "the position's next row records"
        }.`;
  const derived = part !== "amount";
  return {
    kind: derived ? "chain-derived" : "chain",
    pclass: derived ? "indexed" : "emitted",
    summary,
    contract: poolOf(note),
    ...(derived
      ? {
          via: "the balance this position's earlier touch recorded × the rate at this end",
          formula: "amount at A × rate",
        }
      : { via: `${isSupply ? "supplyAfter" : "debtAfter"} on the position's row at the earlier touch` }),
    verify: {
      kind: "recompute",
      text:
        part === "amount"
          ? `Open this position's touch at block ${note.from.block} on this page: the ${note.marketSymbol} balance it states is the figure the interest leaves are built from.`
          : `Take the ${note.marketSymbol} balance this position's touch at block ${note.from.block} states and multiply by ${pct(rate)}. The chain never asked this question; the position's next row is what happened.`,
    },
    inputs: [
      {
        label: isSupply ? "supplied at A" : "debt at A",
        value: interest ? String(interest.debt) : undefined,
        kind: "chain",
        pclass: "emitted",
        note: `this position's \`${isSupply ? "supplyAfter" : "debtAfter"}\` at block ${note.from.block}`,
      },
      ...(part === "amount"
        ? []
        : [
            {
              label: `rate ${part}`,
              value: pct(rate),
              kind: "chain" as const,
              pclass: (part === "after" && note.live ? "state" : "emitted") as "state" | "emitted",
              note: rateLeafNote(note, part === "before" ? "earlier" : "later"),
              contract: poolOf(note),
            },
          ]),
    ],
  };
};
