// One holder's life inside one ERC-4626 vault — the shape both chains serve.
// ----------------------------------------------------------------------------
// The vault page states a READING at one block: shares, claim, share price, the
// family's own mechanic. This is the other half — the events that got the
// address to that reading, each one a log the vault itself emitted about this
// address, with the running balance replayed from them.
//
// Cross-protocol, so it lives here rather than under a family's own folder
// (the repo's layout rule). Aave's three families on Ethereum are read by
// lib/sources/chain/aave-ethereum-vault-timeline.ts and MetaMorpho on Base by
// lib/sources/chain/morpho-base-vault-timeline.ts. The two share every field
// below: a family adds an arm to `extra` rather than a row type of its own.
//
// ── THE GATE COMES FIRST, AND NOTHING RENDERS WITHOUT IT ─────────────────────
// Every row here is a `Transfer` log, and the signed sum of a holder's own
// `Transfer` values IS `balanceOf(holder)` — so the reader can be checked
// against the contract before a single row is drawn. `reconcile` carries that
// check. When it fails the page states the two figures and draws NO timeline:
// not a partial one, not one with a caveat under it. The reason is measured
// rather than theoretical — a wide-range logs lane has been observed answering
// a whole-life query with HTTP 200 and an empty array where the true answer was
// 125,562 logs, four times in a row, and then erroring on the same query later.
// No status code, no timing and no count distinguishes that from a genuinely
// empty history. The signed sum against `balanceOf` is the only test whose
// subject is the thing about to be drawn.
//
// ── WHAT IS DELIBERATELY ABSENT ──────────────────────────────────────────────
// No USD. No APY, no annualised figure, no rate of return, no interest earned,
// no profit or loss — a P&L over a pooled fungible share would need a cost
// basis no chain read supplies. No difference between two rows' share prices:
// each row's price is a read at a block the HOLDER chose by transacting, and
// subtracting two of them, or joining them with a line, would be a curve drawn
// through blocks nobody chose. That is the sampled series rails-ops decision
// `0017` §6 refuses, and this shape gives a renderer no field to draw it from.
//
// Every amount is a raw integer in a decimal string, in the token's own units,
// scaled once at the render edge. A page that carries cents is blind to a
// wei-level break, which is what both existing vault verifiers say.

