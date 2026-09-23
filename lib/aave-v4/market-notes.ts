// Aave V4 price-gap market notes — the spoke's own oracle price at two of one
// position's own rows, and what the move alone did to the whole basket's
// health factor.
// ----------------------------------------------------------------------------
// The fourth home of the price-gap kind, after Liquity V2's trove and
// Polaris's CDP (lib/shared/market-note.ts). What is different here is the
// SHAPE OF THE POSITION, and everything below follows from it:
//
//   ONE NOTE PER ASSET, NEVER PER BASKET. A trove has one collateral and one
//   debt, so "the price moved" is unambiguous. An Aave account holds several
//   collaterals against several debts in one spoke, and its oracle prices move
//   independently. A note therefore states ONE asset's price at two of the
//   position's own rows; a position with three collaterals can carry three
//   notes across the same stretch, each answering a different question.
//
//   THE HEALTH FACTOR REPLACES THE COLLATERAL RATIO. `PriceGapNote.position`
//   is left unset on every note here — there is no single collateral ratio to
//   state — and `PriceGapNote.health` carries the whole basket instead:
//   C = Σ(collateral × price × LT), D = Σ(debt × price), HF = C ÷ D, with the
//   amounts and every OTHER asset's price frozen at the earlier row and only
//   this asset's price moved.
//
//   THE RUNWAY IS PER ASSET, HOLDING THE REST FIXED. How far THIS asset's
//   price alone could move before the basket reaches HF 1: for a collateral,
//   (C − D) ÷ (its own LT-weighted leg) — the fraction it could fall; for a
//   debt, (C − D) ÷ its own leg — the fraction it could rise. The threshold is
//   the shared `RUNWAY_SHARE`, the same quarter of the position's own runway
//   every other price gap is gated on.
//
//   THE LIQUIDATION THRESHOLD IS READ AT HEAD, NOT AT THE BLOCK. Aave V4
//   reports the EFFECTIVE threshold per position (see lib/aave-v4/liquidation-thresholds.ts):
//   the only trustworthy figure is the one the backend harvests from
//   `getUserAccountData.avgCollateralFactor` and serves as the chain overlay's
//   `reserves[].lt` — the LT in force NOW. The LT at a past block is not
//   indexed, so every health figure here is "the amounts and prices this row
//   recorded, read against the threshold the spoke reports now", and the
//   receipt says exactly that. Where a collateral's LT is unknown, or the
//   earlier row's basket is not fully priced, the note carries NO health
//   payload at all rather than a figure built on a guess.
//
// PRICING ON THIS INDEX IS UNEVEN, and the rule respects that rather than
// papering over it (measured 2026-09-06: on the Main spoke every snapshot item
// carries a price; on the Bluechip spoke's `prime`-hub rows none of them do,
// and only the row's own primary-asset price and a liquidation's
// collateral/debt prices are stated). A row that states no price for an asset
// is simply not an observation of it — the same guard Liquity V2 applies with
// `collateralPrice > 0`, per asset. On a position whose rows carry no item
// prices the basket is never fully priced, so its notes are price-only, and
// only liquidation-ended stretches survive: an adjustment-ended one has no
// runway to be measured against and is not stated at all.
//
// Nothing here is fetched. Both ends of a historical note are fields of two
// rows already on the page. A LIVE note's two ends are both reads the page
// makes of one route: `/api/oracle/aave-v4` at head for the later end, dated
// against `/api/head`, and `/api/oracle/aave-v4?block=B` for the earlier one —
// the same Aave oracle, pinned to the block of the row the note runs
// from. The row supplies the moment, never the price.

import type { AaveV4Context, BaseActivityEvent } from "@/lib/shared/types/event-shape";
import {
  liveGapStatesAChange,
  RUNWAY_SHARE,
  type MarketNotePoint,
  type PriceGapHealth,
  type PriceGapNote,
} from "@/lib/shared/market-note";

/** The spoke a set of notes is read in. `lts` and `addresses` come off the
 *  chain overlay's `reserves[]`; both can be empty (no overlay, or a stale
 *  one), and the selector still runs — a liquidation-ended, price-only note
 *  needs neither. */
