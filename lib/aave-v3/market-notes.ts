// The Aave-family rate step — the reserve's own rate between two of a
// position's own touches, one note per (reserve, side).
// ----------------------------------------------------------------------------
// Shared by the two Ethereum V3-family explorers: Aave V3 (Core / Prime /
// EtherFi, three separate Pools) and SparkLend (one). They index the same
// event into the same table, so they read the same way and differ only in
// which Pool the receipts name.
//
// WHY ONE NOTE PER (RESERVE, SIDE), where Polaris and MakerDAO have one per
// market. A V3-family account is not a position in one market: it is one
// cross-collateralised account holding several reserves at once, and EACH
// reserve carries two rates — a supply rate the account earns and a variable
// borrow rate it pays. The same account can be a supplier of WETH and a
// borrower of USDe across the same two touches, and the two rates move
// independently. So a note names its reserve AND its side ("the USDe borrow
// rate", "the WETH supply rate"), and the side is a fact on the note rather
// than a verdict about it.
//
// WHAT A TOUCH IS. One of the position's own rows that is not a transfer —
// supply, withdraw, borrow, repay, liquidation. A transfer moves an aToken
// balance between accounts without the Pool acting on a reserve's rate, so it
// is not an end of a stretch; it DOES move balances, so it still counts when
// working out what the account held (see `aaveFamilyHoldings`).
//
// WHAT IS HELD AT A TOUCH. A running map over ALL rows in chain order,
// transfers included. A row updates its own reserve with the `supplyAfter` /
// `debtAfter` its own log recorded; a liquidation row updates two — the
// collateral reserve with `supplyAfter` and the debt reserve with `debtAfter`
// — because one LiquidationCall moves both sides at once. Nothing is
// interpolated: every figure is one the index already recorded on the row.
//
// THE TWO ENDS ARE READ AROUND THE POSITION'S OWN TRANSACTIONS, which is the
// whole reason this kind needs an endpoint at all where the other three read
// the rate off the row:
//
//   after A   the reserve's last ReserveDataUpdated at or before A's own log.
//             The Pool emits it inside A's own transaction, before A's own
//             event, so this IS the rate A's action left in force.
//   before B  the last one strictly before B's log AND not in B's own
//             transaction — so a move the position itself caused at B (a
//             large borrow lifting utilisation) is never stated as the
//             market's move. Measured on the busiest Core wallet (685 touches
//             over 12 reserves): 95 stretches are worth stating under this
//             rule, 128 if B's own transaction is read — 34 of them the
//             account's own doing, most a spike inside a handful of blocks and
//             back (PYUSD 4.9626% → 22.0921% across five blocks).
//
// Both reads live in rails-server (api/src/services/aave-family-reserve-
// rates.ts, POST /api/{aave-v3,spark}/reserve-rates); this module decides
// WHICH coordinates to ask about and turns the answer into notes. The pure
// helpers are exported for scripts/verify/verify-aave-family-rate-step.mjs,
// which restates the rule rather than importing it.

import type { AaveV3ChainReserve } from "@/lib/api/fetch-aave-v3-position";
import {
  ratePointKey,
  type ReserveRateLookup,
  type ReserveRatesRequest,
} from "@/lib/api/fetch-aave-family-reserve-rates";
import { RATE_STEP_MIN_PP, type MarketNotePoint, type RateStepNote } from "@/lib/shared/market-note";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";

/**
 * The floor under a LIVE note's rate: at least a tenth of a percentage point
 * a year at one end or the other.
 *
 * A V3-family account holds reserves nobody borrows — wstETH, weETH, WBTC and
 * cbBTC on the fixtures — whose supply rate is 0.0000% at both ends, because
 * the supply rate IS the borrow interest shared out and there is none. A live
 * note has no move threshold by design ("nothing has moved" is itself the
 * fact), so without this those sides would each draw a row reading
 * "0.00% → 0.00%", which is not a fact worth stating: there is no rate to
 * speak of, rather than a rate that held still.
 *
 * Historical notes are unaffected — the one-percentage-point threshold
 * (`RATE_STEP_MIN_PP`) already excludes them. Exported so the verifier can
 * prove the floor by breaking it.
 */