import { BASE_CHAIN_ID, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import type { TimelineCutSummary } from "@/lib/shared/timeline-boundary";

/** Where a receipt on this surface points. One shape for both chains, because
 *  the rows are one shape: each chain's own receipt builders take this and each
 *  page's row narrows `blockNumber` and `txHash` to the ROW's own, so a receipt
 *  inside a card names the moment that card is about rather than the page's. */
export interface VaultTimelineCoords {
  /** The block the figure was read at. On a row, that row's own block. */
  blockNumber?: number;
  /** The vault contract every receipt here names. */
  vault?: string;
  /** The vault's own name at that block, for prose. A reading, not an identity:
   *  a MetaMorpho V1.1 owner can rename a vault and dozens have. */
  vaultName?: string;
  /** The ERC-4626 underlying's symbol — the unit an asset figure speaks in. */
  assetSymbol?: string;
  /** The share token's own symbol — the unit a share figure speaks in. */
  shareSymbol?: string;
  /** The address the timeline is about. */
  holder?: string;
  /** The transaction a row's own log was emitted in. */
  txHash?: string;
}

/** One event in a holder's life inside one ERC-4626 vault. Every field is a
 *  chain read or a replay of chain reads; nothing here is modeled. */
export interface VaultHolderEvent {
  /** txHash + ":" + logIndex — the same id grammar as BaseActivityEvent. */
  id: string;
  txHash: string;
  blockNumber: number;
  /** Unix seconds, from eth_getBlockByNumber at blockNumber. */
  timestamp: number;
  logIndex: number;

  /** What the log was, decided by the zero address, never by a label.
   *
   *  The first four are the `Transfer` classification the plan fixes. Two more
   *  arms exist because the chain has two more cases and neither may be
   *  dropped:
   *
   *    `transfer-self` — from and to are BOTH this holder. A real action with a
   *      zero delta: calling it a transfer-in would say shares arrived, and
   *      dropping it would lose an action the address took.
   *    `cooldown` — an Umbrella `StakerCooldownUpdated` that stands alone in
   *      its own transaction. Starting a cooldown is something the holder did,
   *      so it earns a row; one that shares a transaction with a `Transfer`
   *      joins that row's `extra` instead of drawing beside it. */
  kind: "deposit" | "withdrawal" | "transfer-in" | "transfer-out" | "transfer-self" | "cooldown";
  /** The other party. Null for a mint or a burn (it is the zero address), and
   *  null on a cooldown row, which moves no shares. An address and nothing
   *  more — never a name, never an app. */
  counterparty: string | null;

  /** Signed, in the SHARE token's own raw units. Positive on the way in. Zero
   *  on a self-transfer and on a cooldown row. */
  sharesDelta: string;
  /** The replay position AFTER this log, raw share units. Defined as the sum
   *  of every one of this holder's `Transfer` deltas up to and including this
   *  one, ordered by (blockNumber, logIndex) — an INTRA-BLOCK position, which
   *  for the last log in a block equals `balanceOf` at the end of that block
   *  and for an earlier one does not. The gate compares only the FINAL position
   *  against `balanceOf`, which is always end-of-block, so the two definitions
   *  never collide. */
  balanceAfter: string;

  /** The asset leg as the CONTRACT stated it — the `assets` word of the
   *  ERC-4626 `Deposit`/`Withdraw` this holder's own leg was emitted with, in
   *  the same transaction and carrying the same share count. Null where none
   *  was emitted: a plain holder-to-holder transfer emits no such event, and a
   *  mint with no matching `Deposit` states its shares and says the asset leg
   *  was not emitted. NEVER computed from shares × share price and presented as
   *  the contract's figure. */
  assets: string | null;

  /** `convertToAssets(10 ** shareDecimals)` at THIS row's own block, raw asset
   *  units, with the exponent stated. Null when the archive call did not
   *  answer — an unread figure, never the head price and never a dash. */
  sharePriceAtBlock: string | null;
  shareDecimals: number;
  assetDecimals: number;

  /** Family-specific, discriminated on its own `kind`. */
  extra?: UmbrellaEventExtra | MetaMorphoEventExtra;
}

/** The action word on a row. A verb the chain decided, never a judgement.
 *
 *  It lives HERE, beside the shape it names, rather than in the row component
 *  that draws it: the row is `"use client"`, and an event share card is
 *  rendered on the server — a server module that imported this from a client
 *  module would get a client reference and throw on read. One table, readable
 *  from both graphs. */
export const KIND_LABEL: Record<VaultHolderEvent["kind"], string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  "transfer-in": "Received",
  "transfer-out": "Sent",
  "transfer-self": "No change",
  cooldown: "Cooldown started",
};

export interface UmbrellaEventExtra {
  kind: "umbrella";
  /** The `StakerCooldownUpdated` logs naming this holder in this same
   *  transaction — the contract's own words, not a state read. */
  cooldown: {
    /** Shares the snapshot covers, raw share units. */
    amount: string;
    /** Unix seconds. */
    endOfCooldown: number;
    /** Unix seconds of window after it. */
    unstakeWindow: number;
  }[];
}

/** MetaMorpho's own arm. What it carries is the ATTRIBUTION DENOMINATOR at the
 *  row's block, which is the figure the whole Base vault surface rests on: an
 *  address's exposure there is its share of the pool, so what its balance means
 *  depends entirely on how many shares existed alongside it at that moment.
 *
 *  It is stated per row rather than derived from the page's own supply because
 *  a MetaMorpho vault's supply moves for reasons that have nothing to do with
 *  this address — every other holder's deposits, and the performance-fee shares
 *  the vault mints to its fee recipient inside nearly every deposit and
 *  withdrawal. One denominator for a whole life would be the wrong number on
 *  every row but the last. */
