// MakerDAO rate-step market notes — the ilk's stability fee between two of a
// vault's own touches.
// ----------------------------------------------------------------------------
// The Polaris rate step asks "what did the market's own rate do while this
// position did nothing", and both of its ends are on the position's own rows:
// a polaris touch carries `primaryRate`. A Maker vault's rows carry no fee at
// all — governance files a `duty` on the Jug, the spell's block is not
// indexed, and nothing joins a rate onto a frob. So the second half of the
// question has to be answered from the ilk's own rate log
// (`/api/makerdao/ilks/<ilk>/rate-log`, lib/api/fetch-makerdao-rate-log.ts):
// the fee in force at a row is the last RATE SET at or before it in chain
// order.
//
// THE QUANTITY IS THE SAME AT BOTH ENDS. Historical: the fee the Vat's own
// fold evidences at the set, confirmed against `Jug.ilks(ilk).duty +
// Jug.base()` at the set's own block. Live: the same `base + duty` compounded
// to a year, which the vault overlay already computes as `stabilityFeeApr`.
// Both are the Jug's per-second rate expressed per year; nothing is averaged,
// and neither is an index.
//
// `value` on each point is the fee as a FRACTION (0.1025), matching what
// `primaryRate` is on a polaris row, so `rateStepFigures`, `formatRatePercent`
// and `deltaPp = (b − a) × 100` in lib/shared/market-note.ts work here
// unchanged — the rate log states percents and this module divides once, at
// the boundary.
//
// A `give` row is never an end: it is a zero-delta ownership transfer and
// carries no economics. A row before the ilk's first set carries no fee at all
// and is not an end either.

import type { MakerRateLogResponse, MakerRateSet } from "@/lib/api/fetch-makerdao-rate-log";
import type { BaseActivityEvent, MakerDAOContext } from "@/lib/shared/types/event-shape";
import { collapseSameDirectionRateSteps, type RateSetLog, type RateStepNote } from "@/lib/shared/market-note";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";

/** The ilk a note is read in, as the vault page names it. */
export interface MakerRateStepMarket {
  /** The chain's own collateral-type name — "WSTETH-B". Namespaces the note id
   *  (lowercased) and the prose. */
  ilk: string;
  /** The display symbol for the ilk's collateral — "wstETH". The chip. */
  collateralSymbol: string;
  /** The Jug the fees were confirmed against — the note's `marketAddress`. */
  jug: string;
}

/** The live end of a rate step: the vault overlay's own head read. */
export interface MakerLiveRate {
  /** `MakerVaultState.stabilityFeeApr` — already a FRACTION. */
  aprPct: number;
  block: number;
  timestamp: number;
  /** The vault's debt at that block (the overlay's art × rate). The live
   *  note's yearly interest is stated on it: today's debt. */
  debtNow?: number | null;
}

/** MakerDAO's context on an event, or null — the same spelled-out narrowing
 *  lib/shared/market-note.ts uses for its own three protocols, so nothing here
 *  drags a type guard's runtime import into a module the pure verifier loads. */
const makerData = (e: BaseActivityEvent): MakerDAOContext | null =>
  e.context?.protocol === "makerdao" ? (e.context.data as MakerDAOContext) : null;

/** The log index at the TAIL of a MakerDAO event id — `frob:<txHash>:<N>`.
 *  Split on the last `:`, not on `-`/`_`: an ilk name carries a hyphen and a
 *  tx hash carries neither, so the shared `logIndexOf` would land in the wrong
 *  place. It matters most exactly where a vault has several rows in one block,
 *  which is where reading the wrong index would give them all the same key. */
export function makerLogIndexOf(e: BaseActivityEvent): number {
  const cut = e.id.lastIndexOf(":");
  if (cut < 0) return -1;
  const n = Number(e.id.slice(cut + 1));
  return Number.isFinite(n) ? n : -1;
}

