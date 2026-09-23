// Receipts for a MakerDAO rate-step market note — the ilk's stability fee
// between two of a vault's own touches, and the yearly interest the earlier
// touch's own debt would cost at each end's fee.
// ----------------------------------------------------------------------------
// Shaped after lib/polaris/market-note-provenance.ts (the rate-step precedent):
// one builder per figure family, each returning the same Provenance shape
// whichever face of the sentence it backs. What the receipts have to answer is
// different in one important way, and every leaf below turns on it:
//
//   MAKER STATES NO RATE ANYWHERE A ROW CAN CARRY IT. A polaris touch carries
//   `primaryRate` and its receipt only has to name which PrimaryRateSet the
//   figure came from. A Maker frob carries no fee at all: governance files a
//   `duty` on the Jug, the spell's own block is not indexed, and the only
//   evidence in the index is the Vat's rate accumulator moving. So the
//   HISTORICAL end names a DRIP — the first Jug.drip that compounded at a new
//   duty, reached through /api/makerdao/ilks/<ilk>/rate-log — and the LIVE end
//   names the head read of the same `base + duty` the vault overlay takes.
//
// Both ends are therefore stated as the SAME QUANTITY (the Jug's per-second
// rate compounded to a year), reached two ways, and each receipt says which way
// it took. Neither is an index or an average.
//
// Both are also `kind: "chain"` / `pclass: "state"`, which is worth saying
// plainly: the historical figure ARRIVES through one of our routes, but it is
// not the indexed derivation — the route confirms every set by reading the Jug
// at that set's own block, and the confirmed read is what the page states. A
// contract slot read at a named block is a chain fact whichever route carried
// it here. The route is named in each receipt's `via` and leaf note, so a
// reader can see the path without the kind overstating or understating it.

import type { Provenance } from "@/components/shared/provenance";
import type { MarketNotePoint, RateSetLog, RateStepNote } from "@/lib/shared/market-note";
import { makerRateEndLabel } from "@/lib/shared/market-note";
import { MAKER_ADDRESSES } from "@/lib/makerdao/asset-catalog";

const shortHex = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

const pct = (n: number): string =>
  `${(n * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** The ilk's own name where the note carries it, else the chip's symbol. */
const ilkOf = (note: RateStepNote): string => note.marketName ?? note.marketSymbol;

/** Every fee on this note was read from, or confirmed against, the Jug — so
 *  that is the contract every receipt names, whichever end it backs. */
const jugContract = (note: RateStepNote) => ({
  contract: { name: "MakerDAO Jug", address: note.marketAddress || MAKER_ADDRESSES.JUG },
});

/** The route the historical series comes from. */
const rateLogRoute = (note: RateStepNote): string => `GET /api/makerdao/ilks/${ilkOf(note)}/rate-log`;

const observedOf = (note: RateStepNote, which: "earlier" | "later"): RateSetLog | null =>
  which === "earlier" ? note.observed.from : note.observed.to;

const pointOf = (note: RateStepNote, which: "earlier" | "later"): MarketNotePoint =>
  which === "earlier" ? note.from : note.to;

/** One end of the step in prose: which of the vault's own touches it is. */
const touchClause = (point: MarketNotePoint): string =>
  `this vault's ${makerRateEndLabel(point)} at block ${point.block}`;

/**
 * How the fee at one end is named. The wording is the whole point of this
 * module: it must never suggest Maker emitted a rate log, and it must say
 * exactly what the drip proves and what the Jug read confirms.
 */