export const AAVE_RATE_STEP_LIVE_FLOOR = 0.001;

/** The row types that are a touch. A transfer is not one — see the header. */
const TOUCH_TYPES = new Set(["supply", "withdraw", "borrow", "repay", "liquidation"]);

/** Which side of a reserve a note is about. */
export type RateSide = "supply" | "borrow";

/** The context both explorers put on a row, narrowed to what this module
 *  reads. Spelled out rather than imported as a union, so one function can
 *  read an Aave V3 row and a Spark row without a per-protocol branch: the two
 *  contexts agree on every field named here. */
interface FamilyContext {
  eventType: string;
  reserveSymbol?: string;
  collateralAsset?: string;
  collateralSymbol?: string;
  interestRateMode?: number;
  supplyAfter?: string;
  debtAfter?: string;
  /** Aave V3 swap rows only — the received reserve's resulting balance. */
  swap?: { receivedSupplyAfter?: string; receivedDebtAfter?: string };
}

const familyData = (e: BaseActivityEvent): FamilyContext | null =>
  e.context?.protocol === "aave-v3" || e.context?.protocol === "spark"
    ? (e.context.data as unknown as FamilyContext)
    : null;

/** The log index at the tail `:N` of a V3-family event id — `supply:<pool>:
 *  <tx>:<log>` on Aave V3, `supply:<tx>:<log>` on Spark. `logIndexOf` in
 *  lib/shared/market-note.ts splits on the last `-` or `_`, which lands inside
 *  the word "transfer_in" on these ids rather than at the tail, so this reads
 *  the tail directly — the same narrow fix `polarisLogIndexOf` is. */
export function aaveFamilyLogIndex(id: string): number {
  const cut = id.lastIndexOf(":");
  if (cut < 0) return -1;
  const n = Number(id.slice(cut + 1));
  return Number.isFinite(n) ? n : -1;
}

const byChainOrder = (a: BaseActivityEvent, b: BaseActivityEvent): number =>
  a.blockNumber - b.blockNumber || aaveFamilyLogIndex(a.id) - aaveFamilyLogIndex(b.id);

/** What the account held at one of its own touches, and the touch itself. */
export interface AaveFamilyTouch {
  event: BaseActivityEvent;
  block: number;
  logIndex: number;
  txHash: string;
  kind: string;
  timestamp: number;
  /** Every (reserve, side) with a positive balance once this row is applied,
   *  and the amount in the reserve's own units. */
  held: { reserve: string; side: RateSide; amount: number }[];
}

/** A candidate stretch: two consecutive touches and one (reserve, side) the
 *  account held at the earlier one. */
export interface AaveFamilyStretch {
  reserve: string;
  side: RateSide;
  /** The holding at A, in the reserve's own units. */
  amount: number;
  from: AaveFamilyTouch;
  to: AaveFamilyTouch;
}

const num = (v: string | undefined): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * The position's own touches, each carrying what the account held once that
 * row landed — the running map described in the header, over ALL rows in
 * chain order.
 */