export interface AaveV4NoteMarket {
  /** The spoke's URL key ("main", "bluechip") — namespaces the note id. */
  spokeKey: string;
  /** The spoke's DISPLAY name, the discriminant on the row
   *  (`context.data.spokeName`). */
  spokeName: string;
  /** symbol → liquidation threshold (0..1) from the overlay's `reserves[].lt`;
   *  only `lt > 0` entries. A stablecoin held purely as debt reports 0 and is
   *  absent here, which is right: a debt asset's LT is not in the health
   *  factor at all. */
  lts: Record<string, number>;
  /** symbol → underlying address (lowercase) from the overlay's `reserves[]`. */
  addresses: Record<string, string>;
}

/** The reads the page makes for a live note. BOTH ends are chain reads of the
 *  same Aave oracle: the later one at head, the earlier one pinned to
 *  the block of the position's own row the note runs from.
 *
 *  The earlier end used to be the price the row STATED, which came from the
 *  historic-price lane — and a lane whose live writer covers eight of the
 *  registry's feeds served May's price on a September row, so on 2026-09-07 a
 *  wstETH withdraw reported an 18.5% "move" that never happened. Reading the
 *  feed at the row's own block makes the earlier end the same kind of fact as
 *  the later one, and takes the note off the lane entirely: it is present
 *  whenever the page's own figures are. */
export interface AaveV4LiveRead {
  /** symbol → USD, from `/api/oracle/aave-v4`'s map (address-matched against
   *  the overlay's reserves first, then by the map entry's own `symbol`). */
  prices: Record<string, number>;
  /** The block the oracle map answered at. */
  block: number;
  /** The head block's own timestamp (`/api/head`), where it landed. */
  timestamp?: number;
  /** The symbols the overlay shows held as collateral right now
   *  (`isCollateral && supplyBalanceRaw > 0`) — one live note each. */
  heldCollateral: string[];
  /** block → (symbol → USD): the pinned reads, one per block the builder's own
   *  earlier rows sit at (`aaveV4LiveEarlierBlocks`, in practice one or two).
   *  Matched to symbols exactly as `prices` is. A block with no entry, or a
   *  symbol missing from the block it needs, draws no note — the same guard
   *  the head end applies. */
  earlier: Record<number, Record<string, number>>;
}

/** The Aave V4 context on an event, or null — the spelled-out narrowing the
 *  shared module uses for its own three protocols, reading the discriminant
 *  `isAaveV4Event` reads. */
const aaveV4Data = (e: BaseActivityEvent): AaveV4Context | null =>
  e.context?.protocol === "aave-v4" ? (e.context.data as AaveV4Context) : null;

/** The log index at the tail of an Aave V4 event id (`${txHash}-${logIndex}`).
 *  It matters most exactly where a position has several logs in one block —
 *  a supply and its borrow in the same transaction — which is where reading
 *  the wrong key would give every row of the block the same order. */
function logIndexOf(e: BaseActivityEvent): number {
  const cut = e.id.lastIndexOf("-");
  if (cut < 0) return -1;
  const n = Number(e.id.slice(cut + 1));
  return Number.isFinite(n) ? n : -1;
}

const byChainOrder = (a: BaseActivityEvent, b: BaseActivityEvent): number =>
  a.blockNumber - b.blockNumber || logIndexOf(a) - logIndexOf(b);

/**
 * The price this row STATES for one asset, or 0 where it states none.
 *
 * Three places a row can state an asset's price, in the order the index fills
 * them: the snapshot item for that asset (`allSupplies` / `allDebts`, the
 * whole basket at the row's block); a liquidation's own two prices, which name
 * the seized collateral and the covered debt; and the row's own primary-asset
 * price, which names `reserveSymbol` alone.
 *
 * Zero is a real answer, and the one that keeps this rule truthful on a
 * partially-enriched index: a row that states no price for an asset is not an
 * observation of it, and cannot be either end of a stretch about it.
 *
 * Exported so a verifier can replicate the rule against the same route
 * without importing the selector it is testing.
 */
export function assetPriceOn(e: BaseActivityEvent, symbol: string): number {
  const d = aaveV4Data(e);
  if (!d) return 0;
  for (const item of [...(d.allSupplies ?? []), ...(d.allDebts ?? [])]) {
    if (item.symbol === symbol && item.price != null && item.price.usd > 0) return item.price.usd;
  }
  if (d.eventType === "liquidation") {
    if (d.collateralSymbol === symbol && d.collateralPrice != null && d.collateralPrice.usd > 0) {
      return d.collateralPrice.usd;
    }
    if (d.reserveSymbol === symbol && d.debtPrice != null && d.debtPrice.usd > 0) return d.debtPrice.usd;
  }
  if (d.reserveSymbol === symbol && d.price != null && d.price.usd > 0) return d.price.usd;
  return 0;
}

