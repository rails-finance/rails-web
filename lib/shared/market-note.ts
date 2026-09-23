// Market notes — a receipted fact about the MARKET, placed between two of the
// account's own events.
// ----------------------------------------------------------------------------
// A note is not an event and never becomes one. It states two receipted
// observations and the block range between them, and it is attached to the
// timeline at RENDER time by the id of the event it sits beside — it never
// enters `tl`, `displayedEvents` or the timeline's row list, so no count on the
// page (event totals, run collapse, paging, filter option counts, "Showing X of
// Y rows", `eventNumberOf`, the markdown/CSV event tables) can move because a
// note exists.
//
// Everything here is pure and React-free: the placement rule and the phase-1
// selector are the two things worth proving in isolation, and
// `scripts/verify/verify-market-note-placement.mjs` runs them directly — it
// loads THIS FILE, not a copy of its rules. That is why every import below is
// `import type`: a type import is erased before resolution, so node's type
// stripping can load the module with no bundler, no alias resolution and no
// build step. The handful of Intl calls at the foot are spelled out here for
// the same reason, rather than reaching for `lib/utils/format`.
//
// PLACEMENT. The anchor is the first DISPLAYED event, in ascending block order,
// whose `blockNumber ≥ note.to.block`. The note is only known to have happened
// by `to.block`, so placing it before an account event that precedes that block
// would claim an ordering the chain has not stated. In ascending display order
// the note renders immediately BEFORE its anchor's row, in descending order
// immediately AFTER it (below = older). A note whose anchor is filtered out
// re-anchors on the next surviving event; a note with no event at or past
// `to.block` does not render at all — there is nothing for it to sit between.
//
// PHASE 1 is the Moonwell Base share-rate step: a market's own exchange rate
// (underlying ÷ mTokens at each Mint and Redeem) moving with no Mint or Redeem
// in the market to explain it. It needs no oracle — the rate is derivable from
// the Mint/Redeem rows the index already holds.
//
// PHASE 2a is the Liquity V2 price gap: the branch's own oracle price at two of
// the trove's own events, and what the price alone did to the collateral ratio
// recorded at the earlier one. It needs no endpoint at all — every Liquity V2
// row already carries `collateralPrice`, the PriceFeed reconstruction at that
// event's block.
//
// PHASE 3 is the Polaris primary-rate step: the market's own primary rate (an
// algorithmic Peg Stability Rate, set on the market's PSM mints/redemptions,
// never chosen by a holder) moving between two of a CDP's OWN touches on the
// market it borrows in. Unlike the other two kinds, both ends are the
// position's own events — the rate is already on the row
// (`context.data.primaryRate`), so this needs no endpoint and no oracle
// either. The PrimaryRateSet log each rate was read from is optional on the
// type: it feeds the receipt when the backend's per-row join has it, and a
// note still renders off the CDP's own two touches when it does not.
//
// A note's KIND is the discriminant everything downstream switches on, once:
// the row picks a sentence and a receipt vocabulary from it, and the markdown
// exports pick a phrasing from it. Nothing else branches — the placement rule,
// the geometry, the mark and the never-counted guarantee are the same for every
// kind, and a third kind should have to touch only the four prose helpers at
// the foot of this file and its own provenance module.

import type {
  BaseActivityEvent,
  LiquityContext,
  MoonwellContext,
  PolarisContext,
} from "@/lib/shared/types/event-shape";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import type { Provenance } from "@/components/shared/provenance";

/** The Moonwell context on an event, or null. The narrowing is spelled out
 *  rather than imported (`isMoonwellEvent`) to keep this module's imports
 *  type-only — see the header. The discriminant is the same one that guard
 *  reads: `context.protocol`. */
const moonwellData = (e: BaseActivityEvent): MoonwellContext | null =>
  e.context?.protocol === "moonwell" ? (e.context.data as MoonwellContext) : null;

/** The Liquity V2 trove context on an event, or null — the same spelled-out
 *  narrowing, reading the discriminant `isLiquityEvent` reads. */
const liquityData = (e: BaseActivityEvent): LiquityContext | null =>
  e.context?.protocol === "liquity-v2-troves" ? (e.context.data as LiquityContext) : null;

/** The polaris context on an event, or null — the same spelled-out narrowing
 *  the other two helpers use, reading the discriminant `isPolarisEvent`
 *  reads. `PolarisContext.rateSet` (the backend's per-row PrimaryRateSet
 *  join, plan §3) is optional: the log coordinates are read when present (a
 *  row the join has reached) and simply absent otherwise (a row before it
 *  lands, or a synthetic test event) — never a reason a note fails to
 *  exist. */
const polarisData = (e: BaseActivityEvent): PolarisContext | null =>
  e.context?.protocol === "polaris" ? (e.context.data as PolarisContext) : null;

/** One end of a note: a chain observation, with the log it was read from.
 *  `kind` is usually the operation/event type the log carries — except a
 *  LIVE end (a market quantity read at the chain head, never a log): there
 *  `kind` is the literal `"head"`, `txHash` is `""`, `logIndex` is `-1`,
 *  `wallet` is `""` and `eventId` is never set. Its receipt names the route
 *  and contract read rather than a transaction. */
export interface MarketNotePoint {
  block: number;
  /** Unix seconds. 0 when neither the step's own sample nor a displayed event
   *  at this block dated it — nothing renders it, so an undated observation
   *  costs the note nothing. Also 0 for a live end whose route states no
   *  timestamp of its own (see the LIVE END note above). */
  timestamp: number;
  value: number;
  /** The observation's own log: an event on this page (eventId) or elsewhere
   *  (txHash + logIndex + wallet). */
  eventId?: string;
  txHash: string;
  logIndex: number;
  wallet: string;
  kind: string;
}

/** The position's own slice across the note, where the ledger gives one. */
export interface MarketNoteSlice {
  units: number;
  unitSymbol: string;
  before: number;
  after: number;
  valueSymbol: string;
}

/** What every note carries, whatever it observed: two ends and the market they
 *  were observed in. */
export interface MarketNoteBase {
  /** Stable: `${kind}:${market}:${fromBlock}-${toBlock}`, or
   *  `${kind}:${market}:${fromBlock}-head` for a live note (see `live`). */
  id: string;
  marketSymbol: string;
  marketAddress: string;
  /** "MAMO per mMAMO", "USD per WETH" — what one unit of `value` counts. */
  unitLabel: string;
  from: MarketNotePoint;
  to: MarketNotePoint;
  /** The anchor: the first account event (ascending) with
   *  `blockNumber ≥ to.block`. Set by `anchorMarketNotes`. Never set on a
   *  live note — it has no anchor and renders in the timeline's head slot
   *  instead (see ChainTruthTimeline's `liveNotes` prop). */
  anchorEventId?: string;
  /** True when `to` is a live chain read at the head rather than a second of
   *  this position's own events — "what has the market done to this
   *  position since it last touched it". Never anchored, never gated on any
   *  move-size threshold: the note renders whenever the position is open and
   *  the live read exists, because "nothing has moved" is itself the fact.
   *  One position can have a live and a historical note of the same kind at
   *  once — they answer different questions. */
  live?: true;
  /** Which protocol's selector built the note, where the kind alone does not
   *  say how to read it — the prose, the row body and the receipts branch on
   *  it (`"aave-v4"`, `"makerdao"`). Absent on the three original homes
   *  (Liquity V2, Polaris, Moonwell), which the kind and `measureKind`
   *  already tell apart. */
  protocol?: string;
}

/** Moonwell Base: a market's own exchange rate stepped between two adjacent
 *  Mint/Redeem observations in the market. */
export interface ShareRateStepNote extends MarketNoteBase {
  kind: "share-rate-step";
  ratio: number;
  slice?: MarketNoteSlice;
}

/** Liquity V2: the branch's oracle price at two of the trove's own events, and
 *  what the price alone did to the ratio recorded at the earlier one. */
export interface PriceGapNote extends MarketNoteBase {
  kind: "price-gap";
  /** Signed percent, `(to − from) / from × 100`. */
  changePct: number;
  /** The fraction of the position's runway the move consumed — `Infinity` when
   *  the position was already at or below the branch minimum at the earlier
   *  price, so there was no runway left to consume. */
  consumed: number;
  /** The fraction the price could have fallen at the earlier event before the
   *  position reached the branch minimum. Never ≤ 0 unless `consumed` is
   *  `Infinity`. */
  runway: number;
  /** What the stretch ends in: a stretch ending in a liquidation or a
   *  redemption always renders, whatever the move (§ the threshold rule).
   *  `"head"` is the live end (see `MarketNoteBase.live`) — also unthresholded,
   *  for the same reason: "nothing has moved" is itself the fact. */
  endedBy: "adjustment" | "liquidation" | "redemption" | "head";
  position?: PriceGapPosition;
  /** What the price is denominated in, for the header's measure mark and the
   *  row's prose — absent (Liquity V2) means USD; `"protocol"` means the
   *  price is the PROTOCOL's own unit (Polaris: USDp/GOLDp, not USD), and the
   *  mark under the asset chip is that protocol's own icon rather than the
   *  dollar. */
  measureKind?: "protocol";
  /** The protocol id the measure mark resolves an icon for, when
   *  `measureKind` is `"protocol"` (`protocolIconSrc`). */
  measureProtocolId?: string;
  /** Which Polaris market this note belongs to — set only by
   *  `polarisPriceGapNotesFor`, and only so the note's own provenance module
   *  can name the right CDPManager/price-feed contract; nothing here reads
   *  it for any other reason. */
  polarisMarket?: "usdp" | "goldp";
  /** Aave V4 only (`protocol: "aave-v4"`): what the move did to the health
   *  factor of the WHOLE basket the earlier row recorded. `position` stays
   *  unset on those notes — an Aave account holds several collaterals and
   *  several debts, so there is no single collateral ratio to state. Absent
   *  where the earlier row's basket is not fully priced or a collateral's
   *  liquidation threshold is unknown: the note is then price-only, and an
   *  adjustment-ended stretch is not stated at all (nothing to measure the
   *  move against). */
  health?: PriceGapHealth;
}

/** The whole basket's health across a price gap, on an Aave V4 spoke
 *  position. Every amount and every OTHER asset's price is the earlier row's
 *  own snapshot; only this asset's price moves between the two figures.
 *
 *  `ltSource` is the sharp edge stated in the type: Aave V4 exposes no static
 *  per-reserve liquidation threshold, so the LT here is the one the spoke
 *  reports NOW (the chain overlay's `reserves[].lt`, harvested from
 *  `getUserAccountData.avgCollateralFactor` — see
 *  lib/aave-v4/liquidation-thresholds.ts), applied to amounts and prices
 *  recorded at a past block. The threshold in force AT that block is not
 *  indexed, and the receipt says so in words. */
export interface PriceGapHealth {
  /** Σ(collateral × price × LT) ÷ Σ(debt × price) at the earlier price. */
  hfBefore: number;
  /** The same amounts with only this asset's price moved to the later one. */
  hfAfter: number;
  /** The LT-weighted collateral, in USD, at the earlier price. */
  collateralUsd: number;
  /** The debt, in USD, at the earlier price. */
  debtUsd: number;
  /** The block the amounts and the other assets' prices were recorded at. */
  atBlock: number;
  ltSource: "chain-head";
}

/** The position's own state across a price gap: the debt and collateral its
 *  own log recorded at the earlier event, and the ratio those made at each
 *  end's price. Nothing here is read at the later block — the index says what
 *  the position was at A, and the note moves only the price. */
export interface PriceGapPosition {
  /** Collateral ratio in percent at the earlier price. */
  crBefore: number;
  /** The same debt and collateral at the later price, in percent. */
  crAfter: number;
  /** The branch minimum, in percent (110 for WETH). */
  mcrPct: number;
  debt: number;
  coll: number;
  /** The block the debt and collateral were recorded at — A's block. */
  atBlock: number;
}

/** An ERC-4626 vault's OWN TERMS, changed for every holder at once — the
 *  vault surfaces' note (MetaMorpho's fee, name and symbol; Aave's target
 *  rate, cooldown and unstake window; whatever a third family emits).
 *
 *  It is a note for exactly the reason the other three are: a row is something
 *  this holder did, and a configuration event happened to every holder at the
 *  same moment. Placing it among the rows by block is what lets a reader see
 *  WHEN the terms moved relative to their own events; keeping it out of every
 *  count is what stops it being read as one of them.
 *
 *  UNLIKE THE OTHER THREE KINDS IT CARRIES ITS OWN WORDS AND ITS OWN RECEIPT.
 *  Those are one quantity observed twice, so the row can say what moved from
 *  the two figures alone. A configuration event is not that shape:
 *  `TargetRateUpdated` states one rate and no earlier one, `CooldownChanged`
 *  states two second-counts, `UpdateName` states a string — and what each MEANS
 *  is the family's own mechanic, which is why each family already builds the
 *  receipt for it beside that mechanic (`lib/<family>/vault-timeline-provenance.ts`).
 *  So the family hands over the figure, the noun, the sentence and the receipt,
 *  and this row draws them. Six arms of two families' prose inside the shared
 *  row would be the thing those per-family modules exist to prevent.
 *
 *  AND IT STATES NO DIRECTION. An event that states only its new value has no
 *  earlier value to compare it against, so the row draws no direction glyph and
 *  no step mark for this kind: either would be a move nothing read. */
export interface VaultTermsNote extends MarketNoteBase {
  kind: "vault-terms";
  /** The family's own `VaultNote["kind"]` — `"fee"`, `"target-rate"`, … Free
   *  text here because the two families' unions do not meet and a third
   *  family's will not either; nothing switches on it, it is carried so a
   *  receipt and a test can name which event this was. */
  termsKind: string;
  /** The one figure the header states — the new rate, the new seconds, the new
   *  name — as the family formats it. */
  headline: string;
  /** The quiet word after it naming what that figure counts ("target rate",
   *  "performance fee"). */
  quantity: string;
  /** The whole sentence, as the family states it: what the event says, in the
   *  contract's own units. */
  statement: string;
  /** The family's receipt for that sentence, built beside the mechanic. */
  prov: Provenance;
  /** The protocol whose mark sits under the vault's in the header pair. */
  measureProtocolId: string;
  /** The event's own non-indexed words, raw, in the order the contract
   *  declares them — what the sentence above was written from. */
  fields: Record<string, string>;
}

