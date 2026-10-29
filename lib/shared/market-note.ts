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
// Everything here is pure and React-free: the placement rule and the
// selectors are the things worth proving in isolation, and
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
// Two kinds are left (ui-jobs 328 dropped the price gap and the share-rate
// step, which a price chart replaces): the RATE STEP, a market's rate
// between two of a position's touches (Polaris here; MakerDAO and the Aave
// family in `lib/<protocol>/market-notes.ts`), and the VAULT'S
// TERMS, a configuration event every holder of a vault took at once.
//
// The Polaris primary-rate step: the market's primary rate (an
// algorithmic Peg Stability Rate, set on the market's PSM mints/redemptions,
// never chosen by a holder) moving between two of a CDP's OWN touches on the
// market it borrows in. Both ends are the position's events — the rate is
// already on the row (`context.data.primaryRate`), so this needs no endpoint
// and no oracle. The PrimaryRateSet log each rate was read from is optional on the
// type: it feeds the receipt when the backend's per-row join has it, and a
// note still renders off the CDP's own two touches when it does not.
//
// A note's KIND is the discriminant everything downstream switches on, once:
// the row picks a sentence and a receipt vocabulary from it, and the markdown
// exports pick a phrasing from it. Nothing else branches — the placement rule,
// the geometry, the mark and the never-counted guarantee are the same for every
// kind, and a third kind should have to touch only the four prose helpers at
// the foot of this file and its own provenance module.

import type { BaseActivityEvent, PolarisContext } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";

/** The polaris context on an event, or null. The narrowing is spelled out
 *  rather than imported (`isPolarisEvent`) to keep this module's imports
 *  type-only — see the header. It reads the discriminant that guard reads. `PolarisContext.rateSet` (the backend's per-row PrimaryRateSet
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

/** What every note carries, whatever it observed: two ends and the market they
 *  were observed in. */
export interface MarketNoteBase {
  /** Stable: `${kind}:${market}:${fromBlock}-${toBlock}`, or
   *  `${kind}:${market}:${fromBlock}-head` for a live note (see `live`). */
  id: string;
  marketSymbol: string;
  marketAddress: string;
  /** "% per year" — what one unit of `value` counts. */
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
   *  position since it last touched it". Never anchored, never gated on the
   *  historical move threshold; a live rate note whose move rounds to 0.00
   *  points is hidden (`liveNoteStated`).
   *  One position can have a live and a historical note of the same kind at
   *  once — they answer different questions. */
  live?: true;
  /** Which protocol's selector built the note, where the kind alone does not
   *  say how to read it — the prose, the row body and the receipts branch on
   *  it (`"makerdao"`, `"aave-v3"`, `"spark"`). Absent on Polaris, the first
   *  home. */
  protocol?: string;
}

/** An ERC-4626 vault's OWN TERMS, changed for every holder at once — the
 *  vault surfaces' note (MetaMorpho's fee, name and symbol; Aave's target
 *  rate, cooldown and unstake window; whatever a third family emits).
 *
 *  It is a note for the reason a rate step is: a row is something
 *  this holder did, and a configuration event happened to every holder at the
 *  same moment. Placing it among the rows by block is what lets a reader see
 *  WHEN the terms moved relative to their own events; keeping it out of every
 *  count is what stops it being read as one of them.
 *
 *  UNLIKE A RATE STEP IT CARRIES ITS OWN WORDS AND ITS OWN RECEIPT. A rate
 *  step is one quantity observed twice, so the row can say what moved from
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
  /** The marker's name where the family has one ("Savings Rate change");
   *  unset, the marker reads "Market note". */
  title?: string;
  /** The marker's tooltip where the family words it; unset, "<share> terms". */
  tip?: string;
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
  /** Set where the terms are a rate stated from → to (Sky's Savings Rate):
   *  the row then takes the T1 shape and a run of them groups (ui-jobs 399).
   *  Unset, the row states `headline` as before. */
  rate?: VaultTermsRate;
}

/** A vault's rate set from one figure to another, as its family states it. */
export interface VaultTermsRate {
  /** Percent a year, before and after: 3.6 for 3.60%. */
  from: number;
  to: number;
  /** The receipt behind the earlier rate; `prov` carries the later. */
  fromProv: Provenance;
  /** The head's words for each direction. */
  t1: RateNoteWords;
}

/** A rate note's T1 head, one phrase per direction: "Savings rate increased",
 *  "… decreased", and "… adjusted" for a group whose members went both ways. */