const rateLeafNote = (note: RateStepNote, which: "earlier" | "later"): string => {
  if (which === "later" && note.live) {
    return (
      `the Jug's own base + duty for this ilk, compounded over a year, read live at block ${note.to.block} ` +
      `(GET /api/chain/makerdao/vault/<id> · stabilityFeeApr) — the head, not a drip`
    );
  }
  const observed = observedOf(note, which);
  const clause = touchClause(pointOf(note, which));
  if (!observed) {
    return `${clause} — the ilk's last confirmed rate set at or before this touch's block`;
  }
  return (
    `${clause} — the fee in force there is the ilk's last rate set at or before it: the Jug.drip at block ` +
    `${observed.block} (tx ${shortHex(observed.txHash)}, log ${observed.logIndex}), the FIRST drip that compounded ` +
    `at that duty, whose own delta on the Vat's rate accumulator evidences the fee. Confirmed by reading ` +
    `Jug.ilks(ilk).duty + Jug.base() at that same block — the confirmed figure is the one stated`
  );
};

// BOTH ends are `kind: "chain"`, and that is not a shortcut. The build plan
// called the historical end "api" because it arrives through
// /api/makerdao/ilks/<ilk>/rate-log — but `ProvKind` has no such member, and
// more to the point the SERVED figure is not the indexed derivation: the route
// confirms every set by reading Jug.ilks(ilk).duty + Jug.base() AT THAT SET'S
// OWN BLOCK, and that read is what the page states. A contract slot read at a
// named block is `chain` / `state` under the chain-truth charter whichever
// route carried it here. What the two ends genuinely differ in — a past block
// against the head, a confirmed drip against a live read — is carried by `via`
// and by each leaf's own note, which name the route explicitly.
const rateLeaf = (note: RateStepNote, which: "earlier" | "later") => ({
  label: `rate ${which}`,
  value: pct(pointOf(note, which).value),
  kind: "chain" as const,
  pclass: "state" as const,
  note: rateLeafNote(note, which),
});

/**
 * The step itself: the two fees, the percentage-point move between them, the
 * two blocks, the elapsed time, or how many times governance reset the fee in
 * between. One builder, five faces, because the sentence states one fact in
 * several places and a reader who opens any of them should land on the same
 * two drips.
 */