export interface MetaMorphoEventExtra {
  kind: "metamorpho";
  /** `totalSupply()` at this row's own block, raw share units. Null where the
   *  archive call did not answer — an unread denominator, never a stand-in. */
  totalSupplyAtBlock: string | null;
  /** `balanceOf(holder)` at this row's own block, raw share units — the
   *  attribution numerator. It is an END-of-block figure where `balanceAfter`
   *  is a replay position INSIDE the block, so the two differ only where this
   *  address has two logs in one block; the receipt says which is which. Null
   *  unread. */
  holderSharesAtBlock: string | null;
  /** What the vault's asset sat in AT THIS ROW'S OWN BLOCK, and this address's
   *  proportional slice of each market. A photograph, not an interval: the
   *  queue was read at this block and at no other, and nothing here spans the
   *  gap to the next row. Null where this path did not read it at all — which
   *  the page states, because an unread allocation and an empty one are
   *  different facts. */
  allocation: VaultAllocationLeg[] | null;
  /** Σ of the legs' `vaultSupplied` at this block — the vault's whole allocated
   *  balance, of which this address's attributed figures are a slice. Null
   *  where no leg answered. */
  allocatedTotal: string | null;
}

/** One market in the vault's withdraw queue at one block, and this address's
 *  slice of it.
 *
 *  Every figure is raw and integer. `null` means UNREAD — the call did not
 *  answer — and never zero: a market in the queue holding nothing is a real
 *  reading of a real moment, and a read that failed is not a reading at all.
 *
 *  ATTRIBUTION IS PROPORTIONAL, NOT FUND TRACING. A holder's slice of a market
 *  is its shares over the vault's whole supply applied to what the vault
 *  supplied there. Two addresses holding equal shares hold equal slices,
 *  whatever they deposited or when — nothing on chain records whose asset went
 *  where, and a timeline makes that reading more tempting rather than less. */
export interface VaultAllocationLeg {
  /** 0x market id — the withdraw-queue entry, and a key into Morpho Blue. The
   *  empty string where the queue slot itself did not answer. */
  marketId: string;
  /** Position in the withdraw queue at this block, 0-based — the vault's own
   *  ordering, which is not the ordering it has today. */
  queueIndex: number;
  collateralToken: string | null;
  /** Null where the house resolver did not name the token, and on the idle
   *  market, which has no collateral side to name. */
  collateralSymbol: string | null;
  collateralNamed: boolean;
  /** Liquidation LTV in the WAD Morpho stores it as. Null unread. */
  lltv: string | null;
  /** No collateral token and no oracle — where a vault holds cash inside Blue
   *  rather than outside it. Labelled as idle, never as a collateral. */
  isIdle: boolean;

  /** `position(id, vault).supplyShares` — the first receipt operand. */
  supplyShares: string | null;
  /** `market(id).totalSupplyAssets` and `.totalSupplyShares` — the other two. */
  marketTotalSupplyAssets: string | null;
  marketTotalSupplyShares: string | null;

  /** supplyShares × totalSupplyAssets ÷ totalSupplyShares, floor, in the loan
   *  token's own units — the same arithmetic the vault's reading at the page's
   *  block runs, so the two cannot disagree at the same block. */
  vaultSupplied: string | null;
  /** holderShares × vaultSupplied ÷ totalSupply, floor. */
  attributed: string | null;
}

/** Something that happened to EVERY holder at once, so it is not this address's
 *  event. Drawn as a note beside the rows, never counted among them and never
 *  a row: the dividing line is that a row is something this holder did.
 *
 *  Two arms, one per family, because each reads its own contract's own
 *  configuration events and neither can meet the other's. A single `kind` union
 *  would leave every renderer with three cases it can never reach, which is the
 *  dead code the repo's own gate is there to find. */
interface VaultNoteFields {
  blockNumber: number;
  timestamp: number;
  txHash: string;
  /** The event's own non-indexed words, raw, in the order the contract
   *  declares them. */
  fields: Record<string, string>;
}

/** Aave's own: sGHO's target rate, and the Umbrella cooldown terms. */
export interface AaveVaultNote extends VaultNoteFields {
  kind: "target-rate" | "cooldown-config" | "unstake-window-config";
}

