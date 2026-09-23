// Receipts for a Polaris market note — the primary-rate step between two of a
// CDP's own touches, and the yearly interest that earlier touch's own debt
// would cost at each end's rate.
// ----------------------------------------------------------------------------
// Unlike the other two kinds of note, BOTH ends here are the position's own
// events: the rate is already on each row (`context.data.primaryRate`, the
// market's last PrimaryRateSet at or before that touch — the as-of join
// `lib/sources/api/polaris-timeline.ts` performs), so a rate step costs
// nothing new to observe. What its receipts have to answer is different: WHICH
// PrimaryRateSet log a rate was read from, and that the wallet who fired it (a
// PSM user) did nothing to this CDP. `rateInForceProv` in
// lib/polaris/event-provenance.ts is the receipt the event card's own rate
// line carries; the leaves below restate its wording for the note's two ends
// rather than claiming a second source, and name the log when the backend's
// per-row join has it.
//
// Shaped after lib/liquity/market-note-provenance.ts (the price-gap
// precedent, itself shaped after Moonwell's share-rate-step receipts) — one
// builder per figure family, each returning the same Provenance shape
// whichever face of the sentence it backs.

import type { Provenance } from "@/components/shared/provenance";
import type { MarketNotePoint, PriceGapNote, RateSetLog, RateStepNote } from "@/lib/shared/market-note";
import { polarisEndLabel, priceDecimals, priceGapReason } from "@/lib/shared/market-note";
import { POLARIS_MARKET_CONFIG, type PolarisMarket } from "./asset-catalog";

const shortHex = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

const pct = (n: number): string =>
  `${(n * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** The pETH price, at the grain the note's own pair separates at — the shared
 *  rule, so a receipt can never state two ends the stat card shows apart as
 *  one figure twice (lib/shared/market-note.ts). */
const formatPrice = (n: number, decimals: number = 2): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const contractOf = (note: RateStepNote) => ({
  contract: { name: `Polaris ${note.marketSymbol} CDPManager`, address: note.marketAddress },
});

/** One end of the step in prose: which of the CDP's own touches it is. */
const touchClause = (point: MarketNotePoint): string => `this CDP's ${polarisEndLabel(point)} at block ${point.block}`;

const observedOf = (note: RateStepNote, which: "earlier" | "later"): RateSetLog | null =>
  which === "earlier" ? note.observed.from : note.observed.to;

const pointOf = (note: RateStepNote, which: "earlier" | "later"): MarketNotePoint =>
  which === "earlier" ? note.from : note.to;

/** How the rate at one end of a step is named — the actual PrimaryRateSet log
 *  when the backend's per-row join has it, the as-of rule alone when it does
 *  not. A note built before the join lands states the rate no differently;
 *  it only names the log less precisely. */
const rateLeafNote = (note: RateStepNote, which: "earlier" | "later"): string => {
  if (which === "later" && note.live) {
    return `the cdpManager's own primary rate component of getInterestRate(), read live at block ${note.to.block}`;
  }
  const observed = observedOf(note, which);
  const clause = touchClause(pointOf(note, which));
  if (!observed) {
    return `${clause} — the cdpManager's last PrimaryRateSet at or before this touch's block, newPrimaryRate ÷ 1e18`;
  }
  return (
    `${clause} — the cdpManager's PrimaryRateSet at block ${observed.block} (tx ${shortHex(observed.txHash)}, log ` +
    `${observed.logIndex}), newPrimaryRate ÷ 1e18, fired by ${shortHex(observed.txFrom)} — a PSM user, unrelated ` +
    `to this CDP — inside that PSM mint or redemption, never inside a CDP touch`
  );
};

const rateLeaf = (note: RateStepNote, which: "earlier" | "later") => ({
  label: `rate ${which}`,
  value: pct(pointOf(note, which).value),
  kind: "chain" as const,
  pclass: "emitted" as const,
  note: rateLeafNote(note, which),
});

/**
 * The step itself: the two rates, the percentage-point move between them, the
 * two blocks, the elapsed time, or how many times the market reset the rate
 * in between. One builder, five faces, because the sentence states one fact
 * in several places and a reader who opens any of them should land on the
 * same two logs.
 */