/** One leg of a basket: an asset's amount, the price the row recorded for it,
 *  and (collateral only) the liquidation threshold in force now. */
interface BasketLeg {
  symbol: string;
  amount: number;
  price: number;
  /** 0 on a debt leg — an LT is a property of collateral only. */
  lt: number;
}

/** The whole position as one row recorded it. `priced` is the load-bearing
 *  flag: false wherever ANY leg is unpriced or any collateral's LT is
 *  unknown, and a note built on such a row carries no health payload. */
export interface AaveV4Basket {
  priced: boolean;
  /** Σ(collateral × price × LT) — what actually backs the debt. */
  collateralUsd: number;
  /** Σ(debt × price). */
  debtUsd: number;
  collateral: BasketLeg[];
  debt: BasketLeg[];
}

/**
 * The basket the row's own snapshot states, valued at the row's own prices and
 * the liquidation thresholds the spoke reports now.
 *
 * A row with no debt is never `priced`: no debt is no runway (nothing a price
 * move can do takes a position that owes nothing to liquidation), and the
 * health factor is undefined anyway.
 *
 * `pinned` — the feeds' own answer at this row's block — supersedes the row's
 * stated price leg by leg where it has an entry, and is what a LIVE note values
 * the earlier basket at. The row's own field remains the fallback for a leg the
 * registry does not map (a Pendle PT it has no market for). Absent, every leg
 * is the row's own, which is what every historical note reads.
 *
 * Exported for the same reason `assetPriceOn` is.
 */
export function basketAt(
  e: BaseActivityEvent,
  lts: Record<string, number>,
  pinned?: Record<string, number>,
): AaveV4Basket {
  const d = aaveV4Data(e);
  const supplies = d?.allSupplies ?? [];
  const debts = d?.allDebts ?? [];
  let priced = debts.length > 0;
  let collateralUsd = 0;
  let debtUsd = 0;
  const collateral: BasketLeg[] = [];
  const debt: BasketLeg[] = [];

  const priceOf = (item: { symbol: string; price?: { usd: number } | null }): number => {
    const fromPin = pinned?.[item.symbol];
    if (fromPin != null && fromPin > 0) return fromPin;
    return item.price != null && item.price.usd > 0 ? item.price.usd : 0;
  };

  for (const item of supplies) {
    const price = priceOf(item);
    const lt = lts[item.symbol] ?? 0;
    const amount = Number(item.amount);
    if (!(price > 0) || !(lt > 0) || !Number.isFinite(amount)) priced = false;
    collateralUsd += (Number.isFinite(amount) ? amount : 0) * price * lt;
    collateral.push({ symbol: item.symbol, amount: Number.isFinite(amount) ? amount : 0, price, lt });
  }
  for (const item of debts) {
    const price = priceOf(item);
    const amount = Number(item.amount);
    if (!(price > 0) || !Number.isFinite(amount)) priced = false;
    debtUsd += (Number.isFinite(amount) ? amount : 0) * price;
    debt.push({ symbol: item.symbol, amount: Number.isFinite(amount) ? amount : 0, price, lt: 0 });
  }
  return { priced, collateralUsd, debtUsd, collateral, debt };
}

/** What one asset's move did to the basket, and how much of the runway it
 *  used. Null wherever the basket cannot answer — an unpriced leg, an unknown
 *  LT, no debt, or an asset this row's snapshot does not hold. */
interface AssetMove {
  health: PriceGapHealth;
  runway: number;
  consumed: number;
}