/** MetaMorpho's own: the performance fee, and the two events that make a V1.1
 *  vault's NAME a reading at a block rather than an identity. */
export interface MorphoVaultNote extends VaultNoteFields {
  kind: "fee" | "vault-name" | "vault-symbol";
}

export type VaultNote = AaveVaultNote | MorphoVaultNote;

/** The completeness gate of the plan's §2, carried onto the page so the reader
 *  sees the check rather than being asked to trust it. */
export interface VaultHolderReconcile {
  reconciled: boolean;
  /** Σ of this holder's own `Transfer` deltas, raw share units. */
  replayed: string;
  /** `balanceOf(holder)` at `blockNumber`, raw share units. */
  onChain: string;
  logsIn: number;
  logsOut: number;
  /** A second attempt was made — only ever one, and only on a mismatch. */
  refetched: boolean;
  /** …and it returned a different log count from the first. That fact is
   *  worth more to a reader than a third attempt would be. */
  refetchDiffered: boolean;
  /** The env var NAME of the lane the sweeps ran on. Never the URL: it
   *  carries a key. */
  lane: string;
  fromBlock: number;
  toBlock: number;
  /** THE OTHER HALF OF THE REPLAY, when the rows at or below a finalized cut
   *  came out of the store rather than off the lane (`VaultHistorySource`).
   *  It is the stored Σ of every delta at or below that cut; `replayed` is
   *  that figure plus the deltas swept from the cut to `toBlock` now. Absent
   *  (or null) where the whole life was swept in this request — then
   *  `replayed` is one sum of one sweep and there is no second part to name.
   *
   *  The receipt prints both, because a reader checking a stored page has to
   *  be able to see WHICH of the two halves the store supplied. */
  cutBalance?: string | null;
}

/** The loader version a stored tail is keyed by. It BUMPS whenever the row
 *  grammar (`VaultHolderEvent`) changes in a way that would make an older
 *  stored row render differently — an old version's tails are then simply not
 *  read, and the first request after the bump re-sweeps and stores afresh.
 *  Never a date and never a hash: a reader has to be able to say "this row was
 *  written by the loader that is running now" from one integer.
 *
 *  It bumps too when a loader fix changes what an older stored row SAYS.
 *  2: a stand-alone cooldown row's `balanceAfter` is the last transfer's; a
 *  version-1 row could carry the previous cooldown's.
 *  3: version-2 tails built on a rate-limited lane before `c32a489b` hold rows
 *  whose share price did not answer (845 rows in three lives), and a stored
 *  row is never read again. */
export const AAVE_VAULT_TAIL_VERSION = 3;

/** The same integer for the MetaMorpho reader on Base, kept apart because the
 *  two loaders write different rows: a Base row carries a `metamorpho` `extra`
 *  and an Aave row an `umbrella` one, and the version is about a row GRAMMAR
 *  rather than about a store. The store's key carries the chain id too, so the
 *  two could never collide — this exists so that bumping one loader's grammar
 *  does not silently discard the other's tails.
 *
 *  2: version-1 tails built before the Base loader cut a chunk at an unpriced
 *  block hold rows whose share price did not answer (1,608 rows in three lives
 *  on 2026-09-21), and a stored row is never read again. */
export const MORPHO_BASE_VAULT_TAIL_VERSION = 2;

/** A stored history TAIL — every row of one holder's life in one vault at or
 *  below a FINALIZED block, kept because a reading at a named block never
 *  changes.
 *
 *  It is a VALUE, not a cache: its key is `(chainId, vault, holder,
 *  loaderVersion)` and its content is fixed by `cut`. A later store with a
 *  HIGHER cut replaces it; one with a lower cut is refused by the store. The
 *  store re-sums `rows[].sharesDelta` on the way in and refuses a body whose
 *  sum is not `cutBalance` — a stored value that does not add up is not
 *  stored.
 *
 *  What it may never hold: anything derived (a claim, a share of the vault, a
 *  rate), anything in USD, anything at the head. Rows and a signed sum, both
 *  read at blocks the store names. */