export type RateNoteWords = Record<RateMove, string>;

/** The PSM's mints and redemptions in one closed gap between two of a Polaris
 *  CDP's touches, as one row (ui-jobs 402): each trade changed every open
 *  CDP's collateral and debt pro rata, and the closing touch wrote the CDP's
 *  net share into its stated figures. Both ends are the CDP's own touches;
 *  the row anchors on the closing one, so it draws just below it. Built by
 *  `polarisPsmGapNotes` (lib/polaris/psm-gap.ts). */
export interface PsmGapNote extends MarketNoteBase {
  kind: "psm-gap";
  market: "usdp" | "goldp";
  cdpId: string;
  /** The PSM's mints and redemptions in the gap: the market's PrimaryRateSet
   *  count at the closing touch less the count at the earlier one (the rate
   *  is re-set at every mint and redemption). Null where either touch
   *  carries no count. */
  trades: number | null;
  /** The two counts `trades` is the difference of, earlier first. */
  ordinals: [number, number] | null;
  /** The share the closing touch wrote, as its log states it: pETH added to
   *  the collateral, and the stablecoin added to the debt (`_mintRedeemCollGain`,
   *  `_mintRedeemDebtGain`). */
  collShare: number;
  debtShare: number;
  /** The raw log values, for the receipts. */
  collShareRaw?: string;
  debtShareRaw?: string;
  /** pETH in the stablecoin at the closing touch's block, where the oracle
   *  lane has it: the net share in the stablecoin. */
  priceAtTouch: number | null;
  /** Set on the row that stands for a run of touches' gaps (`mergePsmGaps`):
   *  the gaps it sums, oldest first. */
  members?: PsmGapNote[];
}

/** A run of touches drawn as one row holds one PSM row (ui-jobs 404): its
 *  members' gaps summed, from the first gap's start to the last's end, in
 *  the place of the first. Every other note is left as it is. */
export function mergePsmGaps(notes: readonly MarketNote[]): MarketNote[] {
  const gaps = notes.filter((n): n is PsmGapNote => n.kind === "psm-gap");
  if (gaps.length < 2) return notes as MarketNote[];
  const asc = [...gaps].sort((a, b) => a.to.block - b.to.block);
  const first = asc[0];
  const last = asc[asc.length - 1];
  const trades = asc.every((g) => g.trades != null) ? asc.reduce((n, g) => n + (g.trades ?? 0), 0) : null;
  const merged: PsmGapNote = {
    ...last,
    id: `psm-gap:${last.market}:${first.from.block}-${last.to.block}:run`,
    from: first.from,
    trades,
    ordinals: first.ordinals && last.ordinals ? [first.ordinals[0], last.ordinals[1]] : null,
    collShare: asc.reduce((n, g) => n + g.collShare, 0),
    debtShare: asc.reduce((n, g) => n + g.debtShare, 0),
    collShareRaw: undefined,
    debtShareRaw: undefined,
    priceAtTouch: null,
    members: asc,
  };
  const out: MarketNote[] = [];
  let placed = false;
  for (const n of notes) {
    if (n.kind !== "psm-gap") out.push(n);
    else if (!placed) {
      out.push(merged);
      placed = true;
    }
  }
  return out;
}

export type MarketNote = RateStepNote | VaultTermsNote | PsmGapNote;

// ── A rate note as a T1 row, and a run of them as one group ────────────────
// A note that states a rate from → to (every rate step; a vault's terms where
// the family hands a `rate`) reads as an event row does: the kind in words in
// the head, the rate after in the pink pill on the spine's flank. Two or more
// such notes of one kind in one gap, no event between them, draw as one group
// row (ui-jobs 399). A note is not an event, so the run's floor is the notes'
// own two, not decision 0039's five.

export type RateMove = "increased" | "decreased" | "adjusted";

/** The shared kinds' words (rate steps). A family's vault rate brings its
 *  own (`VaultTermsRate.t1`). */
export const RATE_NOTE_T1 = {
  increased: "increased",
  decreased: "decreased",
  adjusted: "adjusted",
  makerdao: "Stability fee",
  polaris: "Primary rate",
  supply: "supply rate",
  borrow: "borrow rate",
  /** The group's line: first → last, then ", moved between low and high"
   *  where the run left them. */
  to: "to",
  between: "moved between",
  and: "and",
  /** After the count in a group's spoken name: "9 changes". */
  changes: "changes",
  /** The row's spoken name opens with what it is (ui-jobs 403): "Market note,
   *  Savings rate increased, 3.80%". */
  name: "Market note",
} as const;