export type MarketNote = ShareRateStepNote | PriceGapNote | RateStepNote | VaultTermsNote;

/** One vault-wide configuration event as a note the timeline shell can place.
 *
 *  The family supplies `say` — the figure, the noun, the sentence and the
 *  receipt for one of its own events — and everything else here is the shape
 *  the shell needs: an id, the block to anchor by, and the marks. The note's
 *  two ends are the SAME observation, because there is only one: a
 *  configuration event is a single log, not a quantity read twice. */
export function vaultTermsNotes<N extends VaultTermsSource>(
  notes: readonly N[],
  vault: { address: string; shareSymbol: string; protocolId: string },
  say: (note: N) => { headline: string; quantity: string; statement: string; prov: Provenance },
): VaultTermsNote[] {
  return notes.map((note) => {
    const words = say(note);
    const point: MarketNotePoint = {
      block: note.blockNumber,
      timestamp: note.timestamp,
      value: 0,
      txHash: note.txHash,
      // A vault note is read by topic over the whole chain rather than out of
      // one transaction's log list, so its index within that transaction is
      // not a figure this path holds. −1 is the same "no log index" the live
      // ends of the other kinds carry.
      logIndex: -1,
      wallet: "",
      kind: note.kind,
    };
    return {
      kind: "vault-terms",
      id: `vault-terms:${note.kind}:${note.txHash}`,
      marketSymbol: vault.shareSymbol,
      marketAddress: vault.address,
      unitLabel: words.quantity,
      from: point,
      to: point,
      termsKind: note.kind,
      headline: words.headline,
      quantity: words.quantity,
      statement: words.statement,
      prov: words.prov,
      measureProtocolId: vault.protocolId,
      fields: note.fields,
    };
  });
}

/** What `vaultTermsNotes` needs of a family's own note shape — satisfied by
 *  `AaveVaultNote` and `MorphoVaultNote` alike (lib/shared/vault-holder-timeline.ts)
 *  without this module importing either of them. */
export interface VaultTermsSource {
  kind: string;
  blockNumber: number;
  timestamp: number;
  txHash: string;
  fields: Record<string, string>;
}

/** One end of a step as the share-rate endpoint states it
 *  (`GET /api/moonwell-base/markets/:mtoken/share-rate?steps=1`).
 *
 *  NEITHER END IS ASSUMED TO BE THIS ACCOUNT'S. The series is the whole
 *  market's, so both observations are whoever's Mint or Redeem happened to be
 *  adjacent to the change — on the MAMO step (measured 2026-09-04) they are two
 *  other wallets' redeems, with four more wallets' redeems in between the
 *  account's own last mint and the step. Every figure the note states about an
 *  observation comes from here. */
export interface ShareRateStepPoint {
  txHash: string;
  logIndex: number;
  wallet: string;
  kind: string;
}

/** A step in a market's own exchange rate, as the endpoint states it. */
export interface ShareRateStep {
  fromBlock: number;
  toBlock: number;
  /** Unix seconds at each end, where the endpoint states them. */
  fromTs?: number;
  toTs?: number;
  fromRate: number;
  toRate: number;
  ratio: number;
  from: ShareRateStepPoint;
  to: ShareRateStepPoint;
}

const EMPTY_ANCHORS: ReadonlyMap<string, MarketNote[]> = new Map();

/** Chain order for two events of one position: block, then the log index at
 *  the tail of the id. The two separators in use are both accepted —
 *  `${txHash}-${logIndex}` (Moonwell) and `${txHash}_${logIndex}` (Liquity
 *  V2) — because the tie-break matters most exactly where a position has
 *  several logs in one block, which is where reading the wrong separator
 *  would silently give every row the same key. An id with neither sorts first
 *  within its block; every id this repo builds carries one. */
function logIndexOf(e: BaseActivityEvent): number {
  const cut = Math.max(e.id.lastIndexOf("-"), e.id.lastIndexOf("_"));
  if (cut < 0) return -1;
  const n = Number(e.id.slice(cut + 1));
  return Number.isFinite(n) ? n : -1;
}
const byChainOrder = (a: BaseActivityEvent, b: BaseActivityEvent): number =>
  a.blockNumber - b.blockNumber || logIndexOf(a) - logIndexOf(b);

/** The log index from a polaris event id's TAIL `:N` segment
 *  (`cdp_updated:<txHash>:<logIndex>`). `logIndexOf` above splits on the LAST
 *  `-` or `_` — and a polaris id's own `cdp_updated` prefix carries an
 *  underscore, so that split lands inside the word "updated", not at the
 *  tail, and silently returns -1 rather than the real index. This is a
 *  narrow fix for that one id shape; it does not touch `logIndexOf`'s
 *  contract for the other two kinds. */
function polarisLogIndexOf(e: BaseActivityEvent): number {
  const cut = e.id.lastIndexOf(":");
  if (cut < 0) return -1;
  const n = Number(e.id.slice(cut + 1));
  return Number.isFinite(n) ? n : -1;
}

/**
 * Pure placement. Input: the notes, the DISPLAYED events in display order, and
 * the display direction. Output: `anchorEventId → notes`, for the notes that
 * found an anchor; the rest are dropped (see PLACEMENT above).
 *
 * Each anchor's list is ordered the way the rows around it read: oldest first
 * ascending, newest first descending — so the caller renders the array as it
 * comes, before the anchor's row (asc) or after it (desc).
 *
 * THE DIRECTION PARAMETER OUTLIVES THE TIMELINE'S OWN SECOND ORDER. Every
 * on-page timeline reads newest-first and passes "desc" (2026-09-12). The
 * ascending arm is the MARKDOWN EXPORTS' — `lib/<proto>/*-to-markdown.ts`
 * renders a life forwards, and a note placed for the page's order would land
 * on the wrong side of its anchor there. Two readings of one history, so the
 * placement stays a parameter rather than a constant.
 */