export interface StoredVaultTail {
  chainId: number;
  /** Lowercased. */
  vault: string;
  /** Lowercased. */
  holder: string;
  loaderVersion: number;
  /** The lane's own `finalized` block at the time the tail was written — a
   *  chain answer read in that request, never a constant and never
   *  `latest − k`. Every row is at or below it. */
  cut: number;
  /** Σ of `rows[].sharesDelta`, raw share units. The store re-computes it. */
  cutBalance: string;
  /** The whole-life `eth_getLogs` counts AT OR BELOW the cut, kept apart so a
   *  merged reconcile can still state the two sweep counts for the whole life
   *  rather than for its head alone. */
  logsIn: number;
  logsOut: number;
  /** The env var NAME of the lane the stored rows were read on. */
  lane: string;
  /** ISO-8601, written by the store. */
  storedAt: string;
  /** ASCENDING by (blockNumber, logIndex); every `blockNumber <= cut`. */
  rows: VaultHolderEvent[];
}

/** Where the rows on a page came from — stated so a reader can tell a reading
 *  made now from one read at a named block and kept. */
export interface VaultHistorySource {
  /** `"chain"` — the whole life was swept in this request. `"stored+head"` —
   *  the rows at or below `cut` came from the store and the rest were swept
   *  now. The gate runs on the two together either way. */
  source: "chain" | "stored+head";
  /** The stored tail's cut, when there was one. Null on the chain path. */
  cut: number | null;
  tailRows: number;
  headRows: number;
  /** True when this request's own gate passed and the page queued a store. */
  storedThisRequest: boolean;
  /** Set while a life is being BUILT INTO THE STORE ACROSS REQUESTS, and only
   *  then. A life above `VAULT_TIMELINE_HORIZON` costs one archive
   *  `convertToAssets` and one `eth_getBlockByNumber` per distinct row block,
   *  which is fifteen seconds and more of waiting for a reader who asked for a
   *  page. So the rows are built a chunk at a time, oldest first, and each
   *  chunk is stored: this request kept `keptRows` rows at or below `keptCut`,
   *  out of `totalRows` in the whole life. No rows are drawn while it is set —
   *  a prefix of a life is not a life, and the gate sums every row — and the
   *  next visit continues from the stored cut.
   *
   *  Absent on every other path, so a reader of this object can tell "nothing
   *  is being built" from "a build is at block X". */
  building?: { keptRows: number; keptCut: number; totalRows: number };
}

export interface VaultHolderTimeline {
  vault: string;
  holder: string;
  /** THE block. Every read in this object was pinned to it: the two sweeps end
   *  here, `balanceOf` is called here, and each row's share price is called at
   *  that row's own block. */
  blockNumber: number;
  blockTimestamp: number;

  /** Set when a read on this path did not answer at all. Nothing else in this
   *  object may be rendered as a fact; the page states this instead. A lane
   *  that refused and a history that is empty must never render the same. */
  unread: string | null;

  reconcile: VaultHolderReconcile | null;

  /** Where the rows came from — the store plus a swept head, or a whole-life
   *  sweep made now. Optional because only the chains that keep a tail set it:
   *  MetaMorpho on Base sweeps every request and has none to state. A tail can
   *  make a page SLOW, never wrong — the gate below runs on the merged rows
   *  every time, and a tail that fails it is discarded and the life re-swept. */
  history?: VaultHistorySource;

  /** DESCENDING by (blockNumber, logIndex) — newest first, the order every
   *  other Rails timeline renders in and the order the page draws these in, so
   *  this array and the rows on screen are one claim rather than two. The
   *  replay behind `balanceAfter` runs ascending, because a running balance can
   *  only be accumulated in the order the chain wrote the logs; the reversal is
   *  the last thing that happens to it. EMPTY whenever the gate failed or the
   *  life is past the horizon — in both cases the page states why. */
  events: VaultHolderEvent[];
  /** Vault-wide facts that moved every holder's claim without an event of this
   *  holder's own. */
  notes: VaultNote[];