export function aaveFamilyHoldings(events: readonly BaseActivityEvent[]): AaveFamilyTouch[] {
  const rows = [...events].sort(byChainOrder);
  const held = new Map<string, { supply: number; debt: number }>();
  const at = (reserve: string) => {
    const cur = held.get(reserve) ?? { supply: 0, debt: 0 };
    held.set(reserve, cur);
    return cur;
  };
  const touches: AaveFamilyTouch[] = [];

  for (const e of rows) {
    const d = familyData(e);
    if (!d) continue;
    if (d.eventType === "liquidation") {
      // One LiquidationCall moves both sides: the seized collateral reserve
      // (`collateralAsset`) and the covered debt reserve, which is the row's
      // SECOND flow — the first is the collateral that left.
      const collateral = (d.collateralAsset ?? "").toLowerCase();
      const debtToken = (e.flows?.[1]?.token ?? "").toLowerCase();
      if (collateral) {
        const s = num(d.supplyAfter);
        if (s != null) at(collateral).supply = s;
      }
      if (debtToken) {
        const b = num(d.debtAfter);
        if (b != null) at(debtToken).debt = b;
      }
    } else {
      const own = (e.flows?.[0]?.token ?? "").toLowerCase();
      if (own) {
        const s = num(d.supplyAfter);
        const b = num(d.debtAfter);
        if (s != null) at(own).supply = s;
        if (b != null) at(own).debt = b;
      }
      // A swap also lands its received reserve, the event's second flow.
      if (d.eventType === "swap" && d.swap) {
        const other = (e.flows?.[1]?.token ?? "").toLowerCase();
        const s = num(d.swap.receivedSupplyAfter);
        const b = num(d.swap.receivedDebtAfter);
        if (other && s != null) at(other).supply = s;
        if (other && b != null) at(other).debt = b;
      }
    }
    if (!TOUCH_TYPES.has(d.eventType)) continue;
    const snapshot: AaveFamilyTouch["held"] = [];
    for (const [reserve, v] of held) {
      if (v.supply > 0) snapshot.push({ reserve, side: "supply", amount: v.supply });
      if (v.debt > 0) snapshot.push({ reserve, side: "borrow", amount: v.debt });
    }
    touches.push({
      event: e,
      block: e.blockNumber,
      logIndex: aaveFamilyLogIndex(e.id),
      txHash: (e.txHash ?? "").toLowerCase(),
      kind: d.eventType,
      timestamp: e.timestamp,
      held: snapshot,
    });
  }
  return touches;
}

/**
 * Reserves whose borrow side this position holds at a STABLE rate.
 *
 * `aave_family_reserve_data` carries the reserve's variable borrow rate;
 * stable-rate debt is a per-position rate fixed at the borrow, and the
 * reserve's own log says nothing about it. Rather than state the variable
 * rate over a stable-rate debt, the borrow side of such a reserve is not
 * noted at all. Every borrow on the fixtures is mode 2 (variable) — Aave
 * retired stable-rate borrowing — so this is a guard, not a common path.
 */
export function stableRateReserves(events: readonly BaseActivityEvent[]): Set<string> {
  const out = new Set<string>();
  for (const e of events) {
    const d = familyData(e);
    if (!d || d.eventType !== "borrow" || d.interestRateMode !== 1) continue;
    const token = (e.flows?.[0]?.token ?? "").toLowerCase();
    if (token) out.add(token);
  }
  return out;
}

/**
 * Every stretch the page could state: consecutive touches (A, B) with A
 * earlier, once per (reserve, side) the account held at A.
 *
 * Two touches in one block are one moment, not a stretch — the pair is
 * skipped, exactly as the Polaris selector skips its own.
 */
export function aaveFamilyStretches(
  touches: readonly AaveFamilyTouch[],
  stableReserves: ReadonlySet<string>,
): AaveFamilyStretch[] {
  const out: AaveFamilyStretch[] = [];
  for (let i = 0; i < touches.length - 1; i += 1) {
    const from = touches[i];
    const to = touches[i + 1];
    if (to.block <= from.block) continue;
    for (const h of from.held) {
      if (h.side === "borrow" && stableReserves.has(h.reserve)) continue;
      out.push({ reserve: h.reserve, side: h.side, amount: h.amount, from, to });
    }
  }
  return out;
}