export const rateStepProv = (
  note: RateStepNote,
  part: "rate" | "delta" | "blocks" | "elapsed" | "sets" | "steps",
): Provenance => {
  if (part === "elapsed") return elapsedProv(note);
  if (part === "sets") return setsProv(note);
  if (part === "steps") return stepsProv(note);
  const pair = `${note.marketSymbol} market's primary rate`;
  const summaryBase = note.live
    ? part === "rate"
      ? `The ${pair} at each end of the stretch — the earlier one is its last PrimaryRateSet at or before this CDP's ` +
        `own last touch, the same as-of figure already on that touch's row; the later one is the cdpManager's own ` +
        `rate read live, at the chain head. Algorithmic: the market sets it on the PSM's mints and redemptions, ` +
        `never chosen by the holder. Nothing between the two is drawn, because this CDP has transacted nothing ` +
        `since its own last touch.`
      : part === "delta"
        ? `How far the ${pair} has moved since this CDP's own last touch — its own as-of figure against the ` +
          `cdpManager's rate read live just now. It is the move in the rate alone: nothing about this CDP's own ` +
          `debt or collateral enters it.`
        : `The block the stretch runs from, and the chain head it runs TO — this CDP's own last touch, and the ` +
          `block the live read answered at. The later block is not one the CDP transacted in; it is simply the ` +
          `latest one Rails could read the rate against.`
    : part === "rate"
      ? `The ${pair} at each end of the stretch — its last PrimaryRateSet at or before this CDP's own two touches, ` +
        `the same as-of figure already on each touch's own row. Algorithmic: the market sets it on the PSM's mints ` +
        `and redemptions, never chosen by the holder — the wallet that fired either log did nothing to this CDP. ` +
        `The secondary, utilisation-driven rate is added on top and is not on this log. Nothing between the two ` +
        `touches is drawn, because this CDP transacted nothing between them.`
      : part === "delta"
        ? `How far the ${pair} moved across the stretch — the later reading against the earlier one, both the ` +
          `as-of figure already on this CDP's own two touches. It is the move in the rate alone: nothing about ` +
          `this CDP's own debt or collateral enters it.`
        : `The two blocks the stretch runs between — this CDP's own ${polarisEndLabel(note.from)} and ` +
          `${polarisEndLabel(note.to)}. The stretch is bounded by the CDP's own activity, not by a window: the ` +
          `rate is known at these two blocks because the CDP was touched at each, and Rails states nothing about ` +
          `the rate's path in between.`;
  // A merged note's every face says so: the two ends are two touches with more
  // of this CDP's own touches between them, and the receipt names each stretch
  // rather than leaving the reader to take the run on trust.
  const merged =
    note.members && note.members.length > 1
      ? ` This note states ${note.members.length.toLocaleString("en-US")} consecutive stretches that all moved the ` +
        `rate the same way as one, running from the first's earlier touch to the last's later one — ` +
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
    pclass: "emitted",
    summary,
    ...contractOf(note),
    via: note.live
      ? "the CDP's own last PrimaryRateSet as-of figure · cdpManager.getInterestRate() at read time"
      : "PrimaryRateSet · newPrimaryRate ÷ 1e18, as-of each touch's block",
    ...(part === "delta" ? { formula: "(rate after − rate before) × 100" } : {}),
    verify: {
      kind: "recompute",
      text: note.live
        ? `Find the cdpManager's last PrimaryRateSet at or before ${touchClause(note.from)} for the earlier rate; ` +
          `re-read getInterestRate() on the cdpManager for the later one — it moves, so an exact repeat is not ` +
          `expected.`
        : `Find the cdpManager's last PrimaryRateSet at or before each of ${touchClause(note.from)} and ${touchClause(note.to)} — newPrimaryRate ÷ 1e18 is the rate at that end.`,
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
          ? `this CDP's own last touch (${note.from.block}) and the block the live read answered at (${note.to.block})`
          : `this CDP's own two touches — ${note.from.block} and ${note.to.block}`,
      },
    ],
  };
};

/** Every stretch a merged note took in, written out — "11,533,686 → 11,533,697,
 *  2.11% → 3.93%" — so a receipt can hand back the steps the header states as
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
 * A merged note's own count: how many consecutive same-direction stretches
 * this one note states. The rule is the selector's, not a judgement about the
 * market — steps that moved the rate the same way, one after another, with a
 * step the other way ending the run — and the figure's receipt lists each of
 * them, so nothing the header collapsed is unrecoverable.
 */