/** The transaction a MakerDAO row belongs to.
 *
 *  `BaseActivityEvent.txHash` is typed as a required string, but the MakerDAO
 *  timeline's serving shape does not carry one — its rows are `id`,
 *  `blockNumber`, `timestamp`, `actionType`, `flows`, `context`, and nothing
 *  else. Reading `e.txHash` therefore compiles and then throws at run time, so
 *  the hash is taken from the id's own MIDDLE segment
 *  (`frob:<txHash>:<logIndex>`), which is where it actually lives, with the
 *  field preferred whenever a caller does supply one. Anything unparseable
 *  yields "" rather than a wrong hash — a receipt with no transaction is a
 *  receipt that names one less thing, not one that names the wrong thing. */
export function makerTxHashOf(e: BaseActivityEvent): string {
  if (e.txHash) return e.txHash.toLowerCase();
  const parts = e.id.split(":");
  const hash = parts.length >= 3 ? parts[parts.length - 2] : "";
  return /^0x[0-9a-fA-F]{64}$/.test(hash) ? hash.toLowerCase() : "";
}

/** The rows that can be an end of a stretch: the vault's OWN operations. A
 *  `give` carries no economics (zero-delta ownership transfer) and a fork is a
 *  position move rather than a touch of this vault's own terms — only `frob`
 *  and `grab` state what the vault did and had. */
const isEndRow = (d: MakerDAOContext): boolean => d.eventType === "frob" || d.eventType === "grab";

/**
 * The fee in force at (block, logIndex): the last rate set at or before it in
 * CHAIN order — block first, then log index. `sets` is ascending, as the route
 * serves it.
 *
 * Exported so the verifier can run the as-of rule over the served list without
 * restating it, and so a caller can ask the same question the notes ask.
 * Returns null before the ilk's first set, which is not a fee of zero: it is
 * the absence of an observation, and a row there is not an end.
 */
export function rateSetInForce(sets: readonly MakerRateSet[], block: number, logIndex: number): MakerRateSet | null {
  let cur: MakerRateSet | null = null;
  for (const s of sets) {
    if (s.block < block || (s.block === block && s.logIndex <= logIndex)) cur = s;
    else break;
  }
  return cur;
}

/** The rate-log receipt for one end — the drip the fee was first evidenced by.
 *  `txFrom` is EMPTY on purpose: a drip is not indexed with a sender here, and
 *  the receipt names the drip's own transaction and log rather than claiming a
 *  wallet. `ordinal` is the set's own position in the served list, so
 *  `to.ordinal − from.ordinal` counts the resets in between exactly as the
 *  polaris note's does. */
const setLog = (s: MakerRateSet): RateSetLog => ({
  block: s.block,
  logIndex: s.logIndex,
  txHash: s.txHash.toLowerCase(),
  txFrom: "",
  timestamp: s.timestamp,
  ordinal: s.ordinal,
});

/** A rate as a fraction, from the route's percent. */
const asFraction = (aprPct: number): number => aprPct / 100;

/** One end of a stretch: the vault's own row, wearing the fee in force at it. */
function makerPoint(e: BaseActivityEvent, d: MakerDAOContext, set: MakerRateSet) {
  return {
    block: e.blockNumber,
    timestamp: e.timestamp,
    value: asFraction(set.aprPct),
    eventId: e.id,
    txHash: makerTxHashOf(e),
    logIndex: makerLogIndexOf(e),
    wallet: (e.wallet ?? "").toLowerCase(),
    kind: endKind(d),
  };
}

/** What each end is called in prose. A vault's first frob is its opening; every
 *  other frob is an adjustment; a grab is the liquidation done TO it. */
const endKind = (d: MakerDAOContext): string => (d.eventType === "grab" ? "grab" : d.isOpen ? "frob-open" : "frob");

/** The DAI debt a row recorded: normalized art × the rate accumulator in force
 *  at its own block, both on the row. Null where either is missing (a row
 *  before `rate_at_block` landed) or the vault owed nothing. */
function debtAt(d: MakerDAOContext): number | null {
  if (d.rateAtBlock == null) return null;
  const art = Number(d.artAfter);
  const rate = Number(d.rateAtBlock);
  if (!Number.isFinite(art) || !Number.isFinite(rate) || !(art > 0) || !(rate > 0)) return null;
  const dai = (art * rate) / 1e27;
  return Number.isFinite(dai) && dai > 0 ? dai : null;
}