export const makerRateStepProv = (
  note: RateStepNote,
  part: "rate" | "delta" | "blocks" | "elapsed" | "sets" | "steps",
): Provenance => {
  if (part === "elapsed") return elapsedProv(note);
  if (part === "sets") return setsProv(note);
  if (part === "steps") return stepsProv(note);
  const ilk = ilkOf(note);
  const summaryBase = note.live
    ? part === "rate"
      ? `The ${ilk} stability fee at each end of the stretch — the same quantity reached two ways. The earlier one ` +
        `is the fee in force at this vault's own last touch: the ilk's last rate set at or before it, derived from ` +
        `the Vat's own fold series and confirmed against the Jug at that set's block. The later one is the Jug's ` +
        `base + duty read LIVE at the chain head and compounded over a year. Governance sets the duty; nobody ` +
        `borrowing in this ilk chooses it. Nothing between the two is drawn, because this vault has transacted ` +
        `nothing since its own last touch.`
      : part === "delta"
        ? `How far the ${ilk} stability fee has moved since this vault's own last touch — the fee in force there ` +
          `against the Jug's own rate read live just now. It is the move in the fee alone: nothing about this ` +
          `vault's own collateral or debt enters it.`
        : `The block the stretch runs from, and the chain head it runs TO — this vault's own last touch, and the ` +
          `block the live Jug read answered at. The later block is not one the vault transacted in; it is simply ` +
          `the latest one Rails read the fee against.`
    : part === "rate"
      ? `The ${ilk} stability fee at each end of the stretch. MakerDAO indexes no fee — governance files a duty on ` +
        `the Jug and the spell's own block is not indexed — so the fee in force at a touch is the ilk's last RATE ` +
        `SET at or before it, and a set is the first Jug.drip that compounded at a new duty. Each set's figure is ` +
        `derived from that drip's own delta on the Vat's rate accumulator and then CONFIRMED by reading the Jug at ` +
        `the drip's block; the confirmed figure is what is stated here. Nothing between the two touches is drawn, ` +
        `because this vault transacted nothing between them.`
      : part === "delta"
        ? `How far the ${ilk} stability fee moved across the stretch — the later reading against the earlier one, ` +
          `both confirmed at the Jug at their own blocks. It is the move in the fee alone: nothing about this ` +
          `vault's own collateral or debt enters it.`
        : `The two blocks the stretch runs between — this vault's own ${makerRateEndLabel(note.from)} and ` +
          `${makerRateEndLabel(note.to)}. The stretch is bounded by the vault's own activity, not by a window: ` +
          `the fee is known at these two blocks because the vault was touched at each, and Rails states nothing ` +
          `about the fee's path in between beyond how many times it was reset.`;
  // A merged note's every face says so: the two ends are two touches with more
  // of this vault's own touches between them, and the receipt names each
  // stretch rather than leaving the reader to take the run on trust.
  const merged =
    note.members && note.members.length > 1
      ? ` This note states ${note.members.length.toLocaleString("en-US")} consecutive stretches that all moved the ` +
        `fee the same way as one, running from the first's earlier touch to the last's later one — ` +
        `${memberStretches(note)}.`
      : "";
  const summary = `${summaryBase}${merged}`;
  const value =
    part === "rate"
      ? `${pct(note.from.value)} → ${pct(note.to.value)}`
      : part === "delta"
        ? String(note.deltaPp)
        : `${note.from.block} → ${note.to.block}`;
  return {
    kind: "chain",
    pclass: "state",
    summary,
    ...jugContract(note),
    via: note.live
      ? `${rateLogRoute(note)} · sets[].aprPct as-of the touch · Jug.base() + Jug.ilks(ilk).duty read live`
      : `${rateLogRoute(note)} · sets[].aprPct, confirmed at each set's own block`,
    ...(part === "delta" ? { formula: "(rate after − rate before) × 100" } : {}),
    verify: {
      kind: "recompute",
      text: note.live
        ? `Read Jug.ilks("${ilk}").duty + Jug.base() at block ${note.observed.from?.block ?? note.from.block} for the ` +
          `earlier fee — ((base + duty) ÷ 1e27)^31536000 − 1 — and re-read the same two at head for the later one; ` +
          `it moves, so an exact repeat is not expected.`
        : `Read Jug.ilks("${ilk}").duty + Jug.base() against an archive node at blocks ` +
          `${note.observed.from?.block ?? note.from.block} and ${note.observed.to?.block ?? note.to.block} — ` +
          `((base + duty) ÷ 1e27)^31536000 − 1 is the fee at each end.`,
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
          ? `this vault's own last touch (${note.from.block}) and the block the live Jug read answered at (${note.to.block})`
          : `this vault's own two touches — ${note.from.block} and ${note.to.block}`,
      },
    ],
  };
};

/** Every stretch a merged note took in, written out — "21,145,878 → 21,301,204,
 *  1.50% → 3.25%" — so a receipt can hand back the steps the header states as
 *  one. Empty on a note that merged nothing. */
const memberStretches = (note: RateStepNote): string =>
  (note.members ?? [])
    .map(
      (m) =>
        `${m.fromBlock.toLocaleString("en-US")} → ${m.toBlock.toLocaleString("en-US")}, ` +
        `${pct(m.fromValue)} → ${pct(m.toValue)}`,
    )
    .join("; ");

/**
 * A merged note's own count: how many consecutive same-direction stretches this
 * one note states. The rule is the selector's, not a judgement about the ilk —
 * steps that moved the fee the same way, one after another, with a step the
 * other way ending the run — and the figure's receipt lists each of them, so
 * nothing the header collapsed is unrecoverable.
 *
 * It is sound on Maker because the ilk's fee RATCHETS inside a governance
 * cycle: first-to-last is the true span, never less than a member of the run.
 */