  coverage: {
    /** True when the sweeps ran from a block at or before the vault's first —
     *  the chain's own block 0 on Ethereum, the vault's creation block on Base
     *  — so nothing before them was cut off. */
    fromDeployment: boolean;
    /** The count the sweeps returned, whether or not the rows were drawn. */
    logCount: number;
    /** Set when the life was too large to draw whole: the rows are withheld
     *  and this is how many there are. */
    withheldAbove: number | null;
    /** True when the count above is a LOWER BOUND rather than the whole answer.
     *  It happens on one path only: a lane that refused the whole-range sweep
     *  on response size, so the count came from a chunked walk that stopped the
     *  moment it passed the horizon. The rows are withheld either way, but the
     *  page must not print a floor as if it were a census — "at least N" and
     *  "N" are different claims and only one of them is true here. */
    logCountIsLowerBound: boolean;
    /** THE RENDER WINDOW, when the life is longer than the client is handed.
     *  `rows` of `of` were serialised into `events`, newest first; the rest of
     *  the life stayed on the server. ABSENT when the whole life was handed
     *  over, which is what makes its presence a statement rather than a
     *  default.
     *
     *  It is a WINDOW OVER A WHOLE, GATED FETCH and never a partial one: every
     *  row of the life was read and replayed, `reconcile` sums all of them
     *  against `balanceOf`, and the lifetime-flows tower is reduced over all of
     *  them on the server before this slice is taken. What is capped is the
     *  bytes that cross to the browser — the same thing the timeline's own
     *  100-row render window caps, one layer further out. */
    drawn?: {
      rows: number;
      of: number;
      /** The oldest drawn row's block — where the drawn list starts. */
      cutBlock: number;
      /** The boundary card's facts (rails-ops decision 0019): the holder's
       *  share balance before the oldest drawn row, the rows left on the
       *  server by kind, and the first/cut dates. See `vaultDrawWindow`. */
      summary?: TimelineCutSummary;
    };
  };
}

/** Cut a whole, gated, DESCENDING life to the draw window, and state the cut.
 *  A life at or under `VAULT_TIMELINE_DRAW_ROWS` is handed over whole and
 *  `drawn` is undefined. The share balance before the oldest drawn row is the
 *  row below it's `balanceAfter` — the same figure that row's own before-arrow
 *  states — scaled by the row's own `shareDecimals`; the unit is the page's
 *  to add (the loader does not hold the share symbol). */
export function vaultDrawWindow<E extends VaultHolderEvent>(
  allEvents: E[],
): { events: E[]; drawn?: NonNullable<VaultHolderTimeline["coverage"]["drawn"]> } {
  if (allEvents.length <= VAULT_TIMELINE_DRAW_ROWS) return { events: allEvents };
  const events = allEvents.slice(0, VAULT_TIMELINE_DRAW_ROWS);
  const oldestDrawn = events[events.length - 1];
  const below = allEvents[VAULT_TIMELINE_DRAW_ROWS];
  const omitted = allEvents.slice(VAULT_TIMELINE_DRAW_ROWS);
  const byKind = new Map<string, number>();
  for (const e of omitted) byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1);
  const shares = scaleShares(below.balanceAfter, below.shareDecimals);
  return {
    events,
    drawn: {
      rows: events.length,
      of: allEvents.length,
      cutBlock: oldestDrawn.blockNumber,
      summary: {
        stateAtCut: shares != null && shares !== 0 ? [{ label: "Shares", value: String(shares) }] : null,
        byType: [...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count })),
        byAsset: null,
        firstAt: allEvents[allEvents.length - 1].timestamp,
        lastAt: below.timestamp,
      },
    },
  };
}

/** Raw share units → display units, whole and fraction split through BigInt
 *  first so a 30-digit balance keeps its low digits. Null on a malformed raw. */
function scaleShares(raw: string, decimals: number): number | null {
  let v: bigint;
  try {
    v = BigInt(raw);
  } catch {
    return null;
  }
  if (decimals <= 0) return Number(v);
  const d = BigInt("1" + "0".repeat(decimals));
  return Number(v / d) + Number(v % d) / Number(d);
}