const stepsProv = (note: RateStepNote): Provenance => ({
  kind: "derived",
  pclass: "indexed",
  summary:
    `How many of this CDP's own stretches this note states as one. Each of them moved the ${note.marketSymbol} ` +
    `market's primary rate at least a percentage point the same way, one after another, so they are one run: the ` +
    `note runs from the first stretch's earlier touch to the last stretch's later one, and the rate it states is ` +
    `the rate at those two ends. A stretch that moved the rate the other way ends the run and begins the next ` +
    `note; a move too small to be stated at all never breaks one. The steps themselves are listed below.`,
  ...contractOf(note),
  via: "consecutive same-direction stretches between this CDP's own touches",
  formula: "one note per run of stretches whose move shares a sign",
  verify: {
    kind: "recompute",
    text:
      `Read this CDP's own touches in block order, take the primary rate on each, and mark every consecutive pair ` +
      `whose rate moved at least one percentage point; the ${note.steps ?? 0} marked pairs listed below run ` +
      `${note.deltaPp < 0 ? "down" : "up"} without interruption, and this note is that run.`,
  },
  inputs: [
    {
      label: "steps merged",
      value: String(note.steps ?? 1),
      kind: "derived",
      pclass: "indexed",
      note: "consecutive stretches, all moving the rate the same way",
    },
    {
      label: "the steps",
      value: memberStretches(note) || undefined,
      kind: "chain",
      pclass: "emitted",
      note: "each stretch's own two touches and the rate in force at each",
    },
  ],
});

/**
 * How many times the market reset its primary rate between the CDP's two
 * touches — the difference of each observed PrimaryRateSet's own ordinal
 * (the count of the market's PrimaryRateSet rows at or before it). Present
 * only when both ends are observed; nothing about any of the resets in
 * between is drawn, only their count.
 */
const setsProv = (note: RateStepNote): Provenance => {
  const from = note.observed.from;
  const to = note.observed.to;
  return {
    kind: "derived",
    pclass: "indexed",
    summary:
      `How many times the ${note.marketSymbol} market reset its primary rate between the CDP's two touches — the ` +
      `difference of each observed PrimaryRateSet's own ordinal (the count of the market's PrimaryRateSet rows at ` +
      `or before it, rails-server's per-row join). Nothing about any of those resets is drawn on this page; only ` +
      `the count is stated.`,
    ...contractOf(note),
    via: "ordinal(PrimaryRateSet at the later touch) − ordinal(PrimaryRateSet at the earlier touch)",
    formula: "to.ordinal − from.ordinal",
    verify: {
      kind: "recompute",
      text:
        from && to
          ? `Count the cdpManager's PrimaryRateSet logs strictly after block ${from.block} log ${from.logIndex} and at or before block ${to.block} log ${to.logIndex} — the count is this figure.`
          : `Count the cdpManager's PrimaryRateSet logs between the rate observed at each of this CDP's two touches.`,
    },
    inputs: [
      {
        label: "ordinal before",
        value: from ? String(from.ordinal) : undefined,
        kind: "derived",
        pclass: "indexed",
        note: from ? `PrimaryRateSet count at or before block ${from.block} log ${from.logIndex}` : undefined,
      },
      {
        label: "ordinal after",
        value: to ? String(to.ordinal) : undefined,
        kind: "derived",
        pclass: "indexed",
        note: to ? `PrimaryRateSet count at or before block ${to.block} log ${to.logIndex}` : undefined,
      },
    ],
  };
};

/**
 * The time between the two touches: the difference of the two events' block
 * timestamps, each the header of the block the touch sits in. Exact — not a
 * block count times an assumed block time — and silent about where inside
 * the stretch the rate actually moved.
 */