/**
 * The coordinates this page needs the rates at, one entry per reserve.
 *
 * `after` covers every touch at which the reserve was held on any side —
 * including the newest one, which is never the earlier end of a historical
 * stretch but IS the earlier end of a live note. `before` covers every touch
 * that follows one where the reserve was held, in a later block.
 *
 * Deduplicated on the coordinate: the same touch is the later end of one
 * stretch and the earlier end of the next, and one seek answers both.
 */
export function aaveFamilyRateRequests(
  touches: readonly AaveFamilyTouch[],
  stableReserves: ReadonlySet<string> = new Set(),
): ReserveRatesRequest[] {
  const byReserve = new Map<
    string,
    { after: Map<string, [number, number]>; before: Map<string, [number, number, string]> }
  >();
  const entry = (reserve: string) => {
    let e = byReserve.get(reserve);
    if (!e) {
      e = { after: new Map(), before: new Map() };
      byReserve.set(reserve, e);
    }
    return e;
  };
  touches.forEach((touch, i) => {
    const next = touches[i + 1];
    for (const h of touch.held) {
      if (h.side === "borrow" && stableReserves.has(h.reserve)) continue;
      const e = entry(h.reserve);
      e.after.set(ratePointKey(touch.block, touch.logIndex), [touch.block, touch.logIndex]);
      if (next && next.block > touch.block) {
        e.before.set(ratePointKey(next.block, next.logIndex), [next.block, next.logIndex, next.txHash]);
      }
    }
  });
  return [...byReserve.entries()].map(([reserve, e]) => ({
    reserve,
    after: [...e.after.values()],
    before: [...e.before.values()],
  }));
}

/** What the note needs to know about the deployment it is read in. */
export interface AaveFamilyNoteOptions {
  /** The note's `protocol` — the discriminant the prose, the row body and the
   *  receipts branch on. */
  protocol: "aave-v3" | "spark";
  /** `core` | `prime` | `etherfi`, or `spark`. Namespaces the note id. */
  market: string;
  /** The market in prose — "Aave V3 Core", "Spark". */
  marketName: string;
  /** The Pool the receipts name. */
  pool: string;
  /** Reserve address → display symbol, from the chain overlay's own reserves.
   *  The rates answer's own `symbol` and the row's flow symbol are the two
   *  fallbacks, in that order. */
  symbols?: Readonly<Record<string, string>>;
}

/** The id's market segment. Aave V3 needs both halves — Core, Prime and
 *  EtherFi are three Pools with three rate histories — while SparkLend's
 *  protocol and market are one word, so the duplicate is not repeated. */
export const noteScope = (opts: Pick<AaveFamilyNoteOptions, "protocol" | "market">): string =>
  opts.protocol === "spark" ? "spark" : `aave-v3-${opts.market}`;

/** Whether a note states the holding and the interest on it. The holding is the
 *  row's replayed principal, which leaves out interest. On Aave V3 it decides
 *  only which stretches are noted and is never shown: the exact balance at a
 *  touch is the open card's (rails-ops TO-DO-ui-jobs §19). SparkLend has no exact
 *  balance yet and keeps the figures. */
const statesHolding = (opts: AaveFamilyNoteOptions): boolean => opts.protocol !== "aave-v3";

const rateOf = (side: RateSide, point: { liquidityRate: number; variableBorrowRate: number }): number =>
  side === "supply" ? point.liquidityRate : point.variableBorrowRate;

/** One end of a note that IS one of the position's own touches. */
function touchPoint(touch: AaveFamilyTouch, value: number): MarketNotePoint {
  return {
    block: touch.block,
    timestamp: touch.timestamp,
    value,
    eventId: touch.event.id,
    txHash: touch.txHash,
    logIndex: touch.logIndex,
    wallet: (touch.event.wallet ?? "").toLowerCase(),
    kind: touch.kind,
  };
}

/** The ReserveDataUpdated a rate was read from, in the shape the note's
 *  `observed` slot takes. `txFrom` is empty and `ordinal` is 0: the series is
 *  dense — the Pool emits one on every action that touches the reserve — so
 *  there is no meaningful "how many times it reset in between" to count, and
 *  `setsBetween` stays null on every note here. */