/** The rate a note states, in percent a year, before and after; null on a
 *  note that states no rate (a vault's fee, a name). */
export function noteRateSpan(note: MarketNote): [number, number] | null {
  if (note.kind === "rate-step") return [note.from.value * 100, note.to.value * 100];
  if (note.kind === "psm-gap") return null;
  return note.rate ? [note.rate.from, note.rate.to] : null;
}

const cents = (pct: number): number => Math.round(pct * 100);

/** Which way one note moved its rate, at the two decimals the row shows. */
export function noteRateMove(note: MarketNote): RateMove {
  const span = noteRateSpan(note);
  if (!span || cents(span[0]) === cents(span[1])) return "adjusted";
  return span[1] > span[0] ? "increased" : "decreased";
}

/** The head's words for a rate note, or null on a note that states no rate. */
export function noteT1Words(note: MarketNote): RateNoteWords | null {
  if (note.kind === "vault-terms") return note.rate?.t1 ?? null;
  if (note.kind === "psm-gap") return null;
  const noun =
    note.protocol === "makerdao"
      ? RATE_NOTE_T1.makerdao
      : note.protocol === "aave-v3" || note.protocol === "spark"
        ? `${note.marketSymbol} ${note.side === "supply" ? RATE_NOTE_T1.supply : RATE_NOTE_T1.borrow}`
        : RATE_NOTE_T1.polaris;
  return {
    increased: `${noun} ${RATE_NOTE_T1.increased}`,
    decreased: `${noun} ${RATE_NOTE_T1.decreased}`,
    adjusted: `${noun} ${RATE_NOTE_T1.adjusted}`,
  };
}

/** Two or more rate notes of one kind, adjacent in one gap, as one row. */
export interface NoteRun {
  group: "run";
  /** `run:` and the first member's id: the open state and the marker key on it. */
  id: string;
  /** In the gap's display order. */
  notes: MarketNote[];
}

export const isNoteRun = (x: MarketNote | LiveNoteGroup | NoteRun): x is NoteRun => (x as NoteRun).group === "run";

/** What makes two notes the same kind for a run: the quantity and the
 *  market. Null on a note that never joins one (no rate, or live). */
function runKey(note: MarketNote): string | null {
  if (note.live || !noteRateSpan(note)) return null;
  return note.kind === "rate-step"
    ? `rate-step:${note.protocol ?? "polaris"}:${note.marketAddress}:${note.marketSymbol}:${note.side ?? ""}`
    : note.kind === "vault-terms"
      ? `vault-terms:${note.termsKind}:${note.marketAddress}`
      : null;
}

/** One gap's notes with each run of two or more same-kind rate notes as one
 *  `NoteRun`, in the order given. */
export function noteRuns(notes: readonly MarketNote[]): (MarketNote | NoteRun)[] {
  const out: (MarketNote | NoteRun)[] = [];
  let i = 0;
  while (i < notes.length) {
    const key = runKey(notes[i]);
    let j = i + 1;
    while (key && j < notes.length && runKey(notes[j]) === key) j++;
    if (j - i >= 2) out.push({ group: "run", id: `run:${notes[i].id}`, notes: notes.slice(i, j) });
    else out.push(notes[i]);
    i = j;
  }
  return out;
}

/** A run as its head and line state it: the members oldest first, the rate
 *  before the first and after the last, the lowest and highest it passed
 *  through, which way the members moved it, and whether the range is drawn
 *  (the run went outside its two ends). */
export function noteRunReading(run: NoteRun) {
  const members = [...run.notes].sort((a, b) => a.to.block - b.to.block || cmp(a.id, b.id));
  const spans = members.map((n) => noteRateSpan(n) as [number, number]);
  const from = spans[0][0];
  const to = spans[spans.length - 1][1];
  const all = spans.flat();
  const low = Math.min(...all);
  const high = Math.max(...all);
  const movesEach = members.map(noteRateMove);
  const move: RateMove = movesEach.every((m) => m === "increased")
    ? "increased"
    : movesEach.every((m) => m === "decreased")
      ? "decreased"
      : "adjusted";
  const showRange = cents(low) < Math.min(cents(from), cents(to)) || cents(high) > Math.max(cents(from), cents(to));
  return { members, from, to, low, high, move, showRange };
}