export function anchorMarketNotes(
  notes: readonly MarketNote[],
  events: readonly BaseActivityEvent[],
  sortDirection: "asc" | "desc",
): ReadonlyMap<string, MarketNote[]> {
  if (notes.length === 0 || events.length === 0) return EMPTY_ANCHORS;
  // The displayed list, oldest first, whatever direction it is drawn in.
  const ascending = sortDirection === "asc" ? events : [...events].reverse();
  const out = new Map<string, MarketNote[]>();
  const anchored: MarketNote[] = [];
  for (const note of notes) {
    const anchor = ascending.find((e) => e.blockNumber >= note.to.block);
    if (!anchor) continue;
    anchored.push({ ...note, anchorEventId: anchor.id });
  }
  anchored.sort((a, b) =>
    sortDirection === "asc" ? a.to.block - b.to.block || cmp(a.id, b.id) : b.to.block - a.to.block || cmp(b.id, a.id),
  );
  for (const note of anchored) {
    const list = out.get(note.anchorEventId!);
    if (list) list.push(note);
    else out.set(note.anchorEventId!, [note]);
  }
  return out;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The market a share-rate series belongs to, as the position page names it.
 *
 *  `key` is what a Moonwell event carries in `context.data.market` — the
 *  roster's own market key ('mamo', 'weth'), NOT the mToken address — so the
 *  selector needs both it and the address the endpoint is keyed by. */
export interface ShareRateMarket {
  /** mToken address, lowercased — the endpoint's market id and the note's. */
  address: string;
  /** The market key on the event context. */
  key: string;
  /** The underlying's display symbol (MAMO). */
  symbol: string;
}

/**
 * Phase-1 selector: which of a market's steps apply to THIS position, and the
 * position's own slice across each.
 *
 * A step applies when it sits inside the position's life (`fromBlock` at or
 * after the position's first event) AND the position held the market's mTokens
 * across it — the last SUPPLY-side event of the position in that market at or
 * before `fromBlock` left a positive `mTokensAfter`. That balance is the slice.
 *
 * Supply-side is the load-bearing word: only mint / redeem / transfer rows
 * carry an mToken balance at all. A borrow or repay in the same market states
 * none and moves none, so the last supply-side balance is the one that stood at
 * `fromBlock` — reading "the last event in the market" instead would drop a
 * note wherever the account happened to borrow after its last deposit.
 */
export function shareRateNotesFor(
  steps: readonly ShareRateStep[],
  market: ShareRateMarket,
  events: readonly BaseActivityEvent[],
  /** The folders a grouped page holds beside `events`. Their members are not
   *  in `events`, so a seize, a send or a receipt inside one can move the
   *  balance between the row `held` is read from and the step — and the slice
   *  would then state a holding the position no longer had. Such a step is not
   *  stated: an absent note, never a wrong one. */
  folders?: readonly ServedFolder[] | null,
): ShareRateStepNote[] {
  if (steps.length === 0 || events.length === 0) return [];
  const ascending = [...events].sort(byChainOrder);
  const firstBlock = ascending[0].blockNumber;
  const address = market.address.toLowerCase();
  const mSymbol = `m${market.symbol}`;
  const unitLabel = `${market.symbol} per ${mSymbol}`;

  // The position's own supply-side rows in this market, oldest first — the
  // eligibility test and the slice both read this list.
  const balanceRows = ascending.filter((e) => {
    const d = moonwellData(e);
    return d != null && d.market === market.key && d.side === "supply" && d.mTokensAfter != null;
  });
  /** The event on this page that IS this observation, if any — matched on the
   *  log itself (transaction + log index), never on the block: a step's ends
   *  belong to whoever transacted next in the market, and the account may well
   *  have an unrelated event in the same block. */
  const eventForLog = (p: ShareRateStepPoint): BaseActivityEvent | undefined => {
    const txHash = p.txHash.toLowerCase();
    return ascending.find((e) => e.txHash.toLowerCase() === txHash && logIndexOf(e) === p.logIndex);
  };

  const out: ShareRateStepNote[] = [];
  for (const step of steps) {
    if (!isPositiveRate(step.fromRate) || !isPositiveRate(step.toRate)) continue;
    if (step.fromBlock < firstBlock) continue;
    let held: BaseActivityEvent | undefined;
    for (const e of balanceRows) {
      if (e.blockNumber > step.fromBlock) break;
      held = e;
    }
    const heldData = held ? moonwellData(held) : null;
    if (!heldData) continue;
    const heldBlock = held!.blockNumber;
    if (
      folders?.some((f) => f.lastBlock >= heldBlock && f.firstBlock <= step.fromBlock && folderMovesMTokens(f, address))
    )
      continue;
    const units = Number(heldData.mTokensAfter);
    if (!Number.isFinite(units) || units <= 0) continue;

    out.push({
      id: `share-rate-step:${address}:${step.fromBlock}-${step.toBlock}`,
      kind: "share-rate-step",
      marketSymbol: market.symbol,
      marketAddress: address,
      unitLabel,
      from: point(step.fromBlock, step.fromTs, step.fromRate, step.from, eventForLog(step.from)),
      to: point(step.toBlock, step.toTs, step.toRate, step.to, eventForLog(step.to)),
      ratio: step.ratio,
      slice: {
        units,
        unitSymbol: mSymbol,
        before: units * step.fromRate,
        after: units * step.toRate,
        valueSymbol: market.symbol,
      },
    });
  }
  return out;
}

const isPositiveRate = (n: number): boolean => Number.isFinite(n) && n > 0;

/** Whether a served folder's members could have moved one market's mToken
 *  balance: a seize of it, a send or a receipt of it, or members of a kind the
 *  header does not name at all (`other`), which are counted as possibly
 *  touching it because nothing on the folder says otherwise. */
function folderMovesMTokens(folder: ServedFolder, mtoken: string): boolean {
  return (
    folder.other > 0 ||
    folder.legs.some(
      (leg) => (leg.verb === "Seized" || leg.verb === "Sent" || leg.verb === "Received") && leg.asset === mtoken,
    )
  );
}

/** One end of a note. Every field is the endpoint's, except `eventId`, which is
 *  set only where this exact log is also an event on this page — usually it is
 *  not, since the market's next transactor is rarely this account. */
function point(
  block: number,
  ts: number | undefined,
  value: number,
  end: ShareRateStepPoint,
  own: BaseActivityEvent | undefined,
): MarketNotePoint {
  return {
    block,
    timestamp: ts ?? own?.timestamp ?? 0,
    value,
    ...(own ? { eventId: own.id } : {}),
    txHash: end.txHash.toLowerCase(),
    logIndex: end.logIndex,
    wallet: end.wallet.toLowerCase(),
    kind: end.kind,
  };
}

/**
 * A LIVE share-rate note: the position's own newest Mint/Redeem in the
 * market — its own implied rate (`assetsDelta ÷ mTokensDelta`) — against the
 * market's own exchange rate read live at the chain head.
 *
 * Unlike `shareRateNotesFor`'s historical steps (two OTHER wallets' logs
 * bracketing a change the market made, with the account's balance carried
 * across as the slice), both ends here are the account's OWN: the earlier
 * one is its own log, and the slice holds its CURRENT holding fixed and
 * moves only the rate — "what this wallet's holding is worth now against
 * what it was worth when it last touched this market", not a balance
 * replayed at some past block. No note where the account has no Mint or
 * Redeem in the market at all: there is no rate of its own to compare the
 * live one against.
 */
export function liveShareRateNote(
  events: readonly BaseActivityEvent[],
  market: ShareRateMarket,
  live: { rate: number; block: number; timestamp?: number; units: number },
  /** The folders a grouped page holds beside `events`. A folder newer than the
   *  newest Mint/Redeem found here, holding members of a kind its header does
   *  not name, may hold a NEWER one — so the note is not stated rather than
   *  measured from a touch that was not the last. */
  folders?: readonly ServedFolder[] | null,
): ShareRateStepNote | null {
  if (!isPositiveRate(live.rate) || !(live.units > 0)) return null;
  const address = market.address.toLowerCase();
  const mSymbol = `m${market.symbol}`;
  const unitLabel = `${market.symbol} per ${mSymbol}`;

  let latest: BaseActivityEvent | null = null;
  for (const e of events) {
    const d = moonwellData(e);
    if (!d || d.market !== market.key || d.side !== "supply") continue;
    if (d.eventType !== "mint" && d.eventType !== "redeem") continue;
    if (d.assetsDelta == null || d.mTokensDelta == null) continue;
    if (!latest || byChainOrder(latest, e) < 0) latest = e;
  }
  if (!latest) return null;
  const latestBlock = latest.blockNumber;
  if (folders?.some((f) => f.other > 0 && f.lastBlock >= latestBlock)) return null;
  const d = moonwellData(latest)!;
  const assets = Math.abs(Number(d.assetsDelta));
  const mTokens = Math.abs(Number(d.mTokensDelta));
  if (!Number.isFinite(assets) || !Number.isFinite(mTokens) || mTokens <= 0) return null;
  const fromRate = assets / mTokens;
  if (!isPositiveRate(fromRate)) return null;

  const from: MarketNotePoint = {
    block: latest.blockNumber,
    timestamp: latest.timestamp,
    value: fromRate,
    eventId: latest.id,
    txHash: latest.txHash.toLowerCase(),
    logIndex: logIndexOf(latest),
    wallet: (latest.wallet ?? "").toLowerCase(),
    kind: d.eventType,
  };
  const to: MarketNotePoint = {
    block: live.block,
    timestamp: live.timestamp ?? 0,
    value: live.rate,
    txHash: "",
    logIndex: -1,
    wallet: "",
    kind: "head",
  };
  return {
    id: `share-rate-step:${address}:${from.block}-head`,
    kind: "share-rate-step",
    marketSymbol: market.symbol,
    marketAddress: address,
    unitLabel,
    from,
    to,
    ratio: to.value / from.value,
    slice: {
      units: live.units,
      unitSymbol: mSymbol,
      before: live.units * fromRate,
      after: live.units * live.rate,
      valueSymbol: market.symbol,
    },
    live: true,
  };
}

// ── Phase 2a: the Liquity V2 price gap ──────────────────────────────────────

/**
 * How much of the position's own runway a price move has to consume before the
 * stretch is worth stating. Every gap between two events has SOME move in it,
 * so a flat percentage would paper the timeline with notes that meant nothing
 * to this trove; the same 5% is most of the runway of a trove at 116% and
 * barely a fifth of one at 250%. The threshold is therefore a share of the
 * distance the position itself had to the branch minimum, measured at the
 * earlier event.
 *
 * A stretch that ends in a liquidation or a redemption renders whatever the
 * move: those two ends are outcomes, and the price the protocol acted at is
 * part of reading them.
 */
export const RUNWAY_SHARE = 0.25;

// ── What a LIVE price gap has to state to be worth a row ────────────────────
// A live note is unthresholded by design: it runs from the position's last
// touch to the chain head, and "nothing has moved since it was last touched"
// is itself the fact. That holds for an asset that CAN move. On a basket of
// pegged assets the same rule produces a row that says nothing at any grain —
// measured on the Aave V4 forex spoke 2026-09-11, USDC 0.99989 → 0.99966 and
// USDT the same shape: two rows, both 0.0%, the health factor unmoved in
// both. The rule that made those rows is the one below; what it now asks is
// that ONE of the two questions a gap answers has an answer:
//
//   the MOVE cleared a floor — five basis points, under which a USD feed is
//   breathing rather than saying something; OR
//
//   the move consumed a share of THIS position's own runway — the measure
//   every historical stretch is already gated on (`RUNWAY_SHARE`), at a far
//   lower bar, because three basis points on the dominant collateral of a
//   position at a 1.0005 health factor is the whole story and no flat
//   percentage would ever catch it.
//
// Both are needed. The floor alone hides the knife-edge position; the runway
// alone papers a comfortable one with feed jitter. A position with no runway
// left (`consumed` = Infinity) always renders — it is under the line already.
//
// This gates LIVE gaps only. A historical stretch has passed `RUNWAY_SHARE`
// or ends in an outcome that states itself, and its two ends are two things
// the index recorded rather than a reading taken because the page was open.
export const LIVE_GAP_MOVE_FLOOR = 0.0005;
export const LIVE_GAP_RUNWAY_SHARE = 0.05;

/** Whether a live price gap states a change — see above. `move` is the
 *  unsigned relative move, `consumed` its share of the position's runway. */
export function liveGapStatesAChange(move: number, consumed: number): boolean {
  if (!Number.isFinite(move)) return false;
  return move >= LIVE_GAP_MOVE_FLOOR || consumed >= LIVE_GAP_RUNWAY_SHARE;
}

/** The branch a price gap is read in. `mcr` is the branch's own minimum
 *  collateral ratio as a multiplier (1.1 for WETH) — `LIQUITY_V2_BRANCHES` in
 *  lib/liquity/asset-catalog.ts, the protocol's own constant, not the
 *  duplicate table in lib/utils/liquidation-utils.ts. */
export interface PriceGapBranch {
  /** "WETH" / "wstETH" / "rETH" — the collateral the branch prices. */
  collateralType: string;
  mcr: number;
  /** The branch's PriceFeed, for the receipt's contract line. */
  priceFeed?: string;
}

/** The event types that can state a price. A `transfer` carries none of the
 *  position's own economics, so it cannot be an end of a stretch. A
 *  `batch_manager` row (a batch manager's fee or rate change) is priced from
 *  the oracle at its own position since server migration 294. */
const PRICE_GAP_ENDPOINTS = new Set(["trove", "liquidation", "redemption", "batch_manager"]);

/** Zombie adjustments are the owner's answer to a redemption that took the
 *  trove under the minimum debt, so they end a stretch the way a redemption
 *  does — the precedent is liquity-event-detail.tsx, which reads them in the
 *  redemption's vocabulary. */
const ZOMBIE_OPERATIONS = new Set(["adjustZombieTrove", "adjustUnredeemableZombieTrove"]);

/** What each end of a price gap is called in prose. Falls back to the raw
 *  operation, so an operation added upstream reads oddly rather than
 *  disappearing. */
const OPERATION_LABELS: Record<string, string> = {
  openTrove: "opening",
  openTroveAndJoinBatch: "opening",
  adjustTrove: "adjustment",
  adjustTroveInterestRate: "interest-rate change",
  adjustZombieTrove: "zombie adjustment",
  adjustUnredeemableZombieTrove: "zombie adjustment",
  applyPendingDebt: "pending-debt application",
  closeTrove: "close",
  liquidate: "liquidation",
  redeemCollateral: "redemption",
  setInterestBatchManager: "batch join",
  removeFromBatch: "batch exit",
  setBatchManagerAnnualInterestRate: "batch interest-rate change",
  lowerBatchManagerAnnualFee: "batch fee cut",
  transferTrove: "transfer",
};

export const priceGapEndLabel = (p: MarketNotePoint): string => OPERATION_LABELS[p.kind] ?? p.kind;

/**
 * Phase-2a selector: the stretches between two of a trove's own events where
 * the branch's oracle price moved enough to matter to THIS trove.
 *
 * The ends are the trove's own rows and nothing else — no endpoint is fetched
 * and nothing is read at a block the trove did not transact in. A is always a
 * `trove` row (the position's own operation, whoever performed it); B is the
 * next row of any endpoint type after the filter, so a stretch may span the
 * transfer and batch rows sitting between them.
 *
 * Three guards, each of which would otherwise state something the index has
 * not: a row whose `collateralPrice` is 0 (a per-row enrichment gap, not tied
 * to any operation type) is not an observation and cannot be an end; two rows
 * in the SAME block are one moment, not a stretch; and two identical prices
 * are one reading twice, so there is no move to draw.
 */
export function priceGapNotesFor(events: readonly BaseActivityEvent[], branch: PriceGapBranch): PriceGapNote[] {
  const ends = events
    .filter((e) => {
      const d = liquityData(e);
      return d != null && PRICE_GAP_ENDPOINTS.has(d.eventType) && d.collateralPrice > 0;
    })
    .sort(byChainOrder);
  if (ends.length < 2) return [];

  const collateralType = branch.collateralType;
  // 1.1 × 100 is 110.00000000000001 in binary floating point, and the receipt
  // states this figure verbatim beside the formatted one.
  const mcrPct = Math.round(branch.mcr * 100_000) / 1000;
  const unitLabel = `USD per ${collateralType}`;
  const out: PriceGapNote[] = [];

  for (let i = 0; i < ends.length - 1; i++) {
    const a = ends[i];
    const b = ends[i + 1];
    const da = liquityData(a);
    const db = liquityData(b);
    if (!da || !db) continue;
    if (da.eventType !== "trove") continue;
    if (b.blockNumber <= a.blockNumber) continue;

    const priceA = da.collateralPrice;
    const priceB = db.collateralPrice;
    if (priceA === priceB) continue;

    const state = da.stateAfter;
    const debt = state?.debt ?? 0;
    const coll = state?.coll ?? 0;
    // No debt is no runway: nothing about a price move can take a trove that
    // owes nothing to the branch minimum, and the ratio is undefined anyway.
    if (!(debt > 0) || !(coll > 0)) continue;

    // The backend states the ratio it computed from this row's own debt,
    // collateral and price; recomputing is the fallback for a row that left it
    // at 0. The later ratio is the same debt and collateral at the later
    // price, which is exactly the earlier ratio scaled by the price move —
    // taking it that way keeps the two figures in the sentence consistent with
    // each other whichever of the two the earlier one came from.
    const crBefore = state && state.collateralRatio > 0 ? state.collateralRatio : ((coll * priceA) / debt) * 100;
    const crAfter = (crBefore * priceB) / priceA;
    const runway = 1 - branch.mcr / (crBefore / 100);
    const move = Math.abs(priceB / priceA - 1);
    // A trove already at or below the minimum has no runway left for a move to
    // consume — the stretch states itself, rather than being measured against
    // a negative denominator.
    const consumed = runway > 0 ? move / runway : Infinity;

    const endedBy: PriceGapNote["endedBy"] =
      db.eventType === "liquidation"
        ? "liquidation"
        : db.eventType === "redemption" || ZOMBIE_OPERATIONS.has(db.operation)
          ? "redemption"
          : "adjustment";
    if (endedBy === "adjustment" && !(consumed >= RUNWAY_SHARE)) continue;

    out.push({
      id: `price-gap:${collateralType.toLowerCase()}:${a.blockNumber}-${b.blockNumber}`,
      kind: "price-gap",
      marketSymbol: collateralType,
      marketAddress: branch.priceFeed ?? "",
      unitLabel,
      from: eventPoint(a, da, priceA),
      to: eventPoint(b, db, priceB),
      changePct: (priceB / priceA - 1) * 100,
      consumed,
      runway,
      endedBy,
      position: { crBefore, crAfter, mcrPct, debt, coll, atBlock: a.blockNumber },
    });
  }
  return out;
}

/** One end of a price gap. Both ends are events on this page, so each carries
 *  its own `eventId` and the reader can open the card the price was read at. */
function eventPoint(e: BaseActivityEvent, d: LiquityContext, value: number): MarketNotePoint {
  return {
    block: e.blockNumber,
    timestamp: e.timestamp,
    value,
    eventId: e.id,
    txHash: e.txHash.toLowerCase(),
    logIndex: logIndexOf(e),
    wallet: (d.actorAddress ?? e.wallet ?? "").toLowerCase(),
    kind: d.operation,
  };
}

/** Why this stretch is on the page — the rule, with its own numbers in it. */
export function priceGapReason(note: PriceGapNote): string {
  if (note.endedBy === "head") return "the stretch runs to the latest block";
  if (note.endedBy !== "adjustment") return `the stretch ends in a ${note.endedBy}`;
  if (!Number.isFinite(note.consumed)) {
    // Aave V4 has no branch: the position is measured against its own health
    // factor, so the same "no runway left" case has to name that instead.
    return note.protocol === "aave-v4"
      ? `the position was already at or below a ${AAVE_V4_LIQUIDATION_HF} health factor at the earlier price`
      : `the position was already at or below the branch minimum at the earlier price`;
  }
  return (
    `the move consumed ${formatPercent(note.consumed * 100)} of the position's runway ` +
    `(${formatPercent(RUNWAY_SHARE * 100)} threshold)`
  );
}

/**
 * A LIVE price gap: the trove's own NEWEST price-gap endpoint (§ the same
 * `PRICE_GAP_ENDPOINTS` filter `priceGapNotesFor` applies)
 * against the branch's oracle price read live at the chain head. Answers
 * "what has the market done to this trove since it last touched it" —
 * unthresholded like a liquidation/redemption ending (`endedBy: "head"`):
 * "nothing has moved" is itself the fact, not a reason to withhold the note.
 *
 * No note where the trove has no price-gap endpoint at all (never
 * transacted, or every row's price is 0), or its recorded debt/collateral at
 * that row is not positive — the same guards `priceGapNotesFor` applies to
 * each historical stretch.
 */
export function livePriceGapNote(
  events: readonly BaseActivityEvent[],
  branch: PriceGapBranch,
  live: { price: number; block: number; timestamp?: number },
): PriceGapNote | null {
  if (!(live.price > 0)) return null;
  const ends = events
    .filter((e) => {
      const d = liquityData(e);
      return d != null && PRICE_GAP_ENDPOINTS.has(d.eventType) && d.collateralPrice > 0;
    })
    .sort(byChainOrder);
  if (ends.length === 0) return null;
  // The earlier end is simply the NEWEST priced endpoint, whichever of the
  // endpoint types it is (a live note has no second row of the trove's own to
  // pair it with, so it is not restricted to a `trove`-type "A" the way
  // `priceGapNotesFor`'s historical pairing is).
  const a = ends[ends.length - 1];
  const da = liquityData(a);
  if (!da) return null;
  const priceA = da.collateralPrice;
  const state = da.stateAfter;
  const debt = state?.debt ?? 0;
  const coll = state?.coll ?? 0;
  if (!(debt > 0) || !(coll > 0)) return null;

  const collateralType = branch.collateralType;
  const mcrPct = Math.round(branch.mcr * 100_000) / 1000;
  const unitLabel = `USD per ${collateralType}`;
  const crBefore = state && state.collateralRatio > 0 ? state.collateralRatio : ((coll * priceA) / debt) * 100;
  const crAfter = (crBefore * live.price) / priceA;
  const runway = 1 - branch.mcr / (crBefore / 100);
  const move = Math.abs(live.price / priceA - 1);
  const consumed = runway > 0 ? move / runway : Infinity;
  if (!liveGapStatesAChange(move, consumed)) return null;

  const to: MarketNotePoint = {
    block: live.block,
    timestamp: live.timestamp ?? 0,
    value: live.price,
    txHash: "",
    logIndex: -1,
    wallet: "",
    kind: "head",
  };
  return {
    id: `price-gap:${collateralType.toLowerCase()}:${a.blockNumber}-head`,
    kind: "price-gap",
    marketSymbol: collateralType,
    marketAddress: branch.priceFeed ?? "",
    unitLabel,
    from: eventPoint(a, da, priceA),
    to,
    changePct: (live.price / priceA - 1) * 100,
    consumed,
    runway,
    endedBy: "head",
    position: { crBefore, crAfter, mcrPct, debt, coll, atBlock: a.blockNumber },
    live: true,
  };
}

// ── Phase 2b: the Polaris price gap ─────────────────────────────────────────
// The same rule as Phase 2a (the same RUNWAY_SHARE, the same PriceGapNote
// shape), read from a CDP's own touches instead of a trove's. Two things
// differ because the protocol does: the ends are `open`/`adjust`/`close`/
// `liquidate` rows (never `transfer`) rather than `trove`/`liquidation`/
// `redemption`, and Polaris has no redemption row of its own — a PSM share
// settles on the CDP's next touch, never as an event by itself — so
// `endedBy` is only ever `"adjustment"` or `"liquidation"` here. The price is
// the market's own price feed at the end of each touch's block
// (`priceAtBlock.pethInDebt`, already on every priced row), so — like the
// Liquity V2 selector — nothing is fetched.

/** The branch a Polaris price gap is read in. `mcr` is the market's own
 *  NORMAL-MODE minimum as a multiplier (1.15 on both markets, `chain.mcr`
 *  from the live overlay) — a defensive-mode minimum can be in force at a
 *  block in the CDP's history, but it is not indexed, so every note here is
 *  read against the normal-mode figure regardless of which was actually in
 *  force. */
export interface PolarisPriceGapOptions {
  /** "usdp" | "goldp" — namespaces the note id and selects the receipt's
   *  contract map. */
  market: "usdp" | "goldp";
  mcr: number;
  stable: string;
  /** The market's PriceFeed, for the receipt's contract line. */
  priceFeed?: string;
}

/** One end of a Polaris price gap: the CDP's own touch, and the price its
 *  own row carries. */
function polarisPricePoint(e: BaseActivityEvent, d: PolarisContext, value: number): MarketNotePoint {
  return {
    block: e.blockNumber,
    timestamp: e.timestamp,
    value,
    eventId: e.id,
    txHash: e.txHash.toLowerCase(),
    logIndex: polarisLogIndexOf(e),
    wallet: (e.wallet ?? "").toLowerCase(),
    kind: d.eventType,
  };
}

/**
 * Phase-2b selector: the stretches between two of a CDP's own touches where
 * the market's own price feed moved enough to matter to THIS CDP — the same
 * rule `priceGapNotesFor` applies to a Liquity V2 trove.
 *
 * The ends are the CDP's own rows and nothing else: a `transfer` carries no
 * price and is filtered out before pairing, so it neither ends a stretch nor
 * splits one, and a row the oracle-at-block lane has not reached yet
 * (`priceAtBlock` absent) is not an observation either. Two rows in the same
 * block are one moment, not a stretch, and two identical prices are one
 * reading twice.
 */
export function polarisPriceGapNotesFor(
  events: readonly BaseActivityEvent[],
  opts: PolarisPriceGapOptions,
): PriceGapNote[] {
  const ends = events
    .filter((e) => {
      const d = polarisData(e);
      return d != null && d.eventType !== "transfer" && d.priceAtBlock != null;
    })
    .sort((a, b) => a.blockNumber - b.blockNumber || polarisLogIndexOf(a) - polarisLogIndexOf(b));
  if (ends.length < 2) return [];

  // 1.15 × 100 is 114.99999999999999 in binary floating point, and the
  // receipt states this figure verbatim beside the formatted one — the same
  // rounding the Liquity V2 selector applies to its own branch minimum.
  const mcrPct = Math.round(opts.mcr * 100_000) / 1000;
  const unitLabel = `${opts.stable} per pETH`;
  const out: PriceGapNote[] = [];

  for (let i = 0; i < ends.length - 1; i++) {
    const a = ends[i];
    const b = ends[i + 1];
    const da = polarisData(a);
    const db = polarisData(b);
    if (!da || !db) continue;
    if (b.blockNumber <= a.blockNumber) continue;

    const priceA = da.priceAtBlock!.pethInDebt;
    const priceB = db.priceAtBlock!.pethInDebt;
    if (priceA === priceB) continue;

    const debt = Number(da.newDebt ?? 0);
    const coll = Number(da.newColl ?? 0);
    // No debt is no runway, same guard as the Liquity V2 selector.
    if (!(debt > 0) || !(coll > 0)) continue;

    const crBefore = ((coll * priceA) / debt) * 100;
    const crAfter = (crBefore * priceB) / priceA;
    const runway = 1 - opts.mcr / (crBefore / 100);
    const move = Math.abs(priceB / priceA - 1);
    const consumed = runway > 0 ? move / runway : Infinity;

    // Polaris has no redemption row of its own — the PSM's pro-rata share
    // settles onto the CDP at its next touch, never as an event by itself —
    // so a stretch here ends only in a liquidation or an adjustment.
    const endedBy: PriceGapNote["endedBy"] = db.eventType === "liquidate" ? "liquidation" : "adjustment";
    if (endedBy === "adjustment" && !(consumed >= RUNWAY_SHARE)) continue;

    out.push({
      id: `price-gap:${opts.market}:${a.blockNumber}-${b.blockNumber}`,
      kind: "price-gap",
      marketSymbol: "pETH",
      marketAddress: opts.priceFeed ?? "",
      unitLabel,
      from: polarisPricePoint(a, da, priceA),
      to: polarisPricePoint(b, db, priceB),
      changePct: (priceB / priceA - 1) * 100,
      consumed,
      runway,
      endedBy,
      position: { crBefore, crAfter, mcrPct, debt, coll, atBlock: a.blockNumber },
      measureKind: "protocol",
      measureProtocolId: "polaris",
      polarisMarket: opts.market,
    });
  }
  return out;
}

/**
 * A LIVE Polaris price gap: this CDP's own NEWEST priced touch (any of
 * open/adjust/close/liquidate — `transfer` never carries a price) against the
 * market's own price feed read live at the chain head. The polaris twin of
 * `livePriceGapNote` — unthresholded, "nothing has moved" is itself the fact.
 */
export function livePolarisPriceGapNote(
  events: readonly BaseActivityEvent[],
  opts: PolarisPriceGapOptions,
  live: { price: number; block: number; timestamp?: number },
): PriceGapNote | null {
  if (!(live.price > 0)) return null;
  const ends = events
    .filter((e) => {
      const d = polarisData(e);
      return d != null && d.eventType !== "transfer" && d.priceAtBlock != null;
    })
    .sort((a, b) => a.blockNumber - b.blockNumber || polarisLogIndexOf(a) - polarisLogIndexOf(b));
  if (ends.length === 0) return null;
  const a = ends[ends.length - 1];
  const da = polarisData(a);
  if (!da) return null;
  const priceA = da.priceAtBlock!.pethInDebt;
  const debt = Number(da.newDebt ?? 0);
  const coll = Number(da.newColl ?? 0);
  if (!(debt > 0) || !(coll > 0)) return null;

  const mcrPct = Math.round(opts.mcr * 100_000) / 1000;
  const unitLabel = `${opts.stable} per pETH`;
  const crBefore = ((coll * priceA) / debt) * 100;
  const crAfter = (crBefore * live.price) / priceA;
  const runway = 1 - opts.mcr / (crBefore / 100);
  const move = Math.abs(live.price / priceA - 1);
  const consumed = runway > 0 ? move / runway : Infinity;
  if (!liveGapStatesAChange(move, consumed)) return null;

  const to: MarketNotePoint = {
    block: live.block,
    timestamp: live.timestamp ?? 0,
    value: live.price,
    txHash: "",
    logIndex: -1,
    wallet: "",
    kind: "head",
  };
  return {
    id: `price-gap:${opts.market}:${a.blockNumber}-head`,
    kind: "price-gap",
    marketSymbol: "pETH",
    marketAddress: opts.priceFeed ?? "",
    unitLabel,
    from: polarisPricePoint(a, da, priceA),
    to,
    changePct: (live.price / priceA - 1) * 100,
    consumed,
    runway,
    endedBy: "head",
    position: { crBefore, crAfter, mcrPct, debt, coll, atBlock: a.blockNumber },
    measureKind: "protocol",
    measureProtocolId: "polaris",
    polarisMarket: opts.market,
    live: true,
  };
}

// ── Phase 3: the Polaris primary-rate step ──────────────────────────────────

/** The threshold, in percentage points: a stretch is stated when
 *  `|rateB − rateA| × 100 ≥ RATE_STEP_MIN_PP`. Absolute, not relative — the
 *  rate is 0 on many rows (a market before its first PrimaryRateSet, or a
 *  reset to zero), so a relative rule divides by zero. There is no
 *  always-render clause for a stretch ending in a liquidation, unlike the
 *  price gap: the primary rate does not cause one. Exported so the verifier
 *  can prove the gate by breaking it (measured yield at this threshold:
 *  usdp 67 notes on 27 CDPs, goldp 25 on 9). */
export const RATE_STEP_MIN_PP = 1;

/** One end of a rate step as the backend's per-row join states it — the
 *  PrimaryRateSet log in force at a polaris row's touch (plan §3's six new
 *  `/timeline` fields). Optional everywhere it is used: a note exists on the
 *  CDP's own two touches alone, and this only feeds the receipt. */
export interface RateSetLog {
  block: number;
  logIndex: number;
  txHash: string;
  txFrom: string;
  timestamp: number;
  /** Count of the market's PrimaryRateSet rows at or before this observation
   *  — lets a note state how many times the market reset the rate between
   *  the two ends (`to.ordinal − from.ordinal`). */
  ordinal: number;
}

/** Polaris: the market's own primary rate stepped between two of a CDP's own
 *  touches — the CDP's opening/adjustment/close/liquidation rows, never a
 *  transfer. Unlike the other two kinds, BOTH ends are the position's own
 *  events: the rate is read off the row itself (`context.data.primaryRate`),
 *  not off an endpoint transacted by somebody else elsewhere in the market. */
export interface RateStepNote extends MarketNoteBase {
  kind: "rate-step";
  /** Signed percentage points, `(rateB − rateA) × 100`. */
  deltaPp: number;
  /** The market's own name where it differs from the symbol on the chip —
   *  MakerDAO's ilk ("WSTETH-B") against its collateral symbol ("wstETH"),
   *  the Aave-family Pool ("Aave V3 Core") against the reserve ("USDe").
   *  Absent on Polaris, where the stable's symbol IS the market's name. */
  marketName?: string;
  /** Which of a reserve's TWO rates this note is about — the Aave family
   *  (`protocol: "aave-v3" | "spark"`) only. A V3-family account is one
   *  cross-collateralised account holding several reserves at once, and each
   *  reserve carries a supply rate the account earns and a variable borrow
   *  rate it pays; the two move independently, so a note names its reserve
   *  AND its side. No verdict and no colour rides on it — the side is the
   *  fact. Absent on Polaris and MakerDAO, where the market has one rate. */
  side?: "supply" | "borrow";
  /** How many PrimaryRateSet logs fired between the two observed logs
   *  (`to.ordinal − from.ordinal`) — null when either end's log is not
   *  observed (the backend join has not reached this row, or a pure-selector
   *  test event carries no `rateSet`). */
  setsBetween: number | null;
  /** The PrimaryRateSet log in force at each end, when the backend's
   *  per-row join has it. Null does not mean absent from the chain — it
   *  means this row predates the join landing; the note still renders off
   *  the CDP's own two touches, and the receipt falls back to naming them. */
  observed: { from: RateSetLog | null; to: RateSetLog | null };
  /** The yearly interest A's own recorded debt would cost at each end's
   *  rate — holds the debt fixed and moves only the rate, the same "what
   *  that state came to be worth" framing as the price gap's `crAfter`.
   *  Stated only when A's debt is positive.
   *
   *  `symbol` is what the debt is DENOMINATED in, where that is not the
   *  market's own symbol: a Maker vault's chip is its collateral (wstETH) and
   *  its debt is the Vat's own unit (DAI or USDS), so the two part company.
   *  Absent on Polaris, where the market's stable is both. */
  interest?: { debt: number; before: number; after: number; atBlock: number; symbol?: string };
  /** How many selected stretches this note merged, when consecutive steps in
   *  the same direction were stated as one (≥ 2 — absent on a note that is
   *  its own single stretch). See `collapseSameDirectionRateSteps`. */
  steps?: number;
  /** Those merged stretches, in block order — what the header collapsed, so
   *  the receipt can list each step the reader is no longer shown a row for.
   *  Set exactly where `steps` is. */
  members?: RateStepMember[];
}

/** One stretch inside a merged run, as it was selected before the run took
 *  it in: the two blocks and the two rates. */
export interface RateStepMember {
  fromBlock: number;
  toBlock: number;
  fromValue: number;
  toValue: number;
}

/** What each polaris eventType is called in prose, at an end of a stretch. */
const POLARIS_END_LABELS: Record<string, string> = {
  open: "opening",
  adjust: "adjustment",
  close: "close",
  liquidate: "liquidation",
};

export const polarisEndLabel = (p: MarketNotePoint): string => POLARIS_END_LABELS[p.kind] ?? p.kind;

/** One end of a rate step: the CDP's own row, whatever kind of touch it is. */
function polarisPoint(e: BaseActivityEvent, d: PolarisContext): MarketNotePoint {
  return {
    block: e.blockNumber,
    timestamp: e.timestamp,
    value: d.primaryRate ?? 0,
    eventId: e.id,
    txHash: e.txHash.toLowerCase(),
    logIndex: polarisLogIndexOf(e),
    wallet: (e.wallet ?? "").toLowerCase(),
    kind: d.eventType,
  };
}

/** The PrimaryRateSet log in force at one end, when the backend's per-row
 *  join carries it. */
function observedRateSet(d: PolarisContext): RateSetLog | null {
  const r = d.rateSet;
  if (!r) return null;
  return {
    block: r.block,
    logIndex: r.logIndex,
    txHash: r.txHash.toLowerCase(),
    txFrom: r.txFrom.toLowerCase(),
    timestamp: r.timestamp,
    ordinal: r.ordinal,
  };
}

/**
 * Phase-3 selector: the stretches between two of a CDP's own touches where
 * the market's primary rate moved at least `RATE_STEP_MIN_PP`.
 *
 * The ends are the CDP's own rows and nothing else — a transfer carries no
 * rate at all and is filtered out before pairing, so it neither ends a
 * stretch nor splits one; a row before the market's first PrimaryRateSet
 * carries no rate either and is filtered the same way. Two rows in the same
 * block are one moment, not a stretch; two equal rates are one reading
 * twice, so there is no move to draw.
 */
export function rateStepNotesFor(
  events: readonly BaseActivityEvent[],
  market: { key: "usdp" | "goldp"; stableSymbol: string; cdpManager: string },
): RateStepNote[] {
  const ends = events
    .filter((e) => {
      const d = polarisData(e);
      return d != null && d.eventType !== "transfer" && d.primaryRate != null;
    })
    .sort((a, b) => a.blockNumber - b.blockNumber || polarisLogIndexOf(a) - polarisLogIndexOf(b));
  if (ends.length < 2) return [];

  const address = market.cdpManager.toLowerCase();
  const unitLabel = "% per year";
  const out: RateStepNote[] = [];

  for (let i = 0; i < ends.length - 1; i++) {
    const a = ends[i];
    const b = ends[i + 1];
    if (b.blockNumber <= a.blockNumber) continue;
    const da = polarisData(a)!;
    const db = polarisData(b)!;
    const rateA = da.primaryRate!;
    const rateB = db.primaryRate!;
    if (rateA === rateB) continue;
    const deltaPp = (rateB - rateA) * 100;
    if (Math.abs(deltaPp) < RATE_STEP_MIN_PP) continue;

    const fromObserved = observedRateSet(da);
    const toObserved = observedRateSet(db);
    const debtA = Number(da.newDebt ?? 0);
    const interest =
      Number.isFinite(debtA) && debtA > 0
        ? { debt: debtA, before: debtA * rateA, after: debtA * rateB, atBlock: a.blockNumber }
        : undefined;

    out.push({
      id: `rate-step:${market.key}:${a.blockNumber}-${b.blockNumber}`,
      kind: "rate-step",
      marketSymbol: market.stableSymbol,
      marketAddress: address,
      unitLabel,
      from: polarisPoint(a, da),
      to: polarisPoint(b, db),
      deltaPp,
      setsBetween: fromObserved && toObserved ? toObserved.ordinal - fromObserved.ordinal : null,
      observed: { from: fromObserved, to: toObserved },
      ...(interest ? { interest } : {}),
    });
  }
  return collapseSameDirectionRateSteps(out);
}

/**
 * Consecutive stretches that moved the rate the SAME WAY are one note, from
 * the first stretch's earlier end to the last stretch's later end.
 *
 * A CDP touched four times while the market was raising the rate produced
 * four rows saying "up", one after another, each true and none of them the
 * fact the reader wants — which is that the rate went 0.82% → 8.15% across
 * that run. Whatever happened at the CDP's touches BETWEEN two same-direction
 * steps does not break the run: a sub-threshold wobble was never stated as a
 * note in the first place, so it cannot end one. A step the other way does
 * end it — that is a different thing happening to the position.
 *
 * A LIVE note is never taken into a run, in either direction: its later end
 * is a read at the chain head rather than one of the position's own touches,
 * and merging it would state a historical stretch running to "now".
 *
 * Order in, order out: the caller passes the stretches in block order and
 * gets the runs back in block order. Written against `RateStepNote` alone,
 * with no Polaris in it, so another home's selector can adopt it unchanged.
 *
 * PRECONDITION — two parts, both measured, both binding on any new caller.
 * Settled by Miles 2026-09-20: Polaris and MakerDAO adopt, Aave V3 and
 * SparkLend do not (`rails-ops/architecture/market-notes.md` §9).
 *
 * 1. THE RATE MUST BE MONOTONIC ACROSS THE WINDOW THE RUN SPANS. A merged
 *    note states first to last, so where the rate wanders back between the
 *    position's touches that figure can be SMALLER than a single member's.
 *    Maker's stability fee ratchets inside a governance cycle, so first to
 *    last is the true span. Aave's does not: a measured USDG borrow run of
 *    three merged to +0.13 pp while one member alone moved +2.92 pp — one row
 *    stating less than the 1 pp threshold that made each member a note.
 *
 * 2. THE SERIES IS THE UNIT, NOT THE ARRAY. This scan walks one flat list,
 *    which is correct for Maker and Polaris — a vault and a CDP each have one
 *    rate. An Aave position holds several reserves with two sides each, and
 *    `aaveFamilyRateStepNotesFor` emits them interleaved, so a flat scan there
 *    merges a USDC borrow step into a WETH supply step. A caller holding more
 *    than one series splits by (asset, side) and calls this once per series.
 */
export function collapseSameDirectionRateSteps(notes: readonly RateStepNote[]): RateStepNote[] {
  const out: RateStepNote[] = [];
  let run: RateStepNote[] = [];
  const settleRun = () => {
    if (run.length > 0) {
      out.push(mergeRateStepRun(run));
      run = [];
    }
  };
  for (const note of notes) {
    if (note.live) {
      settleRun();
      out.push(note);
      continue;
    }
    const last = run[run.length - 1];
    if (last && Math.sign(last.deltaPp) === Math.sign(note.deltaPp)) {
      run.push(note);
    } else {
      settleRun();
      run = [note];
    }
  }
  settleRun();
  return out;
}

/** One run as one note. A run of one is itself, untouched — a note that
 *  merged nothing carries no `steps` and reads exactly as it always did. */
function mergeRateStepRun(run: readonly RateStepNote[]): RateStepNote {
  const first = run[0];
  if (run.length === 1) return first;
  const last = run[run.length - 1];
  // `rate-step:<market>:` — the id's own prefix, kept rather than rebuilt, so
  // this helper never has to know which market vocabulary it is merging.
  const prefix = first.id.slice(0, first.id.lastIndexOf(":") + 1);
  // Every member's count or none: a run one of whose ends the backend's join
  // has not reached cannot state how many times the market reset the rate.
  const setsBetween = run.every((n) => n.setsBetween != null)
    ? run.reduce((sum, n) => sum + (n.setsBetween ?? 0), 0)
    : null;
  // The first member's own recorded debt, held fixed across the whole run and
  // priced at the two ENDS' rates — the same "what that state came to be
  // worth" framing a single stretch uses, over a longer stretch.
  const interest = first.interest
    ? {
        ...first.interest,
        before: first.interest.debt * first.from.value,
        after: first.interest.debt * last.to.value,
      }
    : undefined;
  return {
    ...first,
    id: `${prefix}${first.from.block}-${last.to.block}`,
    to: last.to,
    deltaPp: (last.to.value - first.from.value) * 100,
    setsBetween,
    observed: { from: first.observed.from, to: last.observed.to },
    ...(interest ? { interest } : {}),
    steps: run.length,
    members: run.map((n) => ({
      fromBlock: n.from.block,
      toBlock: n.to.block,
      fromValue: n.from.value,
      toValue: n.to.value,
    })),
  };
}

/**
 * A LIVE Polaris rate step: this CDP's own NEWEST touch that carries a rate
 * against the market's own primary rate read live at the chain head.
 * Unthresholded — unlike `rateStepNotesFor`'s `RATE_STEP_MIN_PP` gate on a
 * historical stretch, a live note renders whatever the move, because
 * "nothing has moved" is itself the fact.
 *
 * `observed.to` is always null — a live rate has no PrimaryRateSet log of
 * its own, only the contract's current value — and `setsBetween` is null
 * unless `live.ordinal` states the market's own PrimaryRateSet count at the
 * head (no overlay currently does), matching `RateStepNote.setsBetween`'s own
 * contract: null wherever either end is unobserved.
 */
export function liveRateStepNote(
  events: readonly BaseActivityEvent[],
  market: { key: "usdp" | "goldp"; stableSymbol: string; cdpManager: string },
  live: { rate: number; block: number; timestamp?: number; ordinal?: number },
): RateStepNote | null {
  if (!Number.isFinite(live.rate) || live.rate < 0) return null;
  const ends = events
    .filter((e) => {
      const d = polarisData(e);
      return d != null && d.eventType !== "transfer" && d.primaryRate != null;
    })
    .sort((a, b) => a.blockNumber - b.blockNumber || polarisLogIndexOf(a) - polarisLogIndexOf(b));
  if (ends.length === 0) return null;
  const a = ends[ends.length - 1];
  const da = polarisData(a);
  if (!da) return null;
  const rateA = da.primaryRate!;
  const address = market.cdpManager.toLowerCase();

  const fromObserved = observedRateSet(da);
  const debtA = Number(da.newDebt ?? 0);
  const interest =
    Number.isFinite(debtA) && debtA > 0
      ? { debt: debtA, before: debtA * rateA, after: debtA * live.rate, atBlock: a.blockNumber }
      : undefined;
  const to: MarketNotePoint = {
    block: live.block,
    timestamp: live.timestamp ?? 0,
    value: live.rate,
    txHash: "",
    logIndex: -1,
    wallet: "",
    kind: "head",
  };
  return {
    id: `rate-step:${market.key}:${a.blockNumber}-head`,
    kind: "rate-step",
    marketSymbol: market.stableSymbol,
    marketAddress: address,
    unitLabel: "% per year",
    from: polarisPoint(a, da),
    to,
    deltaPp: (live.rate - rateA) * 100,
    setsBetween: fromObserved && live.ordinal != null ? live.ordinal - fromObserved.ordinal : null,
    observed: { from: fromObserved, to: null },
    ...(interest ? { interest } : {}),
    live: true,
  };
}

// ── Formatting — one source for the row, the export and the receipts ─────────

/** A rate reads at five to six significant digits: enough to separate two
 *  observations that differ in the fourth (0.020513 → 0.075460), never so many
 *  that float noise reaches the page. Locale pinned — see check:locale. */
export const formatShareRate = (n: number): string =>
  n.toLocaleString("en-US", { minimumSignificantDigits: 5, maximumSignificantDigits: 6 });

const formatBlock = (n: number): string => n.toLocaleString("en-US");
/** A share-rate move as a magnitude. At a doubling or more (or a halving) it
 *  is the multiplier the step is known by ("3.68×"); under that it is the
 *  unsigned percentage move, because "1×" says nothing about a live note whose
 *  rate has drifted 0.03% since the account's last touch. One decimal from 1%
 *  up, two significant digits below it, so a tiny drift never rounds to "0.0%".
 *  Never a sign: the direction glyph carries it. */
export const formatRatio = (n: number): string => {
  if (!(n > 0) || n >= 2 || n <= 0.5) return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}×`;
  const pct = Math.abs(n - 1) * 100;
  const text =
    pct >= 1
      ? pct.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : pct.toLocaleString("en-US", { maximumSignificantDigits: 2 });
  return `${text}%`;
};
/** The compact headline form the rest of the site uses for large amounts
 *  (`formatCompact`): 735,562,000 → "735.56M", small values unabbreviated. */
const formatUnits = (n: number): string =>
  n.toLocaleString("en-US", Math.abs(n) >= 1_000 ? { notation: "compact", maximumFractionDigits: 2 } : {});

// ── The grain a PAIR of readings is stated at ───────────────────────────────
// Every figure in a note is a before → after pair, and a fixed number of
// decimals is a claim about the SCALE of the quantity rather than about the
// reading. Two decimals separate 3,114.20 from 2,628.27 and say nothing
// whatever about 0.99989 against 0.99966 — on a pegged asset they erase the
// entire range the reader came for, and the row renders "1.00 → 1.00", which
// is a tautology, not an observation (measured on the Aave V4 forex spoke,
// 2026-09-11).
//
// So a pair chooses its own grain: the fewest decimals at which its two ends
// do not render as the same string, from the site's usual floor up to a cap.
// Every surface that prints either end — the stat card that states both, the
// step mark in the header, the receipt that states one — takes that one
// number from the note, so no two of them can disagree.
//
// The cap is what makes it safe. Past the cap, two ends that still render
// alike are not "too precise to show": they are the same reading, and a live
// note that would state them is withheld instead (`liveGapStatesAChange`).

/** One value at a stated number of decimals. Locale pinned — see check:locale. */
const fixed = (n: number, decimals: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** The decimals a price outside a pair is read to — the oracle's own figure
 *  as every other surface on a position page states it. */
export const PRICE_DECIMALS_FLOOR = 2;
/** Six decimals is the resolution of a USD feed on a $1 asset (a Chainlink
 *  answer carries eight, two of them above the point). Past it the last digit
 *  that moved is the feed's, not the market's. */
export const PRICE_DECIMALS_CAP = 6;
/** A health factor is read to two decimals everywhere on a position page; a
 *  pair that agrees there can still separate two further in (1.0312 → 1.0311),
 *  and past four the difference is not one any reader acts on. */
export const HEALTH_DECIMALS_FLOOR = 2;
export const HEALTH_DECIMALS_CAP = 4;
/** A collateral ratio is a whole-number percentage, followed two decimals in
 *  when its pair agrees there. */
export const RATIO_DECIMALS_FLOOR = 0;
export const RATIO_DECIMALS_CAP = 2;

/** The fewest decimals in [floor, cap] at which `a` and `b` render as
 *  DIFFERENT strings: `cap` when they never do, and `floor` when the two are
 *  exactly equal, so a figure with nothing to separate reads at its ordinary
 *  grain. Compared as the formatted strings rather than by subtracting,
 *  because what the reader sees is decided by rounding, not by the gap. */
export function separatingDecimals(a: number, b: number, floor: number, cap: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return floor;
  for (let d = floor; d < cap; d += 1) {
    if (fixed(a, d) !== fixed(b, d)) return d;
  }
  return cap;
}

/** The grain this note's two prices separate at. */
export const priceDecimals = (note: PriceGapNote): number =>
  separatingDecimals(note.from.value, note.to.value, PRICE_DECIMALS_FLOOR, PRICE_DECIMALS_CAP);

/** The grain this note's two health factors separate at. */
export const healthDecimals = (h: PriceGapHealth): number =>
  separatingDecimals(h.hfBefore, h.hfAfter, HEALTH_DECIMALS_FLOOR, HEALTH_DECIMALS_CAP);

/** The price formatter bound to one note's grain — for the header's step mark
 *  and for the receipts, which each state ONE end and must agree with the stat
 *  card that states both. */
export const notePriceFormat = (note: PriceGapNote): ((n: number) => string) => {
  const decimals = priceDecimals(note);
  return (n: number) => formatPrice(n, decimals);
};

/** A collateral price. Two decimals unless a pair asks for more (see above). */
export const formatPrice = (n: number, decimals: number = PRICE_DECIMALS_FLOOR): string => fixed(n, decimals);

/** A whole-number percentage — a collateral ratio, a threshold, a share of a
 *  runway. Never a sign: the reading is a level, not a change. A pair of
 *  ratios may ask for decimals the way a pair of prices does. */
const formatPercent = (n: number, decimals: number = RATIO_DECIMALS_FLOOR): string =>
  `${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;

/** A percentage change, unsigned. One decimal from 0.1% up; two significant
 *  digits below it, so a small move states what it is instead of rounding to
 *  "0.0%" and calling itself nothing — the rule `formatRatio` already applies
 *  to a share-rate drift. */
const changeDigits = (n: number): string => {
  const abs = Math.abs(n);
  return abs >= 0.1 || abs === 0
    ? abs.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : abs.toLocaleString("en-US", { maximumSignificantDigits: 2 });
};

/** A signed change, with the typographic minus (U+2212) the rest of the site
 *  uses for a negative figure. */
const formatChange = (n: number): string => `${n < 0 ? "−" : "+"}${changeDigits(n)}%`;

/** The same change with no sign — for the header, where the direction glyph
 *  carries what the sign used to. `change` (signed) stays for the markdown
 *  export and the receipt's exact value. */
const formatChangeMagnitude = (n: number): string => `${changeDigits(n)}%`;

/** Seconds between the two ends' block timestamps, or null where either end
 *  is undated (a Moonwell step whose sample the endpoint did not date, and no
 *  displayed event at that block to date it). Both timestamps are the blocks'
 *  own headers, so this is the elapsed time, not an estimate from a block
 *  count. */
export function noteElapsedSeconds(note: MarketNote): number | null {
  if (!(note.from.timestamp > 0) || !(note.to.timestamp > 0)) return null;
  const s = note.to.timestamp - note.from.timestamp;
  return s >= 0 ? s : null;
}

/** The same shape lib/date.ts's formatDuration writes ("less than a minute",
 *  "4 minutes", "3 hrs", "39 days"), restated here because this module must
 *  stay import-free: the pure verifier loads it under Node with no `@/` alias
 *  to resolve (scripts/verify/verify-market-note-placement.mjs). */
const formatElapsed = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (hours < 1) return minutes < 1 ? "less than a minute" : `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  if (days < 1) return `${hours} ${hours === 1 ? "hr" : "hrs"}`;
  return `${days} ${days === 1 ? "day" : "days"}`;
};

const elapsedFigure = (note: MarketNote): { elapsed?: string } => {
  const s = noteElapsedSeconds(note);
  return s == null ? {} : { elapsed: formatElapsed(s) };
};

/** Every figure the note states, formatted once. The row renders these inside
 *  `<Prov>`; the markdown export writes the same strings as plain text, so the
 *  page and the export can never state a figure differently. */
export interface MarketNoteFigures {
  fromRate: string;
  toRate: string;
  ratio: string;
  fromBlock: string;
  toBlock: string;
  /** The time between the two blocks, from their own timestamps — absent
   *  where either end is undated. Exact, not a block-count estimate. */
  elapsed?: string;
  units?: string;
  before?: string;
  after?: string;
}

export function marketNoteFigures(note: ShareRateStepNote): MarketNoteFigures {
  return {
    fromRate: formatShareRate(note.from.value),
    toRate: formatShareRate(note.to.value),
    ratio: formatRatio(note.ratio),
    fromBlock: formatBlock(note.from.block),
    toBlock: formatBlock(note.to.block),
    ...elapsedFigure(note),
    ...(note.slice
      ? {
          units: `${formatUnits(note.slice.units)} ${note.slice.unitSymbol}`,
          before: `${formatUnits(note.slice.before)} ${note.slice.valueSymbol}`,
          after: `${formatUnits(note.slice.after)} ${note.slice.valueSymbol}`,
        }
      : {}),
  };
}

/** The same, for a price gap. */
export interface PriceGapFigures {
  fromPrice: string;
  toPrice: string;
  change: string;
  /** `change` with no sign — the header's headline figure now that the
   *  direction glyph carries the sign. */
  changeMagnitude: string;
  fromBlock: string;
  toBlock: string;
  /** As MarketNoteFigures.elapsed. */
  elapsed?: string;
  atBlock?: string;
  crBefore?: string;
  crAfter?: string;
  mcr?: string;
  /** Aave V4 (`note.health`): the whole basket's health factor at each end's
   *  price, at the grain the pair separates at (two decimals unless the move
   *  is smaller than that). Absent on a price-only note. */
  hfBefore?: string;
  hfAfter?: string;
  /** The LT-weighted collateral and the debt behind those two figures, in
   *  compact USD. */
  collateralUsd?: string;
  debtUsd?: string;
}

/** A health factor, at the two decimals every other health-factor figure on a
 *  position page is read to — or at the grain a note's own pair separates at.
 *  Locale pinned — see check:locale. */
export const formatHealthFactor = (n: number, decimals: number = HEALTH_DECIMALS_FLOOR): string =>
  Number.isFinite(n) ? fixed(n, decimals) : "∞";

/** A USD amount in the compact headline form the rest of the site uses
 *  (`$1.24K`), two decimals unabbreviated below a thousand. */
const formatUsdCompact = (n: number): string => {
  const opts: Intl.NumberFormatOptions =
    Math.abs(n) >= 1_000
      ? { notation: "compact", maximumFractionDigits: 2 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return `$${n.toLocaleString("en-US", opts)}`;
};

export function priceGapFigures(note: PriceGapNote): PriceGapFigures {
  const p = note.position;
  const h = note.health;
  // Every pair in the note is stated at the grain it separates at, so no cell
  // reads "x → x" while the header states a move.
  const pd = priceDecimals(note);
  const rd = p ? separatingDecimals(p.crBefore, p.crAfter, RATIO_DECIMALS_FLOOR, RATIO_DECIMALS_CAP) : 0;
  const hd = h ? healthDecimals(h) : HEALTH_DECIMALS_FLOOR;
  return {
    fromPrice: formatPrice(note.from.value, pd),
    toPrice: formatPrice(note.to.value, pd),
    change: formatChange(note.changePct),
    changeMagnitude: formatChangeMagnitude(note.changePct),
    fromBlock: formatBlock(note.from.block),
    toBlock: formatBlock(note.to.block),
    ...elapsedFigure(note),
    ...(p
      ? {
          atBlock: formatBlock(p.atBlock),
          crBefore: formatPercent(p.crBefore, rd),
          crAfter: formatPercent(p.crAfter, rd),
          // The minimum is the branch's own constant, not one end of a pair.
          mcr: formatPercent(p.mcrPct),
        }
      : {}),
    ...(h
      ? {
          atBlock: formatBlock(h.atBlock),
          hfBefore: formatHealthFactor(h.hfBefore, hd),
          hfAfter: formatHealthFactor(h.hfAfter, hd),
          collateralUsd: formatUsdCompact(h.collateralUsd),
          debtUsd: formatUsdCompact(h.debtUsd),
        }
      : {}),
  };
}

/** The liquidation line every Aave V4 health payload is read against — the
 *  protocol's own trigger, not a Rails setting and not a per-position
 *  number. Stated as a figure so the row and the export write it once. */
export const AAVE_V4_LIQUIDATION_HF = "1.00";

/** What each Aave V4 eventType is called in prose, at an end of a stretch —
 *  the row's own word, so "its liquidation" and "this position's borrow"
 *  read the way the event card beside them is labelled. Falls back to the
 *  raw eventType, so a type added upstream reads oddly rather than
 *  disappearing. */
const AAVE_V4_END_LABELS: Record<string, string> = {
  supply: "supply",
  withdraw: "withdrawal",
  borrow: "borrow",
  repay: "repayment",
  liquidation: "liquidation",
  collateral_toggle: "collateral toggle",
};

export const aaveV4EndLabel = (p: MarketNotePoint): string => AAVE_V4_END_LABELS[p.kind] ?? p.kind;

/** The move as a direction word plus its magnitude — "down 4.9%". The Aave V4
 *  sentence reads as prose rather than as a signed figure, because the
 *  sentence already names both prices in order. */
const changeInWords = (note: PriceGapNote): string =>
  `${note.changePct < 0 ? "down" : "up"} ${formatChangeMagnitude(note.changePct)}`;

/** The clause every Aave V4 note carries about where its liquidation
 *  threshold came from — the one thing about the health figures that is NOT
 *  read at the earlier block. */
const AAVE_V4_LT_CLAUSE = "at the liquidation threshold the spoke reports now";

/** A primary rate, as the percentage it is — two decimals, matching what the
 *  step mark and the stat cards state everywhere else on the position. */
export const formatRatePercent = (n: number): string =>
  `${(n * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** A percentage-point move, unsigned — the prose's magnitude, the direction
 *  word beside it carrying the sign the figure no longer does. "Points",
 *  never "pp": the unit is written the way a reader outside finance writes
 *  it (Miles, 2026-09-10), and since the same day the header states the
 *  LATER RATE rather than the move, so this figure is prose only. */
const formatDeltaPpMagnitude = (n: number): string =>
  `${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} points`;

/** The same move, signed, with the typographic minus (U+2212) the rest of the
 *  site uses for a negative figure — the export's exact value and the row
 *  annotation. Same unit word, for the same reason. */
const formatDeltaPpSigned = (n: number): string =>
  `${n < 0 ? "−" : "+"}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} points`;

/** A debt or interest amount in the market's stable — compact above 1,000;
 *  below it, always two decimals (`4.61`, `0.00` — never a bare `0`), the
 *  yearly-interest figures on a rate step being usually single digits. */
const formatStableAmount = (n: number): string => {
  const opts: Intl.NumberFormatOptions =
    Math.abs(n) >= 1_000
      ? { notation: "compact", maximumFractionDigits: 2 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return n.toLocaleString("en-US", opts);
};

/** A holding and the yearly interest on it, in a RESERVE's own units. The
 *  Aave-family notes state a token quantity and the interest read against it
 *  side by side — "on the 2,300,000 USDe of debt … 109,174 USDe a year" —
 *  and compacting either ("2.3M", "109.17K") would throw away the comparison
 *  the row exists to make. Whole units at and above a thousand, two decimals
 *  below it, so a 0.98 WETH supply still reads. Locale pinned — see
 *  check:locale. */
const formatReserveAmount = (n: number): string => {
  const opts: Intl.NumberFormatOptions =
    Math.abs(n) >= 1_000 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return n.toLocaleString("en-US", opts);
};

/** The same, for a rate step. */
export interface RateStepFigures {
  fromRate: string;
  toRate: string;
  /** Unsigned — the header's headline figure. */
  deltaMagnitude: string;
  /** Signed, with the typographic minus. */
  delta: string;
  fromBlock: string;
  toBlock: string;
  /** As MarketNoteFigures.elapsed. */
  elapsed?: string;
  sets?: string;
  /** How many stretches this note merged, where it merged any. */
  steps?: string;
  debt?: string;
  before?: string;
  after?: string;
}

export function rateStepFigures(note: RateStepNote): RateStepFigures {
  return {
    fromRate: formatRatePercent(note.from.value),
    toRate: formatRatePercent(note.to.value),
    deltaMagnitude: formatDeltaPpMagnitude(note.deltaPp),
    delta: formatDeltaPpSigned(note.deltaPp),
    fromBlock: formatBlock(note.from.block),
    toBlock: formatBlock(note.to.block),
    ...elapsedFigure(note),
    ...(note.setsBetween != null ? { sets: note.setsBetween.toLocaleString("en-US") } : {}),
    ...(note.steps != null ? { steps: note.steps.toLocaleString("en-US") } : {}),
    ...(note.interest
      ? (() => {
          // The debt's own unit, which is the market's symbol only where the
          // market IS the thing borrowed. On a Maker vault the chip is the
          // collateral and the debt is the Vat's DAI/USDS — stating the
          // interest in wstETH would be a unit error on the row's face.
          const sym = note.interest.symbol ?? note.marketSymbol;
          const amount = isAaveFamily(note) ? formatReserveAmount : formatStableAmount;
          return {
            debt: `${amount(note.interest.debt)} ${sym}`,
            before: `${amount(note.interest.before)} ${sym}`,
            after: `${amount(note.interest.after)} ${sym}`,
          };
        })()
      : {}),
  };
}

// ── MakerDAO's own words for a rate step ────────────────────────────────────
// The kind is the same (a market's own rate, between two of a position's own
// touches) but almost every noun differs: the quantity is a STABILITY FEE, the
// position is a VAULT, the market is an ILK, and the rate is not on the row at
// all — it is the ilk's last rate SET at or before it, evidenced by a Jug.drip
// rather than a log the protocol emits for the purpose. These helpers are the
// vocabulary; the four prose functions below branch to them on
// `note.protocol === "makerdao"` and nothing else changes.

/** What each end of a Maker stretch is called. Restated here rather than
 *  imported from lib/makerdao/market-notes.ts, so this module stays
 *  import-free for the pure verifier (see the header). */
const MAKER_END_LABELS: Record<string, string> = {
  "frob-open": "opening",
  frob: "adjustment",
  grab: "liquidation",
  head: "the latest block",
};

export const makerRateEndLabel = (p: MarketNotePoint): string => MAKER_END_LABELS[p.kind] ?? p.kind;

/** The ilk in prose — its own name where the note carries one, else the chip's
 *  symbol, so a note built without one still reads. */
const makerMarketName = (note: RateStepNote): string => note.marketName ?? note.marketSymbol;

/** How many times governance reset the fee, in words: a count of one reads
 *  "once" rather than "1 times". */
const resetCount = (n: number): string => (n === 1 ? "once" : `${n.toLocaleString("en-US")} times`);

/** The move's direction as a word — the sentence carries it, so the figure
 *  beside it can stay an unsigned magnitude. */
const moveWord = (deltaPp: number): string => (deltaPp < 0 ? "down" : "up");

// ── The Aave family's own words for a rate step ─────────────────────────────
// Aave V3 (Core / Prime / EtherFi) and SparkLend index the same Pool event and
// read it the same way, so they share one vocabulary. Two things differ from
// Polaris and MakerDAO, and both come from the shape of the position rather
// than from a naming preference:
//
//   • the market on the chip is a RESERVE, not the whole deployment, because
//     one V3-family account holds several reserves at once — so the sentence
//     names the reserve AND the Pool ("the USDe borrow rate on Aave V3 Core");
//   • a reserve has TWO rates, so the note names its SIDE. The supply rate is
//     earned and the borrow rate paid, and which one a note is about is a fact
//     on the note (`RateStepNote.side`), not a verdict about it.
//
// The rate is not on the row either — unlike Polaris, where the touch carries
// it. It is the reserve's own last ReserveDataUpdated, read at or before the
// earlier touch and strictly before the later one, and never from inside the
// later touch's own transaction (lib/aave-v3/market-notes.ts). The four prose
// functions below branch here on `note.protocol`, AFTER the MakerDAO branch,
// and nothing else changes.

/** What each end of an Aave-family stretch is called. `head` is the live end.
 *  Falls back to the raw row type, so a type added upstream reads oddly rather
 *  than disappearing. */
const AAVE_FAMILY_END_LABELS: Record<string, string> = {
  supply: "supply",
  withdraw: "withdrawal",
  borrow: "borrow",
  repay: "repayment",
  liquidation: "liquidation",
  // The liquidation price note's earlier end can be any row that touched the
  // seized reserve, these three included (lib/aave-v3/liquidation-price-notes.ts).
  transfer_in: "incoming transfer",
  transfer_out: "outgoing transfer",
  swap: "swap",
  head: "the latest block",
};

export const aaveFamilyEndLabel = (p: MarketNotePoint): string => AAVE_FAMILY_END_LABELS[p.kind] ?? p.kind;

/** True for the two explorers that read a reserve's own rate this way. */
const isAaveFamily = (note: RateStepNote): boolean => note.protocol === "aave-v3" || note.protocol === "spark";

/** True for an Aave V3 or SparkLend liquidation price note — price-only, one
 *  per liquidation, for the asset it seized (lib/aave-v3/liquidation-price-notes.ts). */
export const isAaveFamilyPriceGap = (note: PriceGapNote): boolean =>
  note.protocol === "aave-v3" || note.protocol === "spark";

/** Whose oracle the row's stored price is — "Aave's", "SparkLend's". */
export const aaveFamilyOracleOwner = (note: PriceGapNote): string =>
  note.protocol === "spark" ? "SparkLend's" : "Aave's";

/** "borrow rate" / "supply rate" — the quantity the note states, which on a
 *  V3-family reserve is only half the answer without the side. */
export const aaveFamilyRateNoun = (note: RateStepNote): string =>
  note.side === "supply" ? "supply rate" : "borrow rate";

/** The Pool in prose — "Aave V3 Core", "Spark" — falling back to the chip's
 *  own symbol so a note built without one still reads. */
const aaveFamilyMarketName = (note: RateStepNote): string => note.marketName ?? note.marketSymbol;

/** The interest clause both the sentence and the export carry: the holding the
 *  earlier touch recorded, and what a year of it costs (or earns) at each
 *  end's rate. Empty where the note carries no holding. */
function aaveFamilyInterestClause(note: RateStepNote, f: RateStepFigures, live: boolean): string {
  if (!note.interest || !f.debt || !f.before || !f.after) return "";
  const holding = note.side === "supply" ? `On the ${f.debt} supplied` : `On the ${f.debt} of debt recorded`;
  const earned = note.side === "supply" ? "of interest earned " : "of interest ";
  return (
    ` ${holding} at block ${f.fromBlock} that is ${f.before} a year ${earned}before and ` +
    `${f.after} after${live ? ", at the rate now" : ""}.`
  );
}

// ── Prose — the four phrasings, each switching on `kind` exactly once ────────
// Every surface that puts a note into words (the row, and each protocol's
// markdown export) reads these, so a note reads the same on the page as in an
// export, and a third kind lands here rather than in four files.

/** The note as one plain sentence — the markdown export's paragraph, and the
 *  wording the row renders figure by figure. */
export function marketNoteSentence(note: MarketNote): string {
  // A vault's own terms come with the family's sentence already written, for
  // the reason `VaultTermsNote` gives: what the event means is that family's
  // mechanic. So every phrasing below reaches for the same one string rather
  // than composing a second version of it out of figures this module cannot
  // read.
  if (note.kind === "vault-terms") return `At block ${formatBlock(note.to.block)}, ${note.statement}.`;
  if (note.kind === "price-gap") {
    const f = priceGapFigures(note);
    if (note.protocol === "aave-v4") {
      // The whole basket, not one collateral ratio: an Aave account holds
      // several collaterals and several debts, so the figure that answers
      // "what did this move do to the position" is the health factor.
      const health =
        f.hfBefore && f.hfAfter
          ? ` At the amounts recorded at block ${f.atBlock} the position's health factor was ${f.hfBefore} at the ` +
            `earlier price and ${f.hfAfter} at the later one, against liquidation at ${AAVE_V4_LIQUIDATION_HF}, ` +
            `${AAVE_V4_LT_CLAUSE}.`
          : "";
      if (note.live) {
        return (
          `Since this position's ${aaveV4EndLabel(note.from)} at block ${f.fromBlock} the ${note.marketSymbol} ` +
          `oracle price has moved ${f.fromPrice} → ${f.toPrice} ${note.unitLabel}, ${changeInWords(note)}, at the ` +
          `latest block ${f.toBlock}.${health}`
        );
      }
      return (
        `The ${note.marketSymbol} oracle price moved ${f.fromPrice} → ${f.toPrice} ${note.unitLabel}, ` +
        `${changeInWords(note)}, between this position's ${aaveV4EndLabel(note.from)} at block ${f.fromBlock} and ` +
        `its ${aaveV4EndLabel(note.to)} at block ${f.toBlock}.${health}`
      );
    }
    if (isAaveFamilyPriceGap(note)) {
      return (
        `The ${note.marketSymbol} oracle price moved ${f.fromPrice} → ${f.toPrice} ${note.unitLabel}, ` +
        `${changeInWords(note)}, between this position's ${aaveFamilyEndLabel(note.from)} at block ${f.fromBlock} ` +
        `and the liquidation at block ${f.toBlock} that seized ${note.marketSymbol}. This position did not touch ` +
        `${note.marketSymbol} between them.`
      );
    }
    const isPolaris = note.measureKind === "protocol";
    const positionNoun = isPolaris ? "CDP" : "trove";
    const endLabel = isPolaris ? polarisEndLabel : priceGapEndLabel;
    const minimumLabel = isPolaris ? "the market's normal-mode minimum" : "branch minimum";
    if (note.live) {
      let sentence =
        `Since this ${positionNoun}'s ${endLabel(note.from)} at block ${f.fromBlock} the ${note.marketSymbol} ` +
        `oracle price has moved ${f.fromPrice} → ${f.toPrice} ${note.unitLabel}, ${f.change}, at the latest block ` +
        `${f.toBlock}.`;
      if (note.position) {
        sentence +=
          ` At the debt and collateral recorded at block ${f.atBlock} this ${positionNoun}'s collateral ratio was ` +
          `${f.crBefore} then and is ${f.crAfter} at the later price, against the ${minimumLabel} of ${f.mcr}.`;
        if (!isPolaris) sentence += ` The position card's live ratio also carries the interest accrued since then.`;
      }
      return sentence;
    }
    const moved =
      `The ${note.marketSymbol} oracle price moved ${f.fromPrice} → ${f.toPrice} ${note.unitLabel}, ` +
      `${f.change}, between blocks ${f.fromBlock} and ${f.toBlock}.`;
    if (!note.position) return moved;
    return (
      `${moved} At the debt and collateral recorded at block ${f.atBlock} this trove's collateral ratio was ` +
      `${f.crBefore} at the earlier price and ${f.crAfter} at the later one, against the branch minimum of ${f.mcr}.`
    );
  }
  if (note.kind === "rate-step") {
    const f = rateStepFigures(note);
    if (note.protocol === "makerdao") {
      const ilk = makerMarketName(note);
      const interestClause =
        note.interest && f.debt && f.before && f.after
          ? ` On the ${f.debt} of debt recorded at block ${f.fromBlock} that is ${f.before} a year of interest ` +
            `before and ${f.after} after.`
          : "";
      if (note.live) {
        return (
          `Since this vault's ${makerRateEndLabel(note.from)} at block ${f.fromBlock} the ${ilk} stability fee has ` +
          `moved ${f.fromRate} → ${f.toRate} per year, ${moveWord(note.deltaPp)} ${f.deltaMagnitude}, at the latest ` +
          `block ${f.toBlock}.${interestClause}`
        );
      }
      let sentence =
        `The ${ilk} stability fee moved ${f.fromRate} → ${f.toRate} per year, ${moveWord(note.deltaPp)} ` +
        `${f.deltaMagnitude}, between this vault's ${makerRateEndLabel(note.from)} at block ${f.fromBlock} and its ` +
        `${makerRateEndLabel(note.to)} at block ${f.toBlock}`;
      sentence +=
        note.setsBetween != null && note.setsBetween > 0
          ? `; governance reset it ${resetCount(note.setsBetween)} in between.`
          : `.`;
      return `${sentence}${interestClause}`;
    }
    if (isAaveFamily(note)) {
      const quantity = `the ${note.marketSymbol} ${aaveFamilyRateNoun(note)} on ${aaveFamilyMarketName(note)}`;
      if (note.live) {
        return (
          `Since this position's ${aaveFamilyEndLabel(note.from)} at block ${f.fromBlock} ${quantity} has moved ` +
          `${f.fromRate} → ${f.toRate} per year, ${moveWord(note.deltaPp)} ${f.deltaMagnitude}, at the latest block ` +
          `${f.toBlock}.${aaveFamilyInterestClause(note, f, true)}`
        );
      }
      return (
        `${quantity[0].toUpperCase()}${quantity.slice(1)} moved ${f.fromRate} → ${f.toRate} per year, ` +
        `${moveWord(note.deltaPp)} ${f.deltaMagnitude}, between this position's ${aaveFamilyEndLabel(note.from)} at ` +
        `block ${f.fromBlock} and its ${aaveFamilyEndLabel(note.to)} at block ${f.toBlock}.` +
        `${aaveFamilyInterestClause(note, f, false)}`
      );
    }
    if (note.live) {
      let sentence =
        `Since this CDP's ${polarisEndLabel(note.from)} at block ${f.fromBlock} the ${note.marketSymbol} market's ` +
        `primary rate has moved ${f.fromRate} → ${f.toRate} per year, ${f.delta}, at the latest block ${f.toBlock}`;
      sentence += f.sets ? `; the market reset it ${f.sets} times since.` : `.`;
      if (note.interest && f.debt && f.before && f.after) {
        sentence +=
          ` On the ${f.debt} of debt recorded at block ${f.fromBlock} that is ${f.before} a year of interest before ` +
          `and ${f.after} after.`;
      }
      return sentence;
    }
    // A merged run leads with how much of this CDP's own history it covers,
    // because that is the thing the reader cannot see any other way: the run's
    // ends are two touches with more of the CDP's own touches between them.
    let sentence = f.steps
      ? `Over ${f.steps} of this CDP's own touches the ${note.marketSymbol} market's primary rate moved ` +
        `${f.fromRate} → ${f.toRate} per year, ${f.delta}, from its ${polarisEndLabel(note.from)} at block ` +
        `${f.fromBlock} to its ${polarisEndLabel(note.to)} at block ${f.toBlock} — each step in between moved it ` +
        `the same way, so they are stated as one stretch rather than ${f.steps} in a row`
      : `The ${note.marketSymbol} market's primary rate moved ${f.fromRate} → ${f.toRate} per year, ${f.delta}, ` +
        `between this CDP's ${polarisEndLabel(note.from)} at block ${f.fromBlock} and its ` +
        `${polarisEndLabel(note.to)} at block ${f.toBlock}`;
    sentence += f.sets ? `; the market reset it ${f.sets} times in between.` : `.`;
    if (note.interest && f.debt && f.before && f.after) {
      sentence +=
        ` On the ${f.debt} of debt recorded at block ${f.fromBlock} that is ${f.before} a year of interest before ` +
        `and ${f.after} after.`;
    }
    return sentence;
  }
  const f = marketNoteFigures(note);
  if (note.live) {
    const step =
      `Since this account's own ${note.from.kind} at block ${f.fromBlock} the ${note.marketSymbol} market's share ` +
      `rate has moved ${f.fromRate} → ${f.toRate} ${note.unitLabel}, ${f.ratio}, at the latest block ${f.toBlock}.`;
    if (!f.units) return step;
    return `${step} This account's ${f.units} represents ${f.before} at the earlier rate and ${f.after} now.`;
  }
  const step =
    `The ${note.marketSymbol} market's share rate stepped ${f.fromRate} → ${f.toRate} ${note.unitLabel}, ` +
    `${f.ratio}, between blocks ${f.fromBlock} and ${f.toBlock}, with no Mint or Redeem in the market between them.`;
  if (!f.units) return step;
  return `${step} This account's ${f.units} represented ${f.before} before and ${f.after} after.`;
}

/** The note in one clause, with both blocks — the export's summary line. */
export function marketNoteHeadline(note: MarketNote): string {
  if (note.kind === "vault-terms") return `${note.statement}, at block ${formatBlock(note.to.block)}`;
  if (note.kind === "price-gap") {
    const f = priceGapFigures(note);
    if (note.protocol === "aave-v4") {
      return note.live
        ? `the ${note.marketSymbol} oracle price has moved ${f.change} since block ${f.fromBlock}, at the latest block ${f.toBlock}`
        : `the ${note.marketSymbol} oracle price moved ${f.change} between this position's ${aaveV4EndLabel(note.from)} at block ${f.fromBlock} and its ${aaveV4EndLabel(note.to)} at block ${f.toBlock}`;
    }
    if (isAaveFamilyPriceGap(note)) {
      return `the ${note.marketSymbol} oracle price moved ${f.change} between this position's ${aaveFamilyEndLabel(note.from)} at block ${f.fromBlock} and the liquidation at block ${f.toBlock} that seized it`;
    }
    return note.live
      ? `the ${note.marketSymbol} oracle price has moved ${f.change} since block ${f.fromBlock}, at the latest block ${f.toBlock}`
      : `the ${note.marketSymbol} oracle price moved ${f.change} between blocks ${f.fromBlock} and ${f.toBlock}`;
  }
  if (note.kind === "rate-step") {
    // The later rate leads, on the page and here alike (Miles, 2026-09-10):
    // the question a rate note answers is what the position pays now, and the
    // move is the qualifier rather than the figure.
    const f = rateStepFigures(note);
    if (note.protocol === "makerdao") {
      const ilk = makerMarketName(note);
      return note.live
        ? `the ${ilk} stability fee is ${f.toRate} per year at the latest block ${f.toBlock}, ${f.delta} since block ${f.fromBlock}`
        : `the ${ilk} stability fee was ${f.toRate} per year by block ${f.toBlock}, ${f.delta} from ${f.fromRate} at block ${f.fromBlock}`;
    }
    if (isAaveFamily(note)) {
      const quantity = `the ${note.marketSymbol} ${aaveFamilyRateNoun(note)} on ${aaveFamilyMarketName(note)}`;
      return note.live
        ? `${quantity} is ${f.toRate} per year at the latest block ${f.toBlock}, ${f.delta} since block ${f.fromBlock}`
        : `${quantity} was ${f.toRate} per year by this position's ${aaveFamilyEndLabel(note.to)} at block ${f.toBlock}, ${f.delta} from ${f.fromRate} at block ${f.fromBlock}`;
    }
    return note.live
      ? `the ${note.marketSymbol} market's primary rate is ${f.toRate} per year at the latest block ${f.toBlock}, ${f.delta} since block ${f.fromBlock}`
      : `the ${note.marketSymbol} market's primary rate was ${f.toRate} per year by block ${f.toBlock}, ${f.delta} from ${f.fromRate} at block ${f.fromBlock}`;
  }
  const f = marketNoteFigures(note);
  return note.live
    ? `the ${note.marketSymbol} market's share rate has moved ${f.ratio} since block ${f.fromBlock}, at the latest block ${f.toBlock}`
    : `the ${note.marketSymbol} market's share rate stepped ${f.ratio} between blocks ${f.fromBlock} and ${f.toBlock}`;
}

/** The note in one clause, against the row it is anchored to — the annotation
 *  in the export's timeline table, where the row already states the block. */
export function marketNoteRowAnnotation(note: MarketNote): string {
  // A live note is never anchored to a row (see `MarketNoteBase.live`), so
  // this branch is not reached by `anchoredNotes.get(e.id)` today — kept for
  // the same reason every other prose helper here branches on `note.live`:
  // a caller that ever iterates ALL of a page's notes against its own event
  // rows must not print a "between blocks" annotation for a note that runs
  // to the chain head instead.
  if (note.kind === "vault-terms") return `vault note: ${note.statement}, at block ${formatBlock(note.to.block)}`;
  if (note.kind === "price-gap") {
    const f = priceGapFigures(note);
    if (note.protocol === "aave-v4") {
      const health = f.hfBefore && f.hfAfter ? `; health factor ${f.hfBefore} → ${f.hfAfter} at those amounts` : "";
      return note.live
        ? `market note: the ${note.marketSymbol} oracle price has moved ${f.change} since block ${f.fromBlock}, at the latest block ${f.toBlock}${health}`
        : `market note: the ${note.marketSymbol} oracle price moved ${f.change} by block ${f.toBlock}${health}`;
    }
    if (isAaveFamilyPriceGap(note)) {
      return `market note: the ${note.marketSymbol} oracle price moved ${f.change} by block ${f.toBlock}, since this position last touched ${note.marketSymbol} at block ${f.fromBlock}`;
    }
    return note.live
      ? `market note: the ${note.marketSymbol} oracle price has moved ${f.change} since block ${f.fromBlock}, at the latest block ${f.toBlock}`
      : `market note: the ${note.marketSymbol} oracle price moved ${f.change} by block ${f.toBlock}`;
  }
  if (note.kind === "rate-step") {
    const f = rateStepFigures(note);
    if (note.protocol === "makerdao") {
      const ilk = makerMarketName(note);
      return note.live
        ? `market note: the ${ilk} stability fee is ${f.toRate} per year at the latest block ${f.toBlock}, ${f.delta} since block ${f.fromBlock}`
        : `market note: the ${ilk} stability fee was ${f.toRate} per year by block ${f.toBlock}, ${f.delta}${f.steps ? `, over ${f.steps} of this vault's touches` : ""}`;
    }
    if (isAaveFamily(note)) {
      const quantity = `the ${note.marketSymbol} ${aaveFamilyRateNoun(note)}`;
      return note.live
        ? `market note: ${quantity} is ${f.toRate} per year at the latest block ${f.toBlock}, ${f.delta} since block ${f.fromBlock}`
        : `market note: ${quantity} was ${f.toRate} per year by block ${f.toBlock}, ${f.delta}`;
    }
    return note.live
      ? `market note: the ${note.marketSymbol} market's primary rate is ${f.toRate} per year at the latest block ${f.toBlock}, ${f.delta} since block ${f.fromBlock}`
      : `market note: the ${note.marketSymbol} market's primary rate was ${f.toRate} per year by block ${f.toBlock}, ${f.delta}${f.steps ? `, over ${f.steps} of this CDP's touches` : ""}`;
  }
  const f = marketNoteFigures(note);
  return note.live
    ? `market note: the ${note.marketSymbol} market's share rate has moved ${f.ratio} since block ${f.fromBlock}, at the latest block ${f.toBlock}`
    : `market note: the ${note.marketSymbol} market's share rate stepped ${f.ratio} by block ${f.toBlock}`;
}

/** Where each end was read, and (for a price gap) why the stretch is stated at
 *  all — the export's "Receipt:" line under each note. */
/** The steps a merged run took in, each as its own two blocks and two rates —
 *  the receipt's account of what the one header row stands for. Empty on a
 *  note that merged nothing. */
const mergedStepsClause = (note: RateStepNote): string => {
  const members = note.members;
  if (!members || members.length < 2) return "";
  const steps = members
    .map(
      (m) =>
        `${formatBlock(m.fromBlock)} → ${formatBlock(m.toBlock)}, ` +
        `${formatRatePercent(m.fromValue)} → ${formatRatePercent(m.toValue)}`,
    )
    .join("; ");
  return (
    ` Stated as one stretch over ${members.length.toLocaleString("en-US")} consecutive steps that all moved the ` +
    `rate the same way — ${steps}.`
  );
};

export function marketNoteReceiptLine(note: MarketNote): string {
  if (note.kind === "vault-terms")
    return (
      `- Receipt: the vault's own \`${note.termsKind}\` configuration log at block ` +
      `${formatBlock(note.to.block)}, tx ${note.to.txHash}, read by topic over the whole chain. Its words, raw: ` +
      `${Object.entries(note.fields)
        .map(([key, value]) => `${key} ${value}`)
        .join(", ")}. It is not this address's event — it moved every holder's terms at once — so it is counted in ` +
      `nothing on the page.`
    );
  if (note.kind === "price-gap") {
    if (note.protocol === "aave-v4") {
      const ltClause = note.health
        ? ` The health factors read the liquidation threshold the spoke reports now, applied to the amounts and ` +
          `prices this position's row recorded at block ${note.health.atBlock}.`
        : "";
      if (note.live) {
        // Both ends are reads of the same oracle — Aave V4's own, which since
        // server mig 314 is what the stored history holds too: the earlier one
        // pinned to the block of this position's row, the later one at head.
        return (
          `- Receipt: earlier price — the oracle read at block ${note.from.block} ` +
          `(/api/oracle/aave-v4?block=${note.from.block}), the block of this position's ${aaveV4EndLabel(note.from)}, ` +
          `tx ${note.from.txHash} log ${note.from.logIndex}; later price — a live read of Aave's oracle ` +
          `(/api/oracle/aave-v4) at the latest block ${note.to.block}. Stated because ${priceGapReason(note)}.${ltClause}`
        );
      }
      return (
        `- Receipt: earlier price — this position's ${aaveV4EndLabel(note.from)} at block ${note.from.block}, ` +
        `tx ${note.from.txHash} log ${note.from.logIndex}; later price — its ${aaveV4EndLabel(note.to)} at block ` +
        `${note.to.block}, tx ${note.to.txHash} log ${note.to.logIndex}. Stated because ${priceGapReason(note)}.${ltClause}`
      );
    }
    if (isAaveFamilyPriceGap(note)) {
      return (
        `- Receipt: earlier price — this position's ${aaveFamilyEndLabel(note.from)} at block ${note.from.block}, ` +
        `tx ${note.from.txHash} log ${note.from.logIndex}, the ${aaveFamilyOracleOwner(note)} oracle price stored on ` +
        `that row; later price — the liquidation at block ${note.to.block}, tx ${note.to.txHash} log ` +
        `${note.to.logIndex}, its seized-collateral price. Stated because ${priceGapReason(note)} that seized ` +
        `${note.marketSymbol}.`
      );
    }
    const isPolaris = note.measureKind === "protocol";
    const positionNoun = isPolaris ? "CDP" : "trove";
    const endLabel = isPolaris ? polarisEndLabel : priceGapEndLabel;
    if (note.live) {
      const liveRoute = isPolaris ? "the market's own price feed, read live" : "the backend's live oracle read";
      return (
        `- Receipt: earlier price — this ${positionNoun}'s ${endLabel(note.from)} at block ${note.from.block}, ` +
        `tx ${note.from.txHash} log ${note.from.logIndex}; later price — ${liveRoute} at the latest block ` +
        `${note.to.block}. Stated because ${priceGapReason(note)}.`
      );
    }
    return (
      `- Receipt: earlier price — this trove's ${priceGapEndLabel(note.from)} at block ${note.from.block}, ` +
      `tx ${note.from.txHash} log ${note.from.logIndex}; later price — its ${priceGapEndLabel(note.to)} at block ` +
      `${note.to.block}, tx ${note.to.txHash} log ${note.to.logIndex}. Stated because ${priceGapReason(note)}.`
    );
  }
  if (note.kind === "rate-step") {
    if (note.protocol === "makerdao") {
      // A Maker fee has no log of its own: what the receipt can name is the
      // DRIP the fee is first evidenced by — the first Jug.drip that
      // compounded at the new duty — and the Jug read that confirms it at that
      // drip's own block. Never a spell block: it is not indexed.
      const namedMaker = (end: "from" | "to") => {
        if (end === "to" && note.live) return `the Jug's base + duty, read live at block ${note.to.block}`;
        const o = end === "from" ? note.observed.from : note.observed.to;
        const p = end === "from" ? note.from : note.to;
        return o
          ? `the fee the Vat's own fold evidences at block ${o.block}, tx ${o.txHash}, log ${o.logIndex} (the first ` +
              `drip at that fee), confirmed by the Jug's duty read at that block`
          : `this vault's ${makerRateEndLabel(p)} at block ${p.block}, tx ${p.txHash} log ${p.logIndex}`;
      };
      return `- Receipt: rate before — ${namedMaker("from")}; rate after — ${namedMaker("to")}.${mergedStepsClause(note)}`;
    }
    if (isAaveFamily(note)) {
      // Both ends are the reserve's OWN ReserveDataUpdated — the Pool emits
      // one on every action that touches the reserve — but the two are found
      // by different rules, and the receipt has to say which: the earlier is
      // read at or before the position's own action (so it is the rate that
      // action left in force), the later strictly before the position's next
      // touch and never from inside that touch's own transaction.
      const from = note.observed.from;
      const to = note.observed.to;
      const after = from
        ? `the reserve's ReserveDataUpdated at block ${from.block}, tx ${from.txHash}, log ${from.logIndex}`
        : `this position's ${aaveFamilyEndLabel(note.from)} at block ${note.from.block}, tx ${note.from.txHash}, log ${note.from.logIndex}`;
      const before = note.live
        ? `the Pool's getReserveData, read live at block ${note.to.block}`
        : to
          ? `its ReserveDataUpdated at block ${to.block}, tx ${to.txHash}, log ${to.logIndex}, read before the ` +
            `position's own transaction`
          : `this position's ${aaveFamilyEndLabel(note.to)} at block ${note.to.block}, tx ${note.to.txHash}, log ${note.to.logIndex}`;
      const later = note.live ? "rate now" : "rate before the position's next touch";
      return `- Receipt: rate after the position's own action — ${after}; ${later} — ${before}.`;
    }
    const named = (end: "from" | "to") => {
      if (end === "to" && note.live) return `the cdpManager's own rate, read live at block ${note.to.block}`;
      const o = end === "from" ? note.observed.from : note.observed.to;
      const p = end === "from" ? note.from : note.to;
      return o
        ? `its PrimaryRateSet at block ${o.block}, tx ${o.txHash} log ${o.logIndex}`
        : `this CDP's ${polarisEndLabel(p)} at block ${p.block}, tx ${p.txHash} log ${p.logIndex}`;
    };
    return `- Receipt: rate before — ${named("from")}; rate after — ${named("to")}.${mergedStepsClause(note)}`;
  }
  if (note.live) {
    return (
      `- Receipt: last observation before — this account's own ${note.from.kind} at block ${note.from.block}, ` +
      `tx ${note.from.txHash} log ${note.from.logIndex}; later rate — the market's own exchange rate, read live at ` +
      `block ${note.to.block}.`
    );
  }
  return (
    `- Receipt: last observation before — ${note.from.wallet}'s ${note.from.kind} at block ${note.from.block}, ` +
    `tx ${note.from.txHash} log ${note.from.logIndex}; first after — ${note.to.wallet}'s ${note.to.kind} at block ` +
    `${note.to.block}, tx ${note.to.txHash} log ${note.to.logIndex}.`
  );
}