function assetMove(
  e: BaseActivityEvent,
  symbol: string,
  priceA: number,
  priceB: number,
  lts: Record<string, number>,
  pinned?: Record<string, number>,
): AssetMove | null {
  const basket = basketAt(e, lts, pinned);
  if (!basket.priced || !(basket.debtUsd > 0)) return null;
  const asCollateral = basket.collateral.find((l) => l.symbol === symbol);
  const asDebt = asCollateral ? undefined : basket.debt.find((l) => l.symbol === symbol);
  const leg = asCollateral ?? asDebt;
  if (!leg) return null;

  const hfBefore = basket.collateralUsd / basket.debtUsd;
  // Only this asset's leg is revalued; the rest of the basket is the row's own
  // snapshot, untouched. That is what makes `runway` and `hfAfter` two
  // statements of one fact: at `consumed === 1`, `hfAfter` is exactly 1.
  const legBefore = asCollateral ? leg.amount * priceA * leg.lt : leg.amount * priceA;
  const legAfter = asCollateral ? leg.amount * priceB * leg.lt : leg.amount * priceB;
  const hfAfter = asCollateral
    ? (basket.collateralUsd - legBefore + legAfter) / basket.debtUsd
    : basket.collateralUsd / (basket.debtUsd - legBefore + legAfter);
  const runway = legBefore > 0 ? (basket.collateralUsd - basket.debtUsd) / legBefore : 0;
  const move = Math.abs(priceB / priceA - 1);
  // A position already at or below a 1.00 health factor has no runway left for
  // a move to consume — the stretch states itself rather than being measured
  // against a negative denominator (the same clause the Liquity V2 selector
  // applies to a trove under its branch minimum).
  const consumed = runway > 0 ? move / runway : Infinity;
  return {
    health: {
      hfBefore,
      hfAfter,
      collateralUsd: basket.collateralUsd,
      debtUsd: basket.debtUsd,
      atBlock: e.blockNumber,
      ltSource: "chain-head",
    },
    runway,
    consumed,
  };
}

/** Whether the position HELD this asset at the row — in the snapshot, on
 *  either side. A row can state an asset's price without holding it (the
 *  withdrawal that emptied it states its own `reserveSymbol` price), and such
 *  a row can close a stretch but never open one: there is no position in the
 *  asset to measure a move against. */
const heldAt = (e: BaseActivityEvent, symbol: string): boolean => {
  const d = aaveV4Data(e);
  if (!d) return false;
  return (d.allSupplies ?? []).some((i) => i.symbol === symbol) || (d.allDebts ?? []).some((i) => i.symbol === symbol);
};

const carriesDebt = (e: BaseActivityEvent): boolean => (aaveV4Data(e)?.allDebts ?? []).length > 0;

/** Every asset any row of this spoke names — the universe a note can be about.
 *  Both snapshot sides and both of a liquidation's own symbols, because a
 *  liquidation row's basket can omit an asset it just seized in full. */
function assetUniverse(rows: readonly BaseActivityEvent[]): string[] {
  const out = new Set<string>();
  for (const e of rows) {
    const d = aaveV4Data(e);
    if (!d) continue;
    for (const item of [...(d.allSupplies ?? []), ...(d.allDebts ?? [])]) out.add(item.symbol);
    if (d.collateralSymbol) out.add(d.collateralSymbol);
    if (d.reserveSymbol) out.add(d.reserveSymbol);
  }
  return [...out];
}

/** This spoke's rows, in chain order. */
function spokeRows(events: readonly BaseActivityEvent[], spokeName: string): BaseActivityEvent[] {
  return events
    .filter((e) => {
      const d = aaveV4Data(e);
      return d != null && (d.spokeName ?? "Main") === spokeName;
    })
    .sort(byChainOrder);
}

/** One end of a gap: the position's own row, and the price it states for this
 *  asset. `wallet` is the row's OWN owner (`context.data.owner`) rather than
 *  the queried wallet — the timeline can carry rows where this wallet was the
 *  caller on somebody else's position. */
function eventPoint(e: BaseActivityEvent, d: AaveV4Context, value: number): MarketNotePoint {
  return {
    block: e.blockNumber,
    timestamp: e.timestamp,
    value,
    eventId: e.id,
    txHash: (e.txHash ?? "").toLowerCase(),
    logIndex: logIndexOf(e),
    wallet: (d.owner ?? e.wallet ?? "").toLowerCase(),
    kind: d.eventType,
  };
}

const noteId = (market: AaveV4NoteMarket, symbol: string, from: number, to: number | "head"): string =>
  `price-gap:aave-v4-${market.spokeKey}-${symbol.toLowerCase()}:${from}-${to}`;

/** The shell every note here shares — the id, the asset, the unit, the two
 *  ends. Only the reason it exists differs. */