const observedLog = (p: { block: number; logIndex: number; txHash: string; timestamp: number }) => ({
  block: p.block,
  logIndex: p.logIndex,
  txHash: p.txHash.toLowerCase(),
  txFrom: "",
  timestamp: p.timestamp,
  ordinal: 0,
});

function symbolFor(
  reserve: string,
  rates: ReserveRateLookup,
  opts: AaveFamilyNoteOptions,
  touch: AaveFamilyTouch,
): string {
  const overlay = opts.symbols?.[reserve];
  if (overlay) return overlay;
  const indexed = rates.get(reserve)?.symbol;
  if (indexed) return indexed;
  const flow = touch.event.flows?.find((f) => f.token?.toLowerCase() === reserve);
  return flow?.tokenSymbol ?? reserve.slice(0, 6);
}

/**
 * The historical notes: for every stretch, the reserve's rate on that side at
 * each end, stated when the move is at least `RATE_STEP_MIN_PP`.
 *
 * A stretch whose either end the route could not resolve — before the
 * reserve's first ReserveDataUpdated, or where the only candidate before B
 * sits inside B's own transaction — is not stated at all. There is no
 * fallback: a note whose ends are not both observed would be a claim about a
 * rate nothing recorded.
 */
export function aaveFamilyRateStepNotesFor(
  events: readonly BaseActivityEvent[],
  rates: ReserveRateLookup,
  opts: AaveFamilyNoteOptions,
): RateStepNote[] {
  const touches = aaveFamilyHoldings(events);
  const stretches = aaveFamilyStretches(touches, stableRateReserves(events));
  const scope = noteScope(opts);
  const out: RateStepNote[] = [];

  for (const s of stretches) {
    const lookup = rates.get(s.reserve);
    if (!lookup) continue;
    const a = lookup.after.get(ratePointKey(s.from.block, s.from.logIndex));
    const b = lookup.before.get(ratePointKey(s.to.block, s.to.logIndex));
    if (!a || !b) continue;
    const rateA = rateOf(s.side, a);
    const rateB = rateOf(s.side, b);
    if (!Number.isFinite(rateA) || !Number.isFinite(rateB)) continue;
    const deltaPp = (rateB - rateA) * 100;
    if (Math.abs(deltaPp) < RATE_STEP_MIN_PP) continue;

    const symbol = symbolFor(s.reserve, rates, opts, s.from);
    out.push({
      id: `rate-step:${scope}-${symbol.toLowerCase()}-${s.side}:${s.from.block}-${s.to.block}`,
      kind: "rate-step",
      protocol: opts.protocol,
      side: s.side,
      marketSymbol: symbol,
      marketName: opts.marketName,
      marketAddress: s.reserve,
      unitLabel: "% per year",
      from: touchPoint(s.from, rateA),
      to: touchPoint(s.to, rateB),
      deltaPp,
      // The reserve emits a ReserveDataUpdated on every action that touches
      // it, so there is no count of resets to state — only the two logs.
      setsBetween: null,
      observed: { from: observedLog(a), to: observedLog(b) },
      ...(s.amount > 0 && statesHolding(opts)
        ? {
            interest: {
              debt: s.amount,
              before: s.amount * rateA,
              after: s.amount * rateB,
              atBlock: s.from.block,
            },
          }
        : {}),
    });
  }
  return out;
}

/** What the chain overlay says the account holds now, and at which block. */
export interface AaveFamilyLiveRead {
  blockNumber: number;
  /** The head's own timestamp (`/api/head`), where the page has it. */
  timestamp?: number;
  reserves: readonly AaveV3ChainReserve[];
}