// ── The live notes as one card ──────────────────────────────────────────────
// Where the head slot holds two or more LIVE notes (an Aave position borrowing
// several reserves), they are drawn as one card with one spine node and one
// line per note (`LiveNoteGroupRow` in components/shared/market-note-row.tsx).
// One live note keeps its own row, and a historical note never joins a group.

/** The live notes of one head slot, drawn as one card. */
export interface LiveNoteGroup {
  group: "live";
  /** One group per head slot, so one id: the open state and the spine
   *  marker key on it. */
  id: string;
  /** In reading order (`orderLiveNotes`). */
  notes: MarketNote[];
}

export const LIVE_NOTE_GROUP_ID = "live-notes:head";

export const isLiveNoteGroup = (x: MarketNote | LiveNoteGroup | NoteRun): x is LiveNoteGroup =>
  (x as LiveNoteGroup).group === "live";

/** The size of the move a note states: points of rate for a rate step. A
 *  vault's terms state no move. */
function statedMove(note: MarketNote): number {
  return note.kind === "rate-step" ? Math.abs(note.deltaPp) : 0;
}

/** The order a group's lines are read in. The builders emit notes in the
 *  overlay's reserve or market order, which tells a reader nothing, so the
 *  rule is the size of the move, largest first. Kinds do not share a unit,
 *  so each kind keeps the place the page built it in and is ordered within
 *  its kind. Equal moves keep the builder's order. */
export function orderLiveNotes(notes: readonly MarketNote[]): MarketNote[] {
  const kindAt = new Map<string, number>();
  notes.forEach((n) => {
    if (!kindAt.has(n.kind)) kindAt.set(n.kind, kindAt.size);
  });
  return notes
    .map((note, i) => ({ note, i }))
    .sort(
      (a, b) =>
        (kindAt.get(a.note.kind) ?? 0) - (kindAt.get(b.note.kind) ?? 0) ||
        statedMove(b.note) - statedMove(a.note) ||
        a.i - b.i,
    )
    .map((x) => x.note);
}

/** False for a live rate note whose move rounds to 0.00 points: hidden on
 *  every family (rails-ops market-notes §9). Every other note is stated. */
export function liveNoteStated(note: MarketNote): boolean {
  return !(note.live && note.kind === "rate-step" && Math.abs(note.deltaPp) < 0.005);
}

/** The head slot's live notes as one group, or null where fewer than two are
 *  live (a single note keeps its own row). */
export function liveNoteGroup(notes: readonly MarketNote[]): LiveNoteGroup | null {
  const live = notes.filter((n) => n.live);
  return live.length > 1 ? { group: "live", id: LIVE_NOTE_GROUP_ID, notes: orderLiveNotes(live) } : null;
}

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
  say: (note: N) => {
    headline: string;
    quantity: string;
    statement: string;
    prov: Provenance;
    title?: string;
    tip?: string;
    rate?: VaultTermsRate;
  },
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
      ...(words.title ? { title: words.title } : {}),
      ...(words.tip ? { tip: words.tip } : {}),
      statement: words.statement,
      prov: words.prov,
      measureProtocolId: vault.protocolId,
      fields: note.fields,
      ...(words.rate ? { rate: words.rate } : {}),
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