const stepsProv = (note: RateStepNote): Provenance => {
  const ilk = ilkOf(note);
  return {
    kind: "derived",
    pclass: "indexed",
    summary:
      `How many of this vault's own stretches this note states as one. Each of them moved the ${ilk} stability fee ` +
      `at least a percentage point the same way, one after another, so they are one run: the note runs from the ` +
      `first stretch's earlier touch to the last stretch's later one, and the fees it states are the confirmed fees ` +
      `at those two ends. A stretch that moved the fee the other way ends the run and begins the next note; a move ` +
      `too small to be stated at all never breaks one. The steps themselves are listed below.`,
    ...jugContract(note),
    via: "consecutive same-direction stretches between this vault's own touches",
    formula: "one note per run of stretches whose move shares a sign",
    verify: {
      kind: "recompute",
      text:
        `Open ${rateLogRoute(note)}, take the ilk's last confirmed rate set at or before each of this vault's own ` +
        `touches in block order, and mark every consecutive pair whose fee moved at least one percentage point; the ` +
        `${note.steps ?? 0} marked pairs listed below run ${note.deltaPp < 0 ? "down" : "up"} without interruption, ` +
        `and this note is that run.`,
    },
    inputs: [
      {
        label: "steps merged",
        value: String(note.steps ?? 1),
        kind: "derived",
        pclass: "indexed",
        note: "consecutive stretches, all moving the fee the same way",
      },
      {
        label: "the steps",
        value: memberStretches(note) || undefined,
        kind: "chain",
        pclass: "state",
        note: "each stretch's own two touches and the fee confirmed at the Jug for each",
      },
    ],
  };
};

/**
 * How many times governance reset the fee between the vault's two touches —
 * the difference of each end's rate set's own ordinal in the ilk's confirmed
 * log. Only CONFIRMED sets are counted: a derived set the Jug says was never a
 * change (the fold series has a gap on the busy ilks) is listed as an artefact
 * by the route and never enters this count.
 */
const setsProv = (note: RateStepNote): Provenance => {
  const from = note.observed.from;
  const to = note.observed.to;
  const ilk = ilkOf(note);
  return {
    kind: "derived",
    pclass: "indexed",
    summary:
      `How many times governance reset the ${ilk} stability fee between this vault's two touches — the difference ` +
      `of each end's rate set's own ordinal in the ilk's log. Only sets the Jug CONFIRMED as a change are counted: ` +
      `the Vat's fold series has a gap on the busy ilks, and a derived set the Jug says never moved the duty is ` +
      `listed as an artefact by the route rather than counted here. Nothing about any of those resets is drawn on ` +
      `this page; only their number is stated.`,
    ...jugContract(note),
    via: "ordinal(rate set at the later touch) − ordinal(rate set at the earlier touch)",
    formula: "to.ordinal − from.ordinal",
    verify: {
      kind: "recompute",
      text:
        from && to
          ? `Open ${rateLogRoute(note)} and count the sets strictly after block ${from.block} log ${from.logIndex} and at or before block ${to.block} log ${to.logIndex} — the count is this figure.`
          : `Open ${rateLogRoute(note)} and count the sets between the fees in force at this vault's two touches.`,
    },
    inputs: [
      {
        label: "ordinal before",
        value: from ? String(from.ordinal) : undefined,
        kind: "derived",
        pclass: "indexed",
        note: from ? `confirmed rate sets at or before block ${from.block} log ${from.logIndex}` : undefined,
      },
      {
        label: "ordinal after",
        value: to ? String(to.ordinal) : undefined,
        kind: "derived",
        pclass: "indexed",
        note: to ? `confirmed rate sets at or before block ${to.block} log ${to.logIndex}` : undefined,
      },
    ],
  };
};

/**
 * The time between the two touches: the difference of the two events' block
 * timestamps, each the header of the block the touch sits in. Exact — not a
 * block count times an assumed block time — and silent about where inside the
 * stretch the fee actually moved.
 */