const elapsedProv = (note: RateStepNote): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  summary: note.live
    ? `The time since the earlier touch — the chain head's own timestamp at read time less the block header of ` +
      `this CDP's last touch. Exact, not an estimate from a block count. It grows on every reload.`
    : `The time between the two touches — the later block's timestamp less the earlier's, both read from the ` +
      `headers of the blocks this CDP's two touches sit in. Exact, not an estimate from a block count. It bounds ` +
      `when the rate moved and says nothing about where inside the stretch it did.`,
  ...contractOf(note),
  via: note.live
    ? "this CDP's own block header · the chain head's timestamp at read time"
    : "block headers · timestamp at each touch",
  formula: "timestamp after − timestamp before",
  verify: {
    kind: "recompute",
    text: note.live
      ? `Open this CDP's own last touch on this page for block ${note.from.block}'s timestamp, and read the chain head's at read time; subtract the two.`
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
 * What the rate move meant for this CDP: the yearly interest its own debt at
 * the earlier touch would cost at each end's rate. `before`/`after` are the
 * one pair of figures here the chain never stated — they hold that debt
 * fixed and move only the rate, the same "what that state came to be worth"
 * framing as the Liquity V2 price gap's `crAfter`. Interest actually charged
 * is whatever the CDP's own next touch states on its own `_accruedInterest`
 * leg; this figure is silent about it.
 */
export const rateStepInterestProv = (note: RateStepNote, part: "debt" | "before" | "after"): Provenance => {
  const interest = note.interest;
  const rate = part === "after" ? note.to.value : note.from.value;
  const summary =
    part === "debt"
      ? `${note.marketSymbol} of debt this CDP recorded at the earlier touch (block ${note.from.block}) — the ` +
        `same \`_newDebt\` that touch's own row states. Held fixed across the stretch: the interest figures beside ` +
        `it move only the rate.`
      : `The yearly interest this CDP's debt at block ${note.from.block} would cost at the ${part === "before" ? "earlier" : "later"} ` +
        `rate (${pct(rate)} per year) — debt × rate. The chain never stated this figure: it holds the earlier ` +
        `touch's own debt fixed and moves only the rate; interest actually charged is whatever ${
          part === "after" && note.live
            ? "this CDP's own next touch will eventually state on its own `_accruedInterest` leg, once it happens"
            : "the CDP's own next touch states on its own `_accruedInterest` leg"
        }.`;
  const derived = part !== "debt";
  return {
    kind: derived ? "chain-derived" : "chain",
    pclass: derived ? "indexed" : "emitted",
    summary,
    ...contractOf(note),
    ...(derived
      ? { via: "this CDP's own recorded debt × the rate at this end", formula: "debt at A × rate" }
      : { via: "CDPUpdated · _newDebt" }),
    verify: {
      kind: "recompute",
      text:
        part === "debt"
          ? `Open this CDP's own touch at block ${note.from.block} on this page: the debt it states is the figure the interest leaves are built from.`
          : `Take the debt this CDP's touch at block ${note.from.block} states, multiply by ${pct(rate)}. The chain never asked this question; the CDP's own next touch is what actually happened.`,
    },
    inputs: [
      {
        label: "debt at A",
        value: interest ? String(interest.debt) : undefined,
        kind: "chain",
        pclass: "emitted",
        note: `this CDP's own \`_newDebt\` at block ${note.from.block}`,
      },
      ...(part === "debt"
        ? []
        : [
            {
              label: `rate ${part}`,
              value: pct(rate),
              kind: "chain" as const,
              pclass: "emitted" as const,
              note: rateLeafNote(note, part === "before" ? "earlier" : "later"),
            },
          ]),
    ],
  };
};

// ── the Polaris price gap ────────────────────────────────────────────────────
// Shaped after lib/liquity/market-note-provenance.ts's own price-gap
// receipts, restated for a CDP rather than a trove: the price is the
// market's own price feed at the end of each touch's block
// (`priceAtBlock.pethInDebt`, the oracle-at-block lane — `atBlockPriceProv`
// in lib/polaris/event-provenance.ts is the receipt the event card's own
// price pill carries), and the position figures come from the CDP's own
// CDPUpdated log rather than a trove's. Polaris has no redemption row of its
// own, so `note.endedBy` here is only ever "adjustment" or "liquidation".

const managerContract = (market: PolarisMarket) => ({
  name: `Polaris ${POLARIS_MARKET_CONFIG[market].stable.symbol} CDPManager`,
  address: POLARIS_MARKET_CONFIG[market].cdpManager,
});

const feedContract = (note: PriceGapNote, market: PolarisMarket) => ({
  name: `Polaris ${POLARIS_MARKET_CONFIG[market].stable.symbol} price feed`,
  address: note.marketAddress || POLARIS_MARKET_CONFIG[market].priceFeed,
});

/** `decimals` is the note's own grain (`priceDecimals`), so a receipt states
 *  its end exactly as the stat card beside it does. */
const polarisPriceLeaf = (
  p: MarketNotePoint,
  which: "earlier" | "later",
  stable: string,
  decimals: number,
  live = false,
) => ({
  label: `price ${which}`,
  value: formatPrice(p.value, decimals),
  kind: "chain" as const,
  pclass: "oracle" as const,
  note: live
    ? `the market's own price feed, read live via GET /api/chain/polaris/position at the chain head block ${p.block} (${stable} per pETH)`
    : `this CDP's ${polarisEndLabel(p)} at block ${p.block} — the market's own price feed previewPrice() at the end of that block (${stable} per pETH), read by the oracle-at-block lane`,
});

/**
 * The gap itself: the two prices, the change between them, or the two
 * blocks. One builder, three faces — the polaris twin of `priceGapProv`.
 */
export const polarisPriceGapProv = (
  note: PriceGapNote,
  part: "price" | "change" | "blocks" | "elapsed",
): Provenance => {
  const market = note.polarisMarket!;
  const stable = POLARIS_MARKET_CONFIG[market].stable.symbol;
  if (part === "elapsed") return polarisPriceGapElapsedProv(note, market);
  const summary = note.live
    ? part === "price"
      ? `The pETH price in ${stable} at each end of the stretch — the earlier one is the market's own price feed previewPrice() at this CDP's own last priced touch, read by the oracle-at-block lane; the later one is the same price feed read LIVE, via GET /api/chain/polaris/position, at the chain head. Nothing between them is drawn, because this CDP has transacted nothing since its own last touch.`
      : part === "change"
        ? `How far the pETH price has moved since this CDP's own last priced touch — its own recorded reading against the price feed's live read just now. It is the move in the price alone: this CDP's collateral and debt are whatever its own log recorded at that touch, and no interest or PSM share moved in this figure.`
        : `The block the stretch runs from, and the chain head it runs TO — this CDP's own last priced touch, and the block GET /api/chain/polaris/position answered at read time. The later block is not one the CDP transacted in.`
    : part === "price"
      ? `The pETH price in ${stable} at each end of the stretch — the market's own price feed previewPrice() at the end of each block, read by the oracle-at-block lane, the same figure the event card at that block states. Both are historic readings, immutable at their blocks, not live quotes. Nothing between the two is drawn, because this CDP transacted nothing between them and the index states no price where it did not.`
      : part === "change"
        ? `How far the pETH price moved across the stretch — the later reading against the earlier one. It is the move in the price alone: this CDP's collateral and debt are whatever its own log recorded at the earlier touch, and no interest or PSM share moved in this figure.`
        : `The two blocks the stretch runs between — the blocks of this CDP's own two touches the readings come from. The stretch is bounded by the CDP's own activity: the price is known at these two blocks because the CDP was touched at each, and Rails states nothing about its path in between.`;
  const value =
    part === "price"
      ? `${formatPrice(note.from.value, priceDecimals(note))} → ${formatPrice(note.to.value, priceDecimals(note))}`
      : part === "change"
        ? String(note.changePct)
        : `${note.from.block} → ${note.to.block}`;
  return {
    kind: "chain",
    pclass: "oracle",
    summary,
    contract: feedContract(note, market),
    via: note.live
      ? "this CDP's own priceAtBlock at its last touch · previewPrice() live via GET /api/chain/polaris/position"
      : "this CDP's own two touches' priceAtBlock · previewPrice() at each block",
    ...(part === "change" ? { formula: "later price ÷ earlier price − 1" } : {}),
    verify: {
      kind: "recompute",
      text: note.live
        ? `Open this CDP's own last priced touch on this page for the earlier figure; re-read GET /api/chain/polaris/position for the later one and its block — both move, so an exact repeat is not expected. The stretch is stated because ${priceGapReason(note)}.`
        : `Re-run previewPrice() on the ${stable} price feed at blocks ${note.from.block} and ${note.to.block} against an archive node — they are the two figures here. The stretch is stated because ${priceGapReason(note)}.`,
    },
    inputs: [
      polarisPriceLeaf(note.from, "earlier", stable, priceDecimals(note)),
      polarisPriceLeaf(note.to, "later", stable, priceDecimals(note), note.live),
      {
        label: "blocks",
        value: `${note.from.block} → ${note.to.block}`,
        kind: "chain",
        pclass: "emitted",
        note: note.live
          ? `this CDP's own last touch (${note.from.block}) and the chain head GET /api/chain/polaris/position answered at read time (${note.to.block})`
          : `this CDP's own two touches — ${note.from.block} and ${note.to.block}`,
      },
    ],
  };
};

const polarisPriceGapElapsedProv = (note: PriceGapNote, market: PolarisMarket): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  summary:
    `The time between the two touches — the later block's timestamp less the earlier's, both read from the ` +
    `headers of the blocks this CDP's two touches sit in. Exact, not an estimate from a block count. It bounds ` +
    `when the price moved and says nothing about where inside the stretch it did.`,
  contract: feedContract(note, market),
  via: "block headers · timestamp at each touch",
  formula: "timestamp after − timestamp before",
  verify: {
    kind: "recompute",
    text: `Open each block on the chain's explorer — ${note.from.block} and ${note.to.block} — and subtract the two timestamps; or read the two touches' own dates on this page.`,
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
 * What the move meant for this CDP: the collateral ratio the earlier touch's
 * own collateral and debt made at each end's price, and the market's
 * NORMAL-MODE minimum they are read against — the polaris twin of
 * `priceGapPositionProv`. A defensive-mode minimum can be in force at a
 * block in the CDP's history, but it is not indexed, so `mcr` always states
 * the normal-mode figure regardless of which was actually enforced then.
 */
export const polarisPriceGapPositionProv = (
  note: PriceGapNote,
  part: "state" | "crBefore" | "crAfter" | "mcr",
): Provenance => {
  const market = note.polarisMarket!;
  const stable = POLARIS_MARKET_CONFIG[market].stable.symbol;
  const p = note.position;
  const end = part === "crAfter" ? note.to : note.from;
  const stateLeaves = [
    {
      label: "collateral",
      value: p ? String(p.coll) : undefined,
      kind: "chain" as const,
      pclass: "emitted" as const,
      note: `this CDP's own CDPUpdated \`_newColl\` at block ${p?.atBlock}`,
    },
    {
      label: "debt",
      value: p ? String(p.debt) : undefined,
      kind: "chain" as const,
      pclass: "emitted" as const,
      note: `this CDP's own CDPUpdated \`_newDebt\` at block ${p?.atBlock}`,
    },
  ];
  const summary =
    part === "mcr"
      ? `The market's normal-mode minimum collateral ratio — MCR() on the cdpManager, the same constant every liquidation on this market is enforced against outside defensive mode. A defensive-mode minimum can be in force at points in this CDP's history but is not indexed here, so this always states the normal-mode figure, whichever was actually enforced at the time.`
      : part === "state"
        ? `The block the position figures are read from — this CDP's earlier touch, the last one before the later price. Nothing is read at any block between the two: the CDP transacted at neither end of a stretch it did nothing in.`
        : part === "crBefore"
          ? `This CDP's collateral ratio at the earlier touch — the collateral and debt its own CDPUpdated log recorded at block ${p?.atBlock}, against the pETH price at that block. A reading of the position as it stood, not a projection.`
          : note.live
            ? `The same collateral and debt at the live price — what the ratio recorded at block ${p?.atBlock} is worth now that the pETH price reads ${formatPrice(note.to.value, priceDecimals(note))}. The chain was never asked this: the CDP has done nothing since that touch, so nothing recorded it. Only the price moves; interest has kept accruing since.`
            : `The same collateral and debt at the later price — what the ratio recorded at block ${p?.atBlock} came to be worth once the pETH price was ${formatPrice(note.to.value, priceDecimals(note))}. The chain was never asked this: the CDP did nothing between the two touches, so nothing recorded it. Only the price moves between the two figures; interest kept accruing across the stretch, and this CDP's own next touch states where the debt actually stood.`;
  const derived = part === "crBefore" || part === "crAfter";
  return {
    kind: derived ? "chain-derived" : "chain",
    pclass: part === "mcr" ? "indexed" : derived ? "state" : "emitted",
    summary,
    ...(part === "mcr" ? {} : { contract: managerContract(market) }),
    ...(derived
      ? {
          via: "the earlier touch's own recorded collateral and debt × the price at this end",
          formula: "(collateral × price) ÷ debt × 100",
        }
      : {}),
    verify: {
      kind: "recompute",
      text:
        part === "mcr"
          ? `Read MCR() on the ${market} cdpManager — the constant this CDP would be liquidated against in normal mode.`
          : part === "state"
            ? `Open this CDP's own touch at block ${p?.atBlock} on this page: the collateral and debt it states are what the ratios here are built from.`
            : `Take the collateral and debt this CDP's touch at block ${p?.atBlock} states, multiply the collateral by ${formatPrice(end.value, priceDecimals(note))} and divide by the debt. The stretch is stated because ${priceGapReason(note)}.`,
    },
    inputs:
      part === "mcr"
        ? [
            {
              label: "MCR",
              value: `${p?.mcrPct ?? "—"}%`,
              kind: "chain" as const,
              pclass: "indexed" as const,
              note: "market constant, normal mode",
            },
          ]
        : part === "state"
          ? stateLeaves
          : [
              ...stateLeaves,
              polarisPriceLeaf(
                end,
                part === "crAfter" ? "later" : "earlier",
                stable,
                priceDecimals(note),
                part === "crAfter" && note.live,
              ),
            ],
  };
};