/** The vault's own rows that can bound a stretch, oldest first, each already
 *  carrying the fee in force at it. Two rows in ONE BLOCK are one moment (the
 *  fee cannot have moved between them), so only the last of each block
 *  survives — the same "one moment" rule the other selectors apply by refusing
 *  a pair whose blocks are equal, applied once here because a Maker vault
 *  routinely carries several frobs in a transaction. */
function ratedRows(events: readonly BaseActivityEvent[], sets: readonly MakerRateSet[]) {
  const rows = events
    .filter((e) => {
      const d = makerData(e);
      return d != null && isEndRow(d);
    })
    .sort((a, b) => a.blockNumber - b.blockNumber || makerLogIndexOf(a) - makerLogIndexOf(b));

  const moments: BaseActivityEvent[] = [];
  for (const e of rows) {
    if (moments.length && moments[moments.length - 1].blockNumber === e.blockNumber) moments[moments.length - 1] = e;
    else moments.push(e);
  }

  const out: { e: BaseActivityEvent; d: MakerDAOContext; set: MakerRateSet }[] = [];
  for (const e of moments) {
    const d = makerData(e);
    if (!d) continue;
    const set = rateSetInForce(sets, e.blockNumber, makerLogIndexOf(e));
    // Before the ilk's first observed set there is no fee to state — not a
    // zero, an absence. Such a row is not an end.
    if (!set) continue;
    out.push({ e, d, set });
  }
  return out;
}

/**
 * Maker's threshold: any change governance made. A Maker fee is a governance
 * setting, not a floating rate, so a 0.25-point move is as much a decision as
 * a whole point, and a note chain that skipped it would end at one fee and the
 * next note start at another (WSTETH-B 8.50% → 8.75% on 28 Oct 2025, vault
 * 28670). The floor sits far above the duty's truncation (~5e-7 pp) and at or
 * below the finest step governance has filed (0.25 pp).
 */
export const MAKER_RATE_STEP_MIN_PP = 0.01;

/** The threshold, applied to the confirmed figures. */
const isStretch = (deltaPp: number): boolean => Math.abs(deltaPp) >= MAKER_RATE_STEP_MIN_PP;

/**
 * The fee over one stretch, from the ilk's rate log: the lowest and highest
 * rate in force between (from) and (to), and the time-weighted yearly average
 * (compounded, as the Jug compounds it). Null where the log has no set in
 * force at the earlier end or the stretch has no length.
 */
export function makerFeePath(
  sets: readonly MakerRateSet[],
  from: { block: number; logIndex: number; timestamp: number },
  to: { block: number; logIndex: number; timestamp: number },
): { min: number; max: number; average: number } | null {
  const start = rateSetInForce(sets, from.block, from.logIndex);
  if (!start || !(to.timestamp > from.timestamp)) return null;
  let rate = asFraction(start.aprPct);
  let min = rate;
  let max = rate;
  let t = from.timestamp;
  let acc = 0;
  for (const s of sets) {
    const after = s.block > from.block || (s.block === from.block && s.logIndex > from.logIndex);
    const upTo = s.block < to.block || (s.block === to.block && s.logIndex <= to.logIndex);
    if (!after) continue;
    if (!upTo) break;
    const at = Math.min(Math.max(s.timestamp, t), to.timestamp);
    acc += (at - t) * Math.log1p(rate);
    t = at;
    rate = asFraction(s.aprPct);
    min = Math.min(min, rate);
    max = Math.max(max, rate);
  }
  acc += (to.timestamp - t) * Math.log1p(rate);
  // Each rate is already yearly: the time-weighted mean of ln(1 + r).
  const average = Math.expm1(acc / (to.timestamp - from.timestamp));
  return { min, max, average };
}