function buildNote(
  market: AaveV4NoteMarket,
  symbol: string,
  from: MarketNotePoint,
  to: MarketNotePoint,
  endedBy: PriceGapNote["endedBy"],
  move: AssetMove | null,
  live?: true,
): PriceGapNote {
  return {
    id: noteId(market, symbol, from.block, live ? "head" : to.block),
    kind: "price-gap",
    protocol: "aave-v4",
    marketSymbol: symbol,
    marketAddress: market.addresses[symbol] ?? "",
    unitLabel: `USD per ${symbol}`,
    from,
    to,
    changePct: (to.value / from.value - 1) * 100,
    // A price-only note states no runway, so it states no share of one
    // either: 0 with `consumed` infinite is the shape `PriceGapNote` already
    // documents for "there was no runway left to consume".
    consumed: move ? move.consumed : Infinity,
    runway: move ? move.runway : 0,
    endedBy,
    ...(move ? { health: move.health } : {}),
    ...(live ? { live } : {}),
  };
}

/**
 * The stretches between two of this position's own rows where one asset's
 * oracle price moved enough to matter to THIS position.
 *
 * The ends are the position's own rows and nothing else. For each asset the
 * spoke's rows are reduced to the ones that STATE that asset's price, and
 * consecutive pairs of those are the candidate stretches. A pair is dropped
 * where:
 *
 *   - A is a liquidation row (a seizure is an outcome, not a starting state);
 *   - A did not hold the asset, or carried no debt at all (no runway);
 *   - the two rows share a block (one moment, not a stretch);
 *   - the two prices are equal (one reading twice).
 *
 * A stretch ending in a liquidation renders whatever the move, but ONLY for
 * the asset that liquidation seized: the price of the position's other assets
 * across the same stretch is not the liquidation's story, and a note that
 * claimed otherwise would read as a cause. Every other stretch is measured
 * against the asset's own runway, and needs a health payload to be measured at
 * all.
 *
 * The sentence never claims the move caused the liquidation — measured
 * 2026-09-06 on `0x38e3…`, cbBTC ROSE 5.9% into a liquidation that seized
 * cbBTC, because the debt side moved.
 */
export function aaveV4PriceGapNotesFor(events: readonly BaseActivityEvent[], market: AaveV4NoteMarket): PriceGapNote[] {
  const rows = spokeRows(events, market.spokeName);
  if (rows.length < 2) return [];
  const out: PriceGapNote[] = [];

  for (const symbol of assetUniverse(rows)) {
    const observations: { row: BaseActivityEvent; price: number }[] = [];
    for (const row of rows) {
      const price = assetPriceOn(row, symbol);
      if (price > 0) observations.push({ row, price });
    }
    for (let i = 0; i < observations.length - 1; i++) {
      const a = observations[i];
      const b = observations[i + 1];
      const da = aaveV4Data(a.row);
      const db = aaveV4Data(b.row);
      if (!da || !db) continue;
      if (da.eventType === "liquidation") continue;
      if (!heldAt(a.row, symbol)) continue;
      if (!carriesDebt(a.row)) continue;
      if (b.row.blockNumber <= a.row.blockNumber) continue;
      if (a.price === b.price) continue;

      const endsInLiquidation = db.eventType === "liquidation";
      const seized = endsInLiquidation && db.collateralSymbol === symbol;
      // A liquidation is only this asset's ending if this asset is what it
      // took; otherwise the stretch is not stated at all.
      if (endsInLiquidation && !seized) continue;

      const move = assetMove(a.row, symbol, a.price, b.price, market.lts);
      if (!seized) {
        // No health payload is no measurement: an adjustment-ended stretch
        // has nothing to be judged against, so it is withheld rather than
        // stated on a threshold it was never tested by.
        if (!move) continue;
        if (!(move.consumed >= RUNWAY_SHARE)) continue;
      }

      out.push(
        buildNote(
          market,
          symbol,
          eventPoint(a.row, da, a.price),
          eventPoint(b.row, db, b.price),
          endsInLiquidation ? "liquidation" : "adjustment",
          move,
        ),
      );
    }
  }
  return out;
}

/**
 * Whether this row HOLDS the asset as collateral — the guard a live note's
 * earlier end passes.
 *
 * The snapshot answers it directly where it has one. Where it does not, the
 * row's own running balance does: a row whose `reserveSymbol` is the asset and
 * whose `supplyAfter` is positive left the position holding it, whatever the
 * snapshot enumerated. Reading only the snapshot would drop a live note on an
 * index that filled `allSupplies` unevenly, and a live note a reader has come
 * to expect must not be absent.
 */
function heldAsCollateralAt(e: BaseActivityEvent, symbol: string): boolean {
  const d = aaveV4Data(e);
  if (!d) return false;
  if ((d.allSupplies ?? []).some((i) => i.symbol === symbol)) return true;
  return d.reserveSymbol === symbol && Number(d.supplyAfter ?? 0) > 0;
}