/**
 * The LIVE notes: one per (reserve, side) the overlay says the account holds
 * NOW, against the newest touch at which it held that side.
 *
 * The later end is the Pool's own `getReserveData` at the overlay's block —
 * `supplyApr` / `borrowApr`, the same fractions the risk surfaces read — not
 * a log. Unthresholded like every other live note: "nothing has moved" is
 * itself the fact. The one gate is `AAVE_RATE_STEP_LIVE_FLOOR`, which is
 * about there being a rate at all rather than about the move.
 *
 * No note where the account has never touched the position while holding that
 * side — a balance that arrived by aToken transfer alone has no touch of its
 * own to read the earlier rate at, and inventing one would be a claim about a
 * block the position did not act in.
 */
export function liveAaveFamilyRateStepNotes(
  events: readonly BaseActivityEvent[],
  rates: ReserveRateLookup,
  live: AaveFamilyLiveRead,
  opts: AaveFamilyNoteOptions,
): RateStepNote[] {
  const touches = aaveFamilyHoldings(events);
  if (touches.length === 0) return [];
  const stable = stableRateReserves(events);
  const scope = noteScope(opts);
  const out: RateStepNote[] = [];

  for (const r of live.reserves) {
    const reserve = r.address.toLowerCase();
    const sides: { side: RateSide; rate: number | undefined }[] = [
      { side: "supply", rate: isPositiveRaw(r.supplyBalanceRaw) ? r.supplyApr : undefined },
      { side: "borrow", rate: isPositiveRaw(r.debtBalanceRaw) ? r.borrowApr : undefined },
    ];
    for (const { side, rate } of sides) {
      if (rate == null || !Number.isFinite(rate)) continue;
      if (side === "borrow" && stable.has(reserve)) continue;

      // The newest touch at which this side was held. Not simply the newest
      // touch: a balance can arrive by transfer after the position's own last
      // action, and the rate at a touch that did not hold it says nothing.
      let from: AaveFamilyTouch | null = null;
      let amount = 0;
      for (let i = touches.length - 1; i >= 0; i -= 1) {
        const h = touches[i].held.find((x) => x.reserve === reserve && x.side === side);
        if (h) {
          from = touches[i];
          amount = h.amount;
          break;
        }
      }
      if (!from) continue;
      const a = rates.get(reserve)?.after.get(ratePointKey(from.block, from.logIndex));
      if (!a) continue;
      const rateA = rateOf(side, a);
      if (!Number.isFinite(rateA)) continue;
      // A side with no rate to speak of at either end — a reserve nobody
      // borrows, whose supply rate is 0.0000% now and was then.
      if (Math.max(rateA, rate) < AAVE_RATE_STEP_LIVE_FLOOR) continue;

      const symbol = symbolFor(reserve, rates, opts, from);
      const to: MarketNotePoint = {
        block: live.blockNumber,
        timestamp: live.timestamp ?? 0,
        value: rate,
        txHash: "",
        logIndex: -1,
        wallet: "",
        kind: "head",
      };
      out.push({
        id: `rate-step:${scope}-${symbol.toLowerCase()}-${side}:${from.block}-head`,
        kind: "rate-step",
        protocol: opts.protocol,
        side,
        marketSymbol: symbol,
        marketName: opts.marketName,
        marketAddress: reserve,
        unitLabel: "% per year",
        from: touchPoint(from, rateA),
        to,
        deltaPp: (rate - rateA) * 100,
        setsBetween: null,
        observed: { from: observedLog(a), to: null },
        ...(amount > 0 && statesHolding(opts)
          ? { interest: { debt: amount, before: amount * rateA, after: amount * rate, atBlock: from.block } }
          : {}),
        live: true,
      });
    }
  }
  return out;
}

/** A raw token-wei string with something in it. The overlay ships balances as
 *  integer strings to keep `numeric(78,0)` precision, so "0" and "" are both
 *  "holds none" and anything else is a holding. */
const isPositiveRaw = (raw: string | undefined): boolean => {
  if (!raw) return false;
  try {
    return BigInt(raw) > BigInt(0);
  } catch {
    return false;
  }
};