/** A stretch's path, read at its two ends. */
function pathOf(sets: readonly MakerRateSet[], note: RateStepNote): RateStepNote["path"] | undefined {
  const p = makerFeePath(
    sets,
    { block: note.from.block, logIndex: note.from.logIndex ?? -1, timestamp: note.from.timestamp },
    { block: note.to.block, logIndex: note.to.logIndex ?? Number.MAX_SAFE_INTEGER, timestamp: note.to.timestamp },
  );
  return p ?? undefined;
}

const unitLabel = "% per year";

/**
 * The stretches between two of this vault's own touches where the ilk's
 * stability fee changed (`MAKER_RATE_STEP_MIN_PP`).
 *
 * Both ends are the vault's own rows, as on a polaris rate step — what differs
 * is that the fee is not ON the row: it is the last rate set at or before it,
 * out of the ilk's own log. So the note's two receipts name the two DRIPS the
 * fees were evidenced by, not the vault's rows, and `setsBetween` counts the
 * resets the ilk made while this vault did nothing.
 */
export function makerRateStepNotesFor(
  events: readonly BaseActivityEvent[],
  log: MakerRateLogResponse | null,
  market: MakerRateStepMarket,
): RateStepNote[] {
  if (!log || log.sets.length === 0) return [];
  const rated = ratedRows(events, log.sets);
  if (rated.length < 2) return [];

  const key = market.ilk.toLowerCase();
  const address = market.jug.toLowerCase();
  // The chip is the ilk's COLLATERAL; the debt is the Vat's own unit. Stating
  // the interest in wstETH would be a unit error on the row's face.
  const debtSymbol = ilkDebtSymbol(market.ilk);
  const out: RateStepNote[] = [];

  for (let i = 0; i < rated.length - 1; i += 1) {
    const a = rated[i];
    const b = rated[i + 1];
    if (b.e.blockNumber <= a.e.blockNumber) continue;
    const rateA = asFraction(a.set.aprPct);
    const rateB = asFraction(b.set.aprPct);
    const deltaPp = (rateB - rateA) * 100;
    if (!isStretch(deltaPp)) continue;

    // The interest stat holds A's own debt fixed and moves only the fee — the
    // same "what that state came to be worth" framing the price gap's crAfter
    // uses. A's debt is its own recorded `art × rate_at_block`.
    const debt = debtAt(a.d);
    const owedNothing = !(Number(a.d.artAfter) > 0);
    const interest =
      debt != null
        ? { debt, before: debt * rateA, after: debt * rateB, atBlock: a.e.blockNumber, symbol: debtSymbol }
        : undefined;

    out.push({
      id: `rate-step:makerdao-${key}:${a.e.blockNumber}-${b.e.blockNumber}`,
      kind: "rate-step",
      protocol: "makerdao",
      marketSymbol: market.collateralSymbol,
      marketName: market.ilk,
      marketAddress: address,
      unitLabel,
      from: makerPoint(a.e, a.d, a.set),
      to: makerPoint(b.e, b.d, b.set),
      deltaPp,
      setsBetween: b.set.ordinal - a.set.ordinal,
      observed: { from: setLog(a.set), to: setLog(b.set) },
      ...(interest ? { interest } : {}),
      ...(owedNothing ? { owedNothing: true } : {}),
    });
  }
  // Consecutive stretches that moved the fee the same way are one note, as on
  // Polaris. A vault has ONE rate, so this flat array is a single series and
  // the scan's precondition holds; the fee ratchets inside a governance cycle,
  // so the merged note's first-to-last span is the true one. Settled by Miles
  // 2026-09-20 off measured runs — `rails-ops/architecture/market-notes.md` §9.
  //
  // A merged note sets `steps` and `members`, and three surfaces carry them:
  // the row's "Stated over" stat and its derivation prose
  // (components/shared/market-note-row.tsx), `makerRateStepProv(note, "steps")`
  // (lib/makerdao/market-note-provenance.ts), and `mergedStepsClause` on the
  // export receipt (lib/shared/market-note.ts). A home adopting the collapse
  // owes all three: a merged row states a span no single member states, so the
  // steps it stands for have to be recoverable.
  //
  // A stretch the vault began owing nothing stands alone: the fee cost it
  // nothing there, and a run through it would state one debt's interest over
  // a stretch in which that debt did not exist (vault 19103, 28 Feb to 23 May
  // 2021).
  const merged: RateStepNote[] = [];
  let run: RateStepNote[] = [];
  for (const n of out) {
    if (n.owedNothing) {
      merged.push(...collapseSameDirectionRateSteps(run), n);
      run = [];
    } else run.push(n);
  }
  merged.push(...collapseSameDirectionRateSteps(run));
  const byTo = new Map(out.map((n) => [n.to.block, n]));
  return merged.map((n) => {
    const path = pathOf(log.sets, n);
    const last = n.steps != null ? byTo.get(n.to.block) : undefined;
    const lastPath = last ? pathOf(log.sets, last) : undefined;
    return {
      ...n,
      ...(path ? { path } : {}),
      ...(last && lastPath ? { lastPath: { from: last.from.timestamp, ...lastPath } } : {}),
    };
  });
}