// ── THE THREE TIERS A HOLDER'S LIFE FALLS INTO ───────────────────────────────
// Decided AFTER the sweeps and AFTER the gate, both of which run on every life
// whatever its size. The sweeps are not the cost — an address-filtered
// whole-range `eth_getLogs` answers a 17,774-log life in seconds. The cost is
// building the ROWS: one `eth_getBlockByNumber` and one archive
// `convertToAssets` per DISTINCT row block, measured 2026-09-09 at 1.6 ms a
// block on chain 1 and 1.3 ms on Base, which is fifteen seconds for a
// nine-thousand-block life and no reader waits that long for a page.
//
//   Tier 0  at or below `VAULT_TIMELINE_HORIZON` — built inline and drawn, as
//           this loader has always done. What crosses to the browser is the
//           newest `VAULT_TIMELINE_DRAW_ROWS` of it (the one cut every
//           timeline shares), whichever tier built it.
//   Tier 1  above it and at or below `tailMaxRows(chainId)` — BUILT INTO THE
//           STORE A CHUNK AT A TIME, ACROSS REQUESTS, and drawn once the whole
//           life is stored. The store already keeps rows at or below a
//           finalized cut and already accepts any advancing cut, so a partial
//           tail is a legitimate whole-up-to-its-cut and nothing on the store
//           side changes.
//   Tier 2  above `tailMaxRows(chainId)`, or a count that is only a lower bound
//           because the lane refused the sweep — withheld, with the count
//           stated. It is above what Rails STORES, which is a different claim
//           from being above what a page can draw.

/** TIER 0'S BOUND — how long a life this loader reads, builds and gates in ONE
 *  request. Chosen from measurement, not taste: both chain-1 lanes still answer
 *  a 7,708-log holder in one to two seconds, and the state lane refuses
 *  outright at 63,154. Above it the rows are still read, replayed and gated
 *  whole — what changes is that they are built over several requests (tier 1)
 *  or withheld (tier 2). It also bounds the sweep walk's exact count
 *  (lib/sources/chain/vault-sweep-walk.ts): a count past it is a floor.
 *
 *  It is NOT the draw window. Until 2026-09-10 one figure did both jobs, so
 *  that a life at or under the bound was handed over whole by construction;
 *  the draw window is now the one cut every timeline shares
 *  (`VAULT_TIMELINE_DRAW_ROWS`), and a life between the two is built inline
 *  and drawn as its newest thousand rows with the boundary card after them. */
export const VAULT_TIMELINE_HORIZON = 5000;

/** THE DRAW WINDOW — how many rows of a life cross to the browser, newest
 *  first, with `coverage.drawn` stating the two figures (rails-ops decision
 *  0019, amended 2026-09-10: one cut of 1,000 on every arm). Only what is
 *  SERIALISED: the gate and the lifetime-flows tower are reduced over every
 *  row on the server before the slice is taken, and the store is offered
 *  every row. MEASURED 2026-09-09: a rendered position page costs 587.5 bytes
 *  of RSC payload per row, so 1,000 rows is ≈ 0.6 MB where 5,000 was ≈ 3.2. */
export const VAULT_TIMELINE_DRAW_ROWS = TIMELINE_WINDOW_EVENTS;