const elapsedProv = (note: RateStepNote): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  summary: note.live
    ? `The time since the earlier touch — the block the live Jug read answered at, less the block header of this ` +
      `vault's last touch. Exact, not an estimate from a block count. It grows on every reload.`
    : `The time between the two touches — the later block's timestamp less the earlier's, both read from the ` +
      `headers of the blocks this vault's two touches sit in. Exact, not an estimate from a block count. It bounds ` +
      `when the fee moved and says nothing about where inside the stretch it did.`,
  ...jugContract(note),
  via: note.live
    ? "this vault's own block header · the head block's timestamp at read time"
    : "block headers · timestamp at each touch",
  formula: "timestamp after − timestamp before",
  verify: {
    kind: "recompute",
    text: note.live
      ? `Open this vault's own last touch on this page for block ${note.from.block}'s timestamp, and read the head block's at read time; subtract the two.`
      : `Open each block on the chain's explorer — ${note.from.block} and ${note.to.block} — and subtract the two timestamps; or read the two touches' own dates on this page.`,
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
 * What the fee move meant for this vault: the yearly interest its own debt at
 * the earlier touch would cost at each end's fee. `before`/`after` are the one
 * pair of figures here the chain never stated — they hold that debt fixed and
 * move only the fee. Interest actually charged is carried in the ilk's rate
 * accumulator and lands on the vault's own next touch; this figure is silent
 * about it.
 */
export const makerRateStepInterestProv = (note: RateStepNote, part: "debt" | "before" | "after"): Provenance => {
  const interest = note.interest;
  const sym = interest?.symbol ?? note.marketSymbol;
  const rate = part === "after" ? note.to.value : note.from.value;
  const derived = part !== "debt";
  const summary =
    part === "debt"
      ? `The ${sym} debt this vault recorded at the earlier touch (block ${note.from.block}) — its own normalized ` +
        `art at that row multiplied by the Vat rate accumulator in force at that block, both on the row. That is ` +
        `the DAI the vault actually owed then, not a head-rate approximation. Held fixed across the stretch: the ` +
        `interest figures beside it move only the fee.`
      : `The yearly interest this vault's debt at block ${note.from.block} would cost at the ` +
        `${part === "before" ? "earlier" : "later"} fee (${pct(rate)} per year) — debt × fee. The chain never stated ` +
        `this figure: it holds the earlier touch's own debt fixed and moves only the fee. Interest actually charged ` +
        `is compounded continuously into the ilk's rate accumulator and settles on ${
          part === "after" && note.live ? "this vault's own next touch, once it happens" : "the vault's own next touch"
        }.`;
  return {
    kind: derived ? "chain-derived" : "chain",
    pclass: derived ? "indexed" : "emitted",
    summary,
    ...jugContract(note),
    ...(derived
      ? { via: "this vault's own recorded debt × the fee at this end", formula: "debt at A × fee" }
      : { via: "the row's own art × rate_at_block", formula: "artAfter × rateAtBlock ÷ 1e27" }),
    verify: {
      kind: "recompute",
      text:
        part === "debt"
          ? `Open this vault's own touch at block ${note.from.block} on this page: its normalized art times the rate accumulator at that block is the figure the interest leaves are built from.`
          : `Take the debt this vault's touch at block ${note.from.block} states, multiply by ${pct(rate)}. The chain never asked this question; the vault's own next touch is what actually happened.`,
    },
    inputs: [
      {
        label: "debt at A",
        value: interest ? String(interest.debt) : undefined,
        kind: "chain-derived",
        pclass: "indexed",
        note: `this vault's own artAfter × rateAtBlock ÷ 1e27 at block ${note.from.block}`,
      },
      ...(part === "debt"
        ? []
        : [
            {
              label: `rate ${part}`,
              value: pct(rate),
              kind: "chain" as const,
              pclass: "state" as const,
              note: rateLeafNote(note, part === "before" ? "earlier" : "later"),
            },
          ]),
    ],
  };
};