/**
 * A LIVE rate step: this vault's own NEWEST rated row against the ilk's
 * stability fee read live at the chain head.
 *
 * Unthresholded, like every other live note: "nothing has moved" is itself the
 * fact. Vault 28699's own newest row sits at the fee its current set states, so
 * its live note is exactly 0.00 pp and MUST still render — a live note that
 * withheld itself for a flat reading would leave a reader unable to tell "the
 * fee is unchanged" from "Rails did not look".
 *
 * `observed.to` is null — a live read is the Jug's current value, not a drip —
 * and `setsBetween` is therefore null too, matching `RateStepNote.setsBetween`'s
 * own contract: null wherever either end is unobserved.
 */
export function liveMakerRateStepNote(
  events: readonly BaseActivityEvent[],
  log: MakerRateLogResponse | null,
  market: MakerRateStepMarket,
  live: MakerLiveRate,
): RateStepNote | null {
  if (!log || log.sets.length === 0) return null;
  if (!Number.isFinite(live.aprPct) || live.aprPct < 0) return null;
  if (!(live.block > 0)) return null;
  const rated = ratedRows(events, log.sets);
  if (rated.length === 0) return null;

  const a = rated[rated.length - 1];
  const rateA = asFraction(a.set.aprPct);
  // The fee today equals the fee at the last event: no note (the 0.01 pp floor).
  if (Math.abs(live.aprPct - rateA) * 100 < 0.005) return null;
  // Today's debt when the overlay has it: the fee is read now, so the yearly
  // figure is what it costs on what the vault owes now.
  const today = live.debtNow != null && live.debtNow > 0 ? live.debtNow : null;
  const debt = today ?? debtAt(a.d);
  const interest =
    debt != null
      ? {
          debt,
          before: debt * rateA,
          after: debt * live.aprPct,
          atBlock: today != null ? live.block : a.e.blockNumber,
          symbol: ilkDebtSymbol(market.ilk),
        }
      : undefined;

  const note: RateStepNote = {
    id: `rate-step:makerdao-${market.ilk.toLowerCase()}:${a.e.blockNumber}-head`,
    kind: "rate-step",
    protocol: "makerdao",
    marketSymbol: market.collateralSymbol,
    marketName: market.ilk,
    marketAddress: market.jug.toLowerCase(),
    unitLabel,
    from: makerPoint(a.e, a.d, a.set),
    to: {
      block: live.block,
      timestamp: live.timestamp,
      value: live.aprPct,
      txHash: "",
      logIndex: -1,
      wallet: "",
      kind: "head",
    },
    deltaPp: (live.aprPct - rateA) * 100,
    setsBetween: null,
    ...(debt == null && !(Number(a.d.artAfter) > 0) ? { owedNothing: true } : {}),
    observed: { from: setLog(a.set), to: null },
    ...(interest ? { interest } : {}),
    live: true,
  };
  const path = pathOf(log.sets, { ...note, to: { ...note.to, logIndex: Number.MAX_SAFE_INTEGER } });
  return path ? { ...note, path } : note;
}