/** TIER 1'S CEILING, PER CHAIN — the largest life Rails will build into a
 *  stored tail on that chain.
 *
 *  It is a BODY SIZE, not a taste: the store's own route accepts an 8 MB JSON
 *  body (`express.json({ limit: "8mb" })` on `/api/vaults/positions`, in
 *  rails-server-onboarding `api/src/index.ts:137`), and each figure is
 *  floor(6 MB / a measured row) rounded down to a thousand. 6 MB rather than 8
 *  leaves two megabytes of headroom for a row grammar that grows and for the
 *  body's own envelope.
 *
 *  ONE FIGURE PER CHAIN, because the two loaders write different rows. A single
 *  constant had to take the heavier of the two for both, which lent Ethereum a
 *  bound set by a Base row it never writes.
 *
 *  RE-MEASURED 2026-09-09 against the largest tail each chain had actually
 *  stored, read back through this deployment's own
 *  `/api/vaults/positions/tail` proxy. The stored body and the body the loader
 *  PUTs are the same eleven fields in the same grammar (`WireTail`, in
 *  lib/api/fetch-vault-tail.ts), so what was measured is what would be offered:
 *
 *    chain 1   437.9 bytes a row — waEthUSDC `0xd4fa…d23e` held by
 *              `0x6bf1…8aa6`: 9,021 rows, 3,949,878 bytes.
 *              floor(6 MB / 437.9) = 14,368, so 14,000.
 *    Base      548.9 bytes a row — the case-study MetaMorpho vault
 *              `0xbeef…83b2` held by `0x25c1…9c52`: 8,692 rows, 4,770,716
 *              bytes. floor(6 MB / 548.9) = 11,462, so 11,000. A MetaMorpho row
 *              carries a `metamorpho` `extra` an Aave row does not, and it is
 *              ~110 bytes even with the allocation band unread — the whole of
 *              the difference between the two chains.
 *
 *  BASE DID NOT MOVE. Its row measured 552.7 bytes on the first pass and 548.9
 *  now, and the two round to the same 11,000. What changed is chain 1, which
 *  rises from the 11,000 it was lent to the 14,000 its own row earns.
 *
 *  Bytes a row vary a little with what a life is made of — chain-1 tails
 *  between 3,942 and 9,021 rows measured 437.9 to 465.9 on the same day, a
 *  counterparty address on a plain transfer against a null on a mint. The
 *  headroom is what absorbs that: 14,000 rows at the heaviest of those is still
 *  6.5 MB, inside the 8 MB the store accepts.
 *
 *  A chain with no measurement of its own takes the SMALLEST figure here rather
 *  than a default: an unmeasured row is not known to be lighter than the
 *  heaviest one that has been measured. */
const TAIL_MAX_ROWS_BY_CHAIN: Readonly<Record<number, number>> = {
  [MAINNET_CHAIN_ID]: 14_000,
  [BASE_CHAIN_ID]: 11_000,
};

/** The unmeasured chain's share of the above, taken once. */
const TAIL_MAX_ROWS_FLOOR = Math.min(...Object.values(TAIL_MAX_ROWS_BY_CHAIN));

/** Tier 1's ceiling for one chain. See `TAIL_MAX_ROWS_BY_CHAIN` for where each
 *  figure comes from and when it was measured. */
export function tailMaxRows(chainId: number): number {
  return TAIL_MAX_ROWS_BY_CHAIN[chainId] ?? TAIL_MAX_ROWS_FLOOR;
}

/** How many UNBUILT distinct blocks a request will build inline, rows drawn at
 *  the end of it.
 *
 *  F5 — 3,952 rows over 3,935 distinct blocks — is what a page already spends
 *  inline today and answers in a few seconds, so that is the line. A head
 *  smaller than this is built and drawn; a larger one is built a chunk at a
 *  time instead. */
export const BUILD_BLOCKS_INLINE = 4000;

/** How many distinct blocks one chunk of a chunked build covers.
 *
 *  MEASURED 2026-09-09 on the batched state lane both loaders use
 *  (`chainBatchClient`, batchSize 60), timestamp + archive share price per
 *  block: 1,500 blocks took 2,403 ms on chain 1 and 1,932 ms on Base. A
 *  2,000-block chunk took 3,424 ms on chain 1 but 4,575 ms on Base, past the
 *  four seconds a chunk is allowed, so the smaller figure is the shared one. */
export const BUILD_CHUNK_BLOCKS = 1500;

/** How long the continuation queued in `after()` may keep building.
 *
 *  Wall clock, checked between chunks — never mid-chunk, because a chunk that
 *  is abandoned half-read is a chunk whose rows were paid for and thrown away.
 *  `after()` runs inside the function's own `maxDuration`, which this
 *  deployment does not override (`vercel.json` carries only `regions`), so the
 *  ceiling is Vercel's 60 s default and this stays well under it. At the
 *  measured chunk cost that is eight or nine chunks — 12,000 blocks and more —
 *  so the 8,292-block life this was built for finishes in one visit or two. */
export const BUILD_WALL_MS = 25_000;