/** The row a live note about `symbol` runs FROM: this position's newest
 *  non-liquidation row that carried debt and held the asset. It no longer has
 *  to state a price — the price at its block is read from the feed. */
function liveEarlierRow(rows: readonly BaseActivityEvent[], symbol: string): BaseActivityEvent | null {
  let a: BaseActivityEvent | null = null;
  for (const row of rows) {
    const d = aaveV4Data(row);
    if (!d || d.eventType === "liquidation") continue;
    if (!carriesDebt(row) || !heldAsCollateralAt(row, symbol)) continue;
    a = row;
  }
  return a;
}

/**
 * The blocks the live builder will need a pinned oracle read at — one per
 * distinct earlier row, which in practice is one for the whole position and
 * two only where a collateral was last held on an older row than the rest.
 *
 * Exported so the page can fetch those reads BEFORE building, without
 * restating the selection rule: the page asks which blocks, the builder picks
 * the same rows again.
 */
export function aaveV4LiveEarlierBlocks(
  events: readonly BaseActivityEvent[],
  market: AaveV4NoteMarket,
  heldCollateral: readonly string[],
): number[] {
  const rows = spokeRows(events, market.spokeName);
  const blocks = new Set<number>();
  for (const symbol of heldCollateral) {
    const a = liveEarlierRow(rows, symbol);
    if (a) blocks.add(a.blockNumber);
  }
  return [...blocks];
}

/**
 * The LIVE notes: one per collateral asset the spoke shows this position
 * holding right now, from its newest qualifying row to a live read of Aave's
 * oracle at the chain head.
 *
 * BOTH ENDS ARE CHAIN READS OF THE SAME ORACLE. The later end is the oracle at
 * head; the earlier end is the same oracle pinned to the earlier row's block,
 * which is the whole point of the design — the row is the moment the note runs
 * from, but nothing about the price it states is read from the row.
 *
 * Collateral only, and only while the position carries debt: a live note
 * answers what the market has done to this position since it last touched it,
 * and the answer for a debt asset the position no longer owes is not a fact
 * about the position. Unthresholded, like every other live note — nothing
 * having moved is itself the fact.
 *
 * The health payload values the earlier row's basket at the amounts and
 * thresholds it always did, but at the PINNED prices: "amounts and every other
 * price frozen at the earlier row, only this asset's price moved" is unchanged
 * as a rule, and the frozen prices are now the chain's at that block.
 */
export function liveAaveV4PriceGapNotes(
  events: readonly BaseActivityEvent[],
  market: AaveV4NoteMarket,
  live: AaveV4LiveRead,
): PriceGapNote[] {
  if (!(live.block > 0)) return [];
  const rows = spokeRows(events, market.spokeName);
  if (rows.length === 0) return [];
  const out: PriceGapNote[] = [];

  for (const symbol of live.heldCollateral) {
    const price = live.prices[symbol];
    if (!(price > 0)) continue;

    const a = liveEarlierRow(rows, symbol);
    const da = a ? aaveV4Data(a) : null;
    if (!a || !da) continue;

    // The feed at the earlier row's own block. No pinned read for that block,
    // or no entry for this asset in it, is no note — the same guard the head
    // end applies, and never the row's stated price as a substitute.
    const pinned = live.earlier[a.blockNumber];
    const priceA = pinned?.[symbol];
    if (!(priceA != null && priceA > 0)) continue;

    const to: MarketNotePoint = {
      block: live.block,
      timestamp: live.timestamp ?? 0,
      value: price,
      txHash: "",
      logIndex: -1,
      wallet: "",
      kind: "head",
    };
    // A live note that states nothing is not a note: this spoke can hold a
    // basket of pegged assets, and an unthresholded live gap on one of those
    // renders a row whose every figure reads the same at both ends. The
    // shared rule decides — the move against a floor, or against this
    // position's own runway (`liveGapStatesAChange`). Where the basket is not
    // fully priced there is no runway to measure, so the move alone answers.
    const move = assetMove(a, symbol, priceA, price, market.lts, pinned);
    const relative = Math.abs(price / priceA - 1);
    if (!liveGapStatesAChange(relative, move?.consumed ?? 0)) continue;

    out.push(buildNote(market, symbol, eventPoint(a, da, priceA), to, "head", move, true));
  }
  return out;
}