/** The log index from a polaris event id's TAIL `:N` segment
 *  (`cdp_updated:<txHash>:<logIndex>`). A split on the last `-` or `_` would
 *  land inside the prefix's word "updated" and return -1, so the tail is cut
 *  at the last `:`. */
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
export function anchorMarketNotes<N extends AnchoredNote = MarketNote>(
  notes: readonly N[],
  events: readonly BaseActivityEvent[],
  sortDirection: "asc" | "desc",
): ReadonlyMap<string, N[]> {
  if (notes.length === 0 || events.length === 0) return EMPTY_ANCHORS as ReadonlyMap<string, N[]>;
  // The displayed list, oldest first, whatever direction it is drawn in.
  const ascending = sortDirection === "asc" ? events : [...events].reverse();
  const out = new Map<string, N[]>();
  const anchored: N[] = [];
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

const EMPTY_ANCHORS: ReadonlyMap<string, AnchoredNote[]> = new Map();

/** What placement reads of a row that sits between two events: a market
 *  note, or a protocol change (lib/shared/protocol-change-note.ts). */
export interface AnchoredNote {
  id: string;
  to: { block: number };
  anchorEventId?: string;
}

// ── Phase 3: the Polaris primary-rate step ──────────────────────────────────

/** The threshold, in percentage points: a stretch is stated when
 *  `|rateB − rateA| × 100 ≥ RATE_STEP_MIN_PP`. Absolute, not relative — the
 *  rate is 0 on many rows (a market before its first PrimaryRateSet, or a
 *  reset to zero), so a relative rule divides by zero. There is no
 *  always-render clause for a stretch ending in a liquidation: the primary
 *  rate does not cause one. Exported so the verifier
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
 *  transfer. BOTH ends are the position's own
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
   *  that state came to be worth" framing a note uses throughout.
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
  /** MakerDAO only: the vault owed nothing at the stretch's earlier end, so
   *  the fee cost it nothing across the stretch. Such a stretch carries no
   *  `interest` and never merges with a neighbour. */
  owedNothing?: boolean;
  /** MakerDAO only: the fee over the whole stretch, from the ilk's rate log —
   *  the lowest and highest rate in force and the time-weighted yearly
   *  average (each a FRACTION, like `from.value`). */
  path?: { min: number; max: number; average: number };
  /** MakerDAO only, on a merged note: the same over its LAST member, the
   *  stretch since the vault's previous event, which is what that row's
   *  "fee since previous event" accrued at. */
  lastPath?: { from: number; min: number; max: number; average: number };
  /** MakerDAO only, on a grouped page: the vault's events between the two
   *  ends that the page holds as folders rather than rows — how many folders,
   *  and how many events they stand for. The ends are ungrouped rows, so a
   *  stretch the flat page would cut at a folder member is one stretch here;
   *  the fee's path across it is `path`. Absent where no folder sits between
   *  the ends. */
  grouped?: { folders: number; events: number };
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
 * Not held to `rateStepNotesFor`'s `RATE_STEP_MIN_PP` gate on a historical
 * stretch; a move that rounds to 0.00 points draws no note (`liveNoteStated`).
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
  const note: RateStepNote = {
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
  return liveNoteStated(note) ? note : null;
}

// ── Formatting — one source for the row, the export and the receipts ─────────

const formatBlock = (n: number): string => n.toLocaleString("en-US");

/** Seconds between the two ends' block timestamps, or null where either end
 *  is undated. Both timestamps are the blocks'
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

/** The move as the difference of the two rates AS SHOWN (each to two
 *  decimals), so "3.61% → 2.41%" states 1.20 points and never the 1.21 the
 *  raw figures round to. The receipt keeps the raw move. */
const shownDeltaPp = (note: RateStepNote): number =>
  (Math.round(note.to.value * 10_000) - Math.round(note.from.value * 10_000)) / 100;

export function rateStepFigures(note: RateStepNote): RateStepFigures {
  return {
    fromRate: formatRatePercent(note.from.value),
    toRate: formatRatePercent(note.to.value),
    deltaMagnitude: formatDeltaPpMagnitude(shownDeltaPp(note)),
    delta: formatDeltaPpSigned(shownDeltaPp(note)),
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
  // An end can be any row that touched the reserve, these three included.
  transfer_in: "incoming transfer",
  transfer_out: "outgoing transfer",
  swap: "swap",
  head: "the latest block",
};

export const aaveFamilyEndLabel = (p: MarketNotePoint): string => AAVE_FAMILY_END_LABELS[p.kind] ?? p.kind;

/** True for the two explorers that read a reserve's own rate this way. */
const isAaveFamily = (note: RateStepNote): boolean => note.protocol === "aave-v3" || note.protocol === "spark";

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

const signedShare = (n: number, digits: number) =>
  `${n < 0 ? "−" : "+"}${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: digits })}`;

/** A PSM gap in one sentence: the trades between two touches and the share
 *  the later touch wrote. */
export function psmGapSentence(note: PsmGapNote): string {
  const stable = note.marketSymbol;
  const trades =
    note.trades != null
      ? `${note.trades.toLocaleString("en-US")} PSM mints and redemptions`
      : "PSM mints and redemptions";
  return (
    `Between blocks ${formatBlock(note.from.block)} and ${formatBlock(note.to.block)}, ${trades} moved the market; ` +
    `the touch at block ${formatBlock(note.to.block)} wrote this position's share, ${signedShare(note.collShare, 4)} pETH ` +
    `to the collateral and ${signedShare(note.debtShare, 2)} ${stable} to the debt`
  );
}

/** The note as one plain sentence — the markdown export's paragraph, and the
 *  wording the row renders figure by figure. */
export function marketNoteSentence(note: MarketNote): string {
  // A vault's own terms come with the family's sentence already written, for
  // the reason `VaultTermsNote` gives: what the event means is that family's
  // mechanic. So every phrasing below reaches for the same one string rather
  // than composing a second version of it out of figures this module cannot
  // read.
  if (note.kind === "vault-terms") return `At block ${formatBlock(note.to.block)}, ${note.statement}.`;
  if (note.kind === "psm-gap") return `${psmGapSentence(note)}.`;
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
      `Since this position's ${polarisEndLabel(note.from)} at block ${f.fromBlock} the ${note.marketSymbol} market's ` +
      `primary rate has moved ${f.fromRate} → ${f.toRate} per year, ${f.delta}, at the latest block ${f.toBlock}`;
    sentence += f.sets
      ? `; the market re-set the primary rate ${f.sets} times since, once per PSM mint or redemption.`
      : `.`;
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
    ? `Over ${f.steps} of this position's own touches the ${note.marketSymbol} market's primary rate moved ` +
      `${f.fromRate} → ${f.toRate} per year, ${f.delta}, from its ${polarisEndLabel(note.from)} at block ` +
      `${f.fromBlock} to its ${polarisEndLabel(note.to)} at block ${f.toBlock} — each step in between moved it ` +
      `the same way, so they are stated as one stretch`
    : `The ${note.marketSymbol} market's primary rate moved ${f.fromRate} → ${f.toRate} per year, ${f.delta}, ` +
      `between this position's ${polarisEndLabel(note.from)} at block ${f.fromBlock} and its ` +
      `${polarisEndLabel(note.to)} at block ${f.toBlock}`;
  sentence += f.sets
    ? `; the market re-set the primary rate ${f.sets} times in between, once per PSM mint or redemption.`
    : `.`;
  if (note.interest && f.debt && f.before && f.after) {
    sentence +=
      ` On the ${f.debt} of debt recorded at block ${f.fromBlock} that is ${f.before} a year of interest before ` +
      `and ${f.after} after.`;
  }
  return sentence;
}

/** The note in one clause, with both blocks — the export's summary line. */
export function marketNoteHeadline(note: MarketNote): string {
  if (note.kind === "vault-terms") return `${note.statement}, at block ${formatBlock(note.to.block)}`;
  if (note.kind === "psm-gap") return psmGapSentence(note);
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
  if (note.kind === "psm-gap") return `PSM note: ${psmGapSentence(note)}`;
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
    : `market note: the ${note.marketSymbol} market's primary rate was ${f.toRate} per year by block ${f.toBlock}, ${f.delta}${f.steps ? `, over ${f.steps} of this position's touches` : ""}`;
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

/** The folders a Maker note's stretch encloses on a grouped page — the events
 *  between its two ends that the page holds grouped, so the stretch is not
 *  cut at them. Empty on a flat page or a stretch with none. */
const groupedClause = (note: RateStepNote): string => {
  const g = note.grouped;
  if (!g) return "";
  return (
    ` The stretch spans ${g.events.toLocaleString("en-US")} of the vault's events the page holds grouped in ` +
    `${g.folders === 1 ? "one folder" : `${g.folders.toLocaleString("en-US")} folders`}; the fee's path across ` +
    `them is from the ilk's rate log.`
  );
};

export function marketNoteReceiptLine(note: MarketNote): string {
  if (note.kind === "psm-gap")
    return `${psmGapSentence(note)} (CDPUpdated at block ${formatBlock(note.to.block)}, _mintRedeemCollGain and _mintRedeemDebtGain)`;
  if (note.kind === "vault-terms")
    return (
      `- Receipt: the vault's own \`${note.termsKind}\` configuration log at block ` +
      `${formatBlock(note.to.block)}, tx ${note.to.txHash}, read by topic over the whole chain. Its words, raw: ` +
      `${Object.entries(note.fields)
        .map(([key, value]) => `${key} ${value}`)
        .join(", ")}. It is not this address's event — it moved every holder's terms at once — so it is counted in ` +
      `nothing on the page.`
    );
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
    return `- Receipt: rate before — ${namedMaker("from")}; rate after — ${namedMaker("to")}.${mergedStepsClause(note)}${groupedClause(note)}`;
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
      : `this position's ${polarisEndLabel(p)} at block ${p.block}, tx ${p.txHash} log ${p.logIndex}`;
  };
  return `- Receipt: rate before — ${named("from")}; rate after — ${named("to")}.${mergedStepsClause(note)}`;
}
