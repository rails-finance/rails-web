// One holder's life inside one Aave vault on Ethereum. SERVER-ONLY.
// ----------------------------------------------------------------------------
// The sibling of aave-ethereum-vault.ts. That file reads the vault and the
// holder's standing AT one block; this one reads how the address got there —
// every `Transfer` the vault emitted about it, from the chain's own first block
// to the block the page states, replayed into a running balance and checked
// against `balanceOf` before anything is drawn.
//
// ── THE READS, AND WHY EACH LANE ─────────────────────────────────────────────
//
//   the sweeps        `chainLogsClient(1)` — four `eth_getLogs`, each address-
//                     and topic-filtered, each over the whole chain in ONE
//                     call. On chain 1 that client resolves `ALCHEMY_URL` (the
//                     chain's `logsRpcEnv` and `rpcEnv` name the same var), and
//                     an address-filtered whole-range sweep answers there in
//                     170–450 ms on every fixture measured. No chunking on the
//                     ordinary path: a filter this narrow keeps the response
//                     small, and the limit on this lane is response size rather
//                     than range. The handful of addresses that pass that limit
//                     are the section below.
//
//   everything else   `chainBatchClient(1)` — `balanceOf` at the page's block,
//                     and one JSON-RPC batch carrying an `eth_getBlockByNumber`
//                     and an archive `convertToAssets` per DISTINCT row block.
//                     Both chain-1 lanes are archive nodes 3.25M blocks deep,
//                     35–68 ms per call, agreeing wei-exact.
//
// Nothing here passes `"latest"`. The block arrives as a parameter, pinned once
// per request by the vault loader that already read it, so the page's figures
// and this timeline cannot state two blocks. Two claims wearing one block
// number is the error the vault page already refuses to make by not caching.
//
// ── THE SPINE IS `Transfer`, NOT `Deposit`/`Withdraw` ────────────────────────
// Three reasons. A mint (`from == 0x0`) and a burn (`to == 0x0`) already
// identify a deposit and a withdrawal, so `Transfer` alone covers every share
// movement INCLUDING plain holder-to-holder transfers, which `Deposit` and
// `Withdraw` do not emit at all — the sGHO Safe fixture measured here is 33
// events of which 28 are exactly that. `Transfer` is the only event whose
// signed sum IS `balanceOf`, so it is the only one the gate can be built on.
// And `lib/vaults/resolve-tx-holder.ts` already reads this event and this
// shape for the transaction lane.
//
// `Deposit`/`Withdraw` are then a JOIN, fetched in two more sweeps of the same
// cost class, so a row's asset leg is the contract's own `assets` word rather
// than shares × share price. Measured on all five fixtures: every mint had a
// `Deposit` and every burn a `Withdraw` in its own transaction, no transaction
// carried two legs for one owner, and the events' `shares` word equalled the
// `Transfer` value on all 83 of them. The join still matches on the share count
// as well as the transaction, so a transaction that ever does carry two legs
// pairs them rather than taking the first.
//
// ── WHAT IS NOT READ, ON PURPOSE ─────────────────────────────────────────────
// `ExchangeRateUpdated` (sGHO) fires 4,600 times and `AccrueInterest` far more:
// they are the mechanic behind each row's share price, named in that figure's
// receipt, and 4,600 rows is not a holder's life. `Slashed` and
// `StakeTokenSlashed` read ZERO over the whole life of all four stake tokens,
// so a slash row is a row type with no instance and this loader does not spend
// a call per page looking for one; `verify-ethereum-vault-timeline.mjs` check 6
// makes its own sweep and FAILS the day the first one lands, which is the alarm
// that the row now needs to exist and be checked against a real instance.
//
// NO USD, NO RATE OF RETURN, NO SERIES. Each row's share price is a read at a
// block the HOLDER chose by transacting. No field here holds a difference
// between two of them, because a renderer with such a field would draw the
// curve through blocks nobody chose that decision `0017` §6 refuses.
//
// ── WHEN THE LANE REFUSES A SWEEP ON RESPONSE SIZE ───────────────────────────
// This lane refuses a one-direction `eth_getLogs` past 10,000 logs. A few
// addresses on this layer pass that — 0xba13…9ba9 holds 63,180 of its own
// transfers on waEthUSDC and 59,489 on waEthUSDT, measured 2026-09-09 — and a
// refusal there is not an unread history: it is evidence the history is LARGE.
// So each sweep catches to null, and a refused TRANSFER direction falls back to
// the chunked counting walk in ./vault-sweep-walk.ts, shared with the Base
// loader. The walk halves a refused chunk rather than skipping it, stops the
// moment the count passes the horizon this page draws, and hands back a LOWER
// BOUND marked as one. The rows are withheld, nothing is stored — storing a
// floor would turn "at least N" into "N" — and no gate ran, because there are
// no logs to replay.
//
// A `Deposit`, `Withdraw` or cooldown sweep that refuses WHILE THE TRANSFERS
// ANSWERED is a different thing and is stated as unread. Every `Deposit` mints
// shares and every `Withdraw` burns them, so each has its own `Transfer` in one
// of the two directions that came back: those sweeps are bounded by sweeps this
// lane just answered, and a refusal over a strictly smaller answer is a lane
// fault rather than a size fact. `StakerCooldownUpdated` is not bounded that
// way — a holder can start a cooldown without moving a share — but it is not
// the spine either, and a floor counted over the transfers alone while a row
// type was missing would be a life stated as read with a kind of row silently
// absent from it. Neither is worth a number, so neither gets one.
//
// ── THE STORED TAIL, AND WHY IT CANNOT MAKE A PAGE WRONG ─────────────────────
// A row at or below the lane's own `finalized` block never changes, so it may
// be kept; anything above it may not. This loader takes an optional
// `StoredVaultTail` — every row of this life at or below a cut, with the signed
// sum of their deltas — sweeps only from `cut + 1` to the page's block, and
// replays `cutBalance + Σ head deltas`.
//
// THE GATE THEN RUNS ON THE MERGED ROWS, UNCHANGED. It is the same wei-exact
// comparison against `balanceOf` at the page's block that the whole-life path
// makes, and it is made every request — a stored tail buys a sweep, never a
// pass. On a mismatch the head is re-fetched once (re-reading the tail would
// change nothing: it is a value); still mismatched, THE TAIL IS DISTRUSTED and
// the whole life is swept from block 0 exactly as it is today. So the worst a
// wrong or stale tail can do is make one page slow.
//
// THE CUT IS A CHAIN ANSWER. `eth_getBlockByNumber("finalized")` on the state
// lane, read in this request — never `latest − 64`, never a constant. The tag
// means different things on different chains (rails-ops head-tail §3), and the
// only place it is defined is the node's own answer.
//
// ── A HEAVY LIFE IS BUILT ACROSS REQUESTS, NOT REFUSED ───────────────────────
// The sweeps and the gate above run on every life whatever its size, and they
// are not what a large one costs: an address-filtered whole-range `eth_getLogs`
// answers a 17,774-log holder in seconds. `buildRows` is the cost — one
// `eth_getBlockByNumber` and one archive `convertToAssets` per DISTINCT row
// block, 1.6 ms a block measured on this lane, so nine thousand blocks is
// fifteen seconds of a reader waiting for a page.
//
// So above `VAULT_TIMELINE_HORIZON` the test is no longer "how long is this
// life" but "how much of it is still UNBUILT". A head of at most
// `BUILD_BLOCKS_INLINE` distinct blocks is built here and drawn, which is what
// a page already spends. A larger one has its OLDEST `BUILD_CHUNK_BLOCKS`
// blocks built inline and stored, and the continuation the caller queues in
// `after()` carries on chunk by chunk until the head is built or
// `BUILD_WALL_MS` is spent. Each chunk is a PUT at a cut that advanced, which
// the store already accepts — a partial tail is a whole up to its own cut, and
// the store re-sums it on the way in exactly as it re-sums a complete one. The
// page draws no rows while that is happening and says so; the next visit
// continues from the stored cut, and once the head is small the ordinary
// stored+head path draws the life.
//
// Above `tailMaxRows(chainId)` the rows are withheld as they always were. That
// bound is the store's 8 MB body limit divided by a measured row of THIS
// chain's own grammar, so what the page states is that the life is larger than
// Rails STORES — a different claim from being larger than a page can draw.
//
// THE WINDOW IS THE LAST THING THAT HAPPENS. The store is offered ALL the rows
// and the caller is handed the newest `VAULT_TIMELINE_DRAW_ROWS` of them, with
// `coverage.drawn` stating the two figures. Everything that reduces over a life
// — the gate, and the lifetime-flows tower the page computes — reads the whole
// array on the server before the slice is taken, so no aggregate on the page is
// a window's arithmetic.

import { decodeAbiParameters, parseAbi, parseAbiItem, toEventSelector, type PublicClient } from "viem";
import { chainBatchClient, chainLogsClient, isRateLimited } from "./rpc";
import {
  ERC4626_TOPIC,
  ZERO_ADDRESS as ZERO_ADDR,
  addressOfTopic as addrOf,
  assetLegClaimer,
  classifyTransfer,
  counterpartyOf,
  hexBlock as hex,
  mergeTransfers,
  replayTransfers as replay,
  topicOfAddress as topicOf,
  type LogSweep,
  type RawLog,
} from "./vault-holder-logs";
import { countRefusedSweeps } from "./vault-sweep-walk";
import { emptyBlockReads, firstUnreadBlock, readBlockWave, type BlockReads } from "./vault-block-reads";
import { MAINNET_CHAIN_ID, chainMeta } from "@/lib/shared/chains";
import type { AaveVaultFamily } from "@/lib/aave-vaults/vault-catalog";
import {
  AAVE_VAULT_TAIL_VERSION,
  BUILD_BLOCKS_INLINE,
  BUILD_CHUNK_BLOCKS,
  BUILD_WALL_MS,
  VAULT_TIMELINE_HORIZON,
  vaultDrawWindow,
  tailMaxRows,
  type StoredVaultTail,
  type UmbrellaEventExtra,
  type VaultHistorySource,
  type VaultHolderEvent,
  type VaultHolderTimeline,
  type VaultNote,
} from "@/lib/shared/vault-holder-timeline";

const ZERO = BigInt(0);

// The family's own topic0s, COMPUTED from their fragments — the three ERC-4626
// ones every vault shares are in ./vault-holder-logs. A pasted literal is a
// claim nobody can check against the ABI it came from, and this file makes none.
const COOLDOWN_EVENT = parseAbiItem(
  "event StakerCooldownUpdated(address indexed user, uint256 amount, uint256 endOfCooldown, uint256 unstakeWindow)",
);
const TARGET_RATE_EVENT = parseAbiItem("event TargetRateUpdated(uint256 newRate)");
const COOLDOWN_CHANGED_EVENT = parseAbiItem("event CooldownChanged(uint256 oldCooldown, uint256 newCooldown)");
const UNSTAKE_WINDOW_EVENT = parseAbiItem(
  "event UnstakeWindowChanged(uint256 oldUnstakeWindow, uint256 newUnstakeWindow)",
);

const TOPIC = {
  ...ERC4626_TOPIC,
  cooldown: toEventSelector(COOLDOWN_EVENT),
  targetRate: toEventSelector(TARGET_RATE_EVENT),
  cooldownChanged: toEventSelector(COOLDOWN_CHANGED_EVENT),
  unstakeWindow: toEventSelector(UNSTAKE_WINDOW_EVENT),
} as const;

const VAULT_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
]);

export interface VaultTimelineOptions {
  /** THE block, pinned by the vault loader that already read it. */
  blockNumber: number;
  family: AaveVaultFamily;
  /** The share token's own `decimals()`, read at the same block. The exponent
   *  every row's share price is asked with — Aave's share tokens are 6-, 8- and
   *  18-decimal, and a fixed 10^18 overstates a 6-decimal price by 1e12. */
  shareDecimals: number;
  assetDecimals: number;
  /** A stored tail for this exact `(chain, vault, holder, loaderVersion)`, or
   *  null. One whose key does not match, or whose cut is above the page's own
   *  block, is IGNORED rather than patched: a value is used whole or not at
   *  all. */
  tail?: StoredVaultTail | null;
  /** False refuses BOTH halves of the store on this request — no tail is read
   *  and none is offered back, so the whole life is swept here and now. The
   *  verifier's cold path, and the only way to ask this loader for a reading
   *  that owes the store nothing. */
  useTail?: boolean;
}

/** What one request produced: the timeline the page draws, and — separately —
 *  the tail it offers to the store. The two are kept apart because the store
 *  write must not be inside the response: the caller queues it with `after()`
 *  and the reader never waits for it. */
export interface VaultTimelineResult {
  timeline: VaultHolderTimeline;
  /** Null when §2.5's rule did not fire (nothing to store, a failed gate, a
   *  withheld life, or a tail that is still fresh). */
  store: StoredVaultTail | null;
  /** EVERY row of the life, newest first — of which `timeline.events` is the
   *  newest `VAULT_TIMELINE_DRAW_ROWS`. The same array (by value) whenever the life fits, so a
   *  caller that always reads this one is always reading the whole life.
   *
   *  It exists so that what reduces over a life reduces over the life: the
   *  lifetime-flows tower is computed from this on the server and handed to the
   *  client as figures, rather than the client being handed rows it would then
   *  sum. Empty on every path that draws nothing. */
  allEvents: VaultHolderEvent[];
  /** Set only while a Tier 1 life is being built into the store a chunk at a
   *  time. The caller queues it in `after()` AFTER the first PUT has been
   *  accepted — or with no PUT before it, when this request's first chunk
   *  stalled and stored nothing — handing it the same store client: it builds
   *  the next chunk from logs already in hand — the sweeps are never repeated — PUTs it at a cut
   *  that advanced, and repeats until the head is built or `BUILD_WALL_MS` is
   *  spent. A failure is a log line: the next visit continues from whatever cut
   *  the store holds. */
  continueBuild: ((put: (tail: StoredVaultTail) => Promise<{ ok: boolean }>) => Promise<void>) | null;
}

/** A tail older than this many blocks below `finalized` is refreshed after the
 *  request that used it — ≈ 7 days on mainnet. Not a correctness figure: the
 *  gate runs either way, and this only decides how much head a later request
 *  has to sweep. */
export const TAIL_REFRESH_BLOCKS = 50_000;
/** …and so is a head that came back with more rows than this. */
export const TAIL_REFRESH_ROWS = 200;

/** How long a chunked build waits before asking again for a block that would
 *  not answer. The lane's client has already backed off for about seven
 *  seconds on that call (./rpc.ts), so this is the pause between two such
 *  rounds, spent inside `BUILD_WALL_MS`. */
const STALL_WAIT_MS = 3000;

/** Is this stored value about the position being read, and does it end at or
 *  before the block the page states? A tail cut ABOVE the page's block would
 *  carry rows the page has not reached, so it is refused rather than trimmed:
 *  a trimmed tail's `cutBalance` would no longer be the sum of its rows, which
 *  is the one thing the store guarantees about it. */
function usableTail(
  tail: StoredVaultTail | null | undefined,
  vault: string,
  holder: string,
  blockNumber: number,
): StoredVaultTail | null {
  if (!tail) return null;
  if (tail.chainId !== MAINNET_CHAIN_ID) return null;
  if (tail.loaderVersion !== AAVE_VAULT_TAIL_VERSION) return null;
  if (tail.vault.toLowerCase() !== vault) return null;
  if (tail.holder.toLowerCase() !== holder) return null;
  if (!Number.isFinite(tail.cut) || tail.cut < 0 || tail.cut > blockNumber) return null;
  if (!Array.isArray(tail.rows)) return null;
  // A stored row carrying the `timestamp: 0` placeholder is refused on the way
  // OUT as well as on the way in, so a tail written before this rule existed
  // self-heals: the request that finds one sweeps the whole life and stores a
  // clean tail over it. 0 is 1 January 1970 on the page, not an unread marker.
  // A row with no share price is refused the same way: a stored row is never
  // read again, so a price the lane refused would stay unread for good.
  if (tail.rows.some((r) => !(r.timestamp > 0) || r.sharePriceAtBlock == null)) return null;
  // …and a tail whose sweep counts cannot account for its own rows is refused
  // the same way. Every transfer row came out of at least one of the two
  // `eth_getLogs` (a self-transfer out of both), so `logsIn + logsOut` can
  // never be below the number of transfer rows. A tail that says otherwise
  // would make the merged reconcile state a log count smaller than the rows it
  // drew, which is a claim about the sweeps that the sweeps did not make.
  const transferRows = tail.rows.filter((r) => r.kind !== "cooldown").length;
  if (tail.logsIn + tail.logsOut < transferRows) return null;
  return tail;
}

/** The lane's OWN `finalized` block. Never `latest − k`: the node is the only
 *  place the tag is defined, and on another chain it means something else. */
async function finalizedBlock(client: PublicClient): Promise<number | null> {
  try {
    const block = await client.getBlock({ blockTag: "finalized" });
    const n = Number(block.number);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch (error) {
    // A lane that will not answer the tag is a lane this request stores
    // nothing from. It is not an error the reader sees: the rows are read and
    // gated exactly as before, and the only thing lost is the store.
    console.error("Aave Ethereum vault timeline: the finalized tag did not answer —", error);
    return null;
  }
}

/**
 * Read one holder's whole life in one Aave vault on Ethereum, at one pinned
 * block, and reconcile it against the vault's own `balanceOf` before returning
 * a single row.
 *
 * `holder` must already be an address — ENS resolution belongs to the caller,
 * exactly as it does for `loadAaveEthereumVault`.
 *
 * Three outcomes are kept apart because they are three different facts, and the
 * page states each differently. A read that did not answer comes back with
 * `unread` set and no rows. A read that answered but did not reconcile comes
 * back with `reconcile.reconciled` false and no rows. And a sweep the lane
 * REFUSED comes back withheld with a stated floor — `coverage.withheldAbove`
 * set from the counting walk, with `logCountIsLowerBound` true when the walk
 * stopped early — because a refusal on response size is evidence the life is
 * large rather than evidence it is unreadable. "The lane would not answer",
 * "the lane answered something that does not add up" and "the life is at least
 * this long" must never render the same.
 *
 * With `opts.tail`, the rows at or below the tail's cut come from the store and
 * only the head is swept — and the gate still runs on the two together, so a
 * tail that is wrong is discarded and the whole life re-swept. See the header.
 */
export async function loadAaveEthereumVaultTimelineWithTail(
  vault: string,
  holder: string,
  opts: VaultTimelineOptions,
): Promise<VaultTimelineResult> {
  const address = vault.toLowerCase() as `0x${string}`;
  const who = holder.toLowerCase();
  const blockNumber = BigInt(opts.blockNumber);
  const lane = chainMeta(MAINNET_CHAIN_ID).logsRpcEnv;
  const tailsAllowed = opts.useTail !== false;

  /** The shape every path that draws nothing returns. `notes` are vault-wide
   *  facts rather than this holder's rows, so a path with no rows may still
   *  have them and the ones already read are carried rather than dropped. */
  const empty = (unread: string | null, notes: VaultNote[] = []): VaultTimelineResult => ({
    timeline: {
      vault: address,
      holder: who,
      blockNumber: opts.blockNumber,
      blockTimestamp: 0,
      unread,
      reconcile: null,
      history: { source: "chain", cut: null, tailRows: 0, headRows: 0, storedThisRequest: false },
      events: [],
      notes,
      coverage: { fromDeployment: true, logCount: 0, withheldAbove: null, logCountIsLowerBound: false },
    },
    store: null,
    allEvents: [],
    continueBuild: null,
  });

  try {
    const logs = chainLogsClient(MAINNET_CHAIN_ID);
    const state = chainBatchClient(MAINNET_CHAIN_ID);

    // ── the sweeps: each one narrowly filtered, over the range this request
    //    still has to read. Without a tail that is the whole chain, as before;
    //    with one it is `cut + 1` to the page's block. ────────────────────────
    const sweepFrom =
      (from: number): LogSweep =>
      (topics) =>
        logs.request({
          method: "eth_getLogs",
          params: [{ address, topics, fromBlock: hex(from), toBlock: hex(blockNumber) }],
        } as never) as Promise<RawLog[]>;

    let tail = tailsAllowed ? usableTail(opts.tail, address, who, opts.blockNumber) : null;

    /** A sweep's catch: null for a refusal, rethrown for a rate limit (below). */
    const refusedOnSize = (error: unknown): null => {
      if (isRateLimited(error)) throw error;
      return null;
    };
    /** One pass over a range: the four holder sweeps that feed the rows.
     *
     *  EACH ONE CATCHES TO NULL RATHER THAN THROWING. A refusal is a fact about
     *  ONE sweep and the caller decides what it means; a throw here would fall
     *  to the outer catch and make every refusal an unread history, which is
     *  exactly what the counting walk below exists to stop. Null is "this
     *  direction did not come back", never "this direction is empty".
     *
     *  EXCEPT A RATE-LIMIT REFUSAL, which is thrown on. The lane's client has
     *  already waited it out for about seven seconds (./rpc.ts), and one that
     *  still refuses says the lane is busy, not that this life is large: read
     *  as a size refusal it would send the counting walk below into the same
     *  busy lane and state a floor it never counted. */
    const readRange = async (from: number) => {
      const sweep = sweepFrom(from);
      const [outLogs, inLogs, depositLogs, withdrawLogs, cooldownLogs] = await Promise.all([
        sweep([TOPIC.transfer, topicOf(who), null]).catch(refusedOnSize),
        sweep([TOPIC.transfer, null, topicOf(who)]).catch(refusedOnSize),
        // `owner` is topic2 on Deposit and topic3 on Withdraw — the ERC-4626
        // party whose shares moved, which is the one this page is about.
        sweep([TOPIC.deposit, null, topicOf(who)]).catch(refusedOnSize),
        sweep([TOPIC.withdraw, null, null, topicOf(who)]).catch(refusedOnSize),
        opts.family === "umbrella-stake"
          ? sweep([TOPIC.cooldown, topicOf(who)]).catch(refusedOnSize)
          : Promise.resolve([] as RawLog[]),
      ]);
      return { outLogs, inLogs, depositLogs, withdrawLogs, cooldownLogs };
    };

    // The vault-wide notes are read over the WHOLE chain whatever the tail
    // says: they are not this holder's events, they are never stored, and
    // there are one or two of them in a vault's life.
    const [head, finalized, noteLogs] = await Promise.all([
      readRange(tail ? tail.cut + 1 : 0),
      // Only read when a store could follow. `?tail=0` buys the cold path a
      // call as well as a sweep.
      tailsAllowed ? finalizedBlock(state) : Promise.resolve(null),
      readNotes(sweepFrom(0), opts.family),
    ]);
    let { outLogs, inLogs, depositLogs, withdrawLogs, cooldownLogs } = head;

    // ── a sweep the lane would not hand over ────────────────────────────────
    // A HEAD SWEEP THAT REFUSED, WITH A TAIL IN HAND, IS NOT A FLOOR. The floor
    // path below is what a WHOLE life the lane will not hand over looks like; a
    // refused head over a few hundred blocks is a bad minute on the lane. So
    // the tail is dropped and the whole life is asked for, which is the only
    // request that can tell the two apart. The tail is not stored again on this
    // request either way: a counted life has no rows to keep.
    if (
      (outLogs === null || inLogs === null || depositLogs === null || withdrawLogs === null || cooldownLogs === null) &&
      tail
    ) {
      tail = null;
      ({ outLogs, inLogs, depositLogs, withdrawLogs, cooldownLogs } = await readRange(0));
    }

    if (outLogs === null || inLogs === null) {
      // A refusal on this lane is a refusal on RESPONSE SIZE — chain 1's logs
      // lane refuses a one-direction sweep past 10,000 logs — which is itself
      // evidence the answer is large. Count what can be counted, stop at the
      // horizon, and withhold: never a partial list of the newest rows, and
      // never a stored tail, because a floor is "at least N" and storing it
      // would make it "N".
      //
      // ONLY THE TRANSFER DIRECTIONS ARE WALKED. They are the spine — every
      // share movement is one of them, and `coverage.logCount` counts them —
      // so a floor over the two is a floor over the life.
      const counted = await countRefusedSweeps(
        (topics, from, to) =>
          logs.request({
            method: "eth_getLogs",
            params: [{ address, topics, fromBlock: hex(from), toBlock: hex(to) }],
          } as never) as Promise<RawLog[]>,
        [
          { topics: [TOPIC.transfer, topicOf(who), null], answered: outLogs },
          { topics: [TOPIC.transfer, null, topicOf(who)], answered: inLogs },
        ],
        0,
        blockNumber,
      );
      if (counted === null)
        return empty("this address's share transfers on this vault could not be counted whole", noteLogs);
      return {
        timeline: {
          ...empty(null, noteLogs).timeline,
          coverage: {
            fromDeployment: true,
            logCount: counted.count,
            withheldAbove: counted.count,
            logCountIsLowerBound: !counted.exact,
          },
        },
        store: null,
        allEvents: [],
        continueBuild: null,
      };
    }

    // A LEG OR COOLDOWN SWEEP THAT REFUSED WHILE THE TRANSFERS ANSWERED IS A
    // LANE FAULT, NOT A SIZE FACT, so it is stated as unread rather than
    // counted. Every `Deposit` mints shares and every `Withdraw` burns them, so
    // each one has its own `Transfer` in one of the two directions that just
    // came back: the leg sweeps are bounded by sweeps this lane answered, and a
    // refusal over a strictly smaller answer says nothing about size.
    // `StakerCooldownUpdated` is not bounded that way — a holder can start a
    // cooldown without moving a share — but it is not the spine either, and a
    // floor counted over the transfers alone while a row type was missing would
    // be a life stated as read with a kind of row silently absent from it. The
    // message is its own, so the two refusals cannot be read as one.
    if (depositLogs === null || withdrawLogs === null || cooldownLogs === null)
      return empty("this address's deposit, withdrawal and cooldown events on this vault did not answer", noteLogs);

    // ── the gate ────────────────────────────────────────────────────────────
    const opening = () => (tail ? BigInt(tail.cutBalance) : ZERO);
    let transfers = mergeTransfers(outLogs, inLogs);
    let replayed = opening() + replay(transfers, who);
    let onChain = await balanceAt(state, address, who, blockNumber);
    let refetched = false;
    let refetchDiffered = false;

    if (replayed !== onChain) {
      // ONE re-fetch, on the same lane, after a pause — never a third attempt,
      // never a silent hop to another lane, never a narrowed range. If the
      // second answer differs in COUNT that fact is itself the finding. With a
      // tail the re-fetch covers the HEAD only: the tail is a value, and
      // reading it again would return the same bytes.
      refetched = true;
      await new Promise((r) => setTimeout(r, 250));
      const again = await readRange(tail ? tail.cut + 1 : 0);
      // A SECOND READING IS TAKEN WHOLE OR NOT AT ALL. One of its sweeps
      // refusing leaves the first reading standing — the gate then states the
      // mismatch it already found, which is a fact, rather than a mismatch
      // computed from a half-replaced set of logs.
      if (again.outLogs && again.inLogs && again.depositLogs && again.withdrawLogs && again.cooldownLogs) {
        const second = mergeTransfers(again.outLogs, again.inLogs);
        refetchDiffered = second.length !== transfers.length;
        outLogs = again.outLogs;
        inLogs = again.inLogs;
        depositLogs = again.depositLogs;
        withdrawLogs = again.withdrawLogs;
        cooldownLogs = again.cooldownLogs;
        transfers = second;
        replayed = opening() + replay(transfers, who);
        onChain = await balanceAt(state, address, who, blockNumber);
      }

      // STILL out. The tail is DISTRUSTED — not patched, not partly believed —
      // and the whole life is swept from block 0, which is what this loader
      // does when there is no tail at all. A tail can therefore make a page
      // slow and never wrong.
      if (replayed !== onChain && tail) {
        tail = null;
        const whole = await readRange(0);
        if (whole.outLogs && whole.inLogs && whole.depositLogs && whole.withdrawLogs && whole.cooldownLogs) {
          outLogs = whole.outLogs;
          inLogs = whole.inLogs;
          depositLogs = whole.depositLogs;
          withdrawLogs = whole.withdrawLogs;
          cooldownLogs = whole.cooldownLogs;
          transfers = mergeTransfers(outLogs, inLogs);
          replayed = replay(transfers, who);
          onChain = await balanceAt(state, address, who, blockNumber);
        }
      }
    }

    // The tail's own rows, newest first, ready to sit under the head's. A
    // cooldown row moves no shares, so the tail's TRANSFER count is its rows
    // less those — the figure the horizon is measured against.
    const tailRows = tail ? tail.rows : [];
    const tailTransfers = tailRows.filter((r) => r.kind !== "cooldown").length;

    const reconcile = {
      reconciled: replayed === onChain,
      replayed: replayed.toString(),
      onChain: onChain.toString(),
      logsIn: (tail ? tail.logsIn : 0) + inLogs.length,
      logsOut: (tail ? tail.logsOut : 0) + outLogs.length,
      refetched,
      refetchDiffered,
      lane,
      fromBlock: 0,
      toBlock: opts.blockNumber,
      cutBalance: tail ? tail.cutBalance : null,
    };

    const blockTimestamp = Number((await state.getBlock({ blockNumber })).timestamp);
    const history: VaultHistorySource = {
      source: tail ? "stored+head" : "chain",
      cut: tail ? tail.cut : null,
      tailRows: tailRows.length,
      headRows: 0,
      storedThisRequest: false,
    };
    const base: VaultHolderTimeline = {
      vault: address,
      holder: who,
      blockNumber: opts.blockNumber,
      blockTimestamp,
      unread: null,
      reconcile,
      history,
      events: [],
      notes: noteLogs,
      coverage: {
        fromDeployment: true,
        logCount: tailTransfers + transfers.length,
        withheldAbove: null,
        logCountIsLowerBound: false,
      },
    };

    if (!reconcile.reconciled) return { timeline: base, store: null, allEvents: [], continueBuild: null };

    const wholeCount = base.coverage.logCount;
    const heavy = wholeCount > VAULT_TIMELINE_HORIZON;
    // A life can only be BUILT across requests if there is a store to build
    // into. `?tail=0` refuses both halves of it and a lane that will not name
    // its `finalized` block gives nothing to cut at, so on either the answer is
    // the one this loader has always given for a heavy life.
    const storable = tailsAllowed && finalized != null;

    // ── Tier 2: withheld, and the count stated ──────────────────────────────
    // Above what Rails stores, or with nowhere to store it. The rows were read
    // and reconciled — what is withheld is the drawing of them — and nothing is
    // stored: a tail Rails cannot hold whole is not a tail.
    if (heavy && (wholeCount > tailMaxRows(MAINNET_CHAIN_ID) || !storable))
      return {
        timeline: { ...base, coverage: { ...base.coverage, withheldAbove: wholeCount } },
        store: null,
        allEvents: [],
        continueBuild: null,
      };

    // ── Tier 1: the head is too large to build in this request ──────────────
    // The blocks are the unit `buildRows` spends its two calls per, so the test
    // is over DISTINCT blocks and not over rows.
    const headBlocks = rowBlocksAscending(transfers, cooldownLogs);
    if (heavy && headBlocks.length > BUILD_BLOCKS_INLINE) {
      const builder = chunkedBuilder({
        state,
        address,
        who,
        opts,
        transfers,
        depositLogs,
        withdrawLogs,
        cooldownLogs,
        headBlocks,
        tail,
        tailRows,
        finalized: finalized as number,
        inLogs,
        outLogs,
        lane,
      });
      const next = await builder.next();
      const first = typeof next === "string" ? null : next;
      history.storedThisRequest = first != null;
      history.building = {
        keptRows: first ? first.rows.length : tailRows.length,
        keptCut: first ? first.cut : (tail?.cut ?? 0),
        totalRows: tailRows.length + rowCount(transfers, cooldownLogs),
      };
      return {
        timeline: { ...base, history, events: [] },
        store: first,
        allEvents: [],
        // Offered whenever there is something left to build — ALSO when this
        // request's first chunk stalled on a block that would not answer, so
        // a cold life the lane refused is still built behind the response
        // rather than left at nothing until the next visit. The caller runs it
        // after its own PUT of `store` answered, or straight away when there
        // was no `store` to PUT.
        continueBuild: next === "done" ? null : builder.continueBuild,
      };
    }

    // The head's own rows, replayed from where the tail left off, then the
    // tail's under them — both already newest-first, and every head block is
    // above every tail block, so the concatenation IS the sorted order.
    const headRows = await buildRows(
      state,
      address,
      who,
      opts,
      transfers,
      depositLogs,
      withdrawLogs,
      cooldownLogs,
      opening(),
    );
    const allEvents = [...headRows, ...tailRows.slice().reverse()];
    history.headRows = headRows.length;

    // ── the candidate tail, if §2.5's rule fires ────────────────────────────
    // THE STORE IS OFFERED ALL THE ROWS. The window below is taken after this
    // line, so what is kept is a whole life and what crosses to the client is a
    // slice of it.
    const store = finalized == null ? null : candidateTail(allEvents, finalized);
    // A ROW WHOSE BLOCK DID NOT ANSWER IS NOT STORED. `timestamp: 0` is the
    // placeholder the row grammar leaves when `eth_getBlockByNumber` refused —
    // and 0 is not an unread marker, it is 1 January 1970, so a page drawing a
    // stored one would state a date that is simply wrong. Keeping it would make
    // that permanent, which is the one thing a tail may never do. The whole
    // tail is refused rather than the row, because a tail with a row missing
    // from the middle would not sum to its own `cutBalance`. A row whose share
    // price did not answer is refused on the same terms: stored, it would never
    // be asked for again.
    const wholeRows = store != null && store.rows.every((r) => r.timestamp > 0 && r.sharePriceAtBlock != null);
    const stale = tail != null && finalized != null && finalized - tail.cut > TAIL_REFRESH_BLOCKS;
    const shouldStore =
      tailsAllowed &&
      store != null &&
      wholeRows &&
      finalized != null &&
      store.rows.length > 0 &&
      finalized > (tail?.cut ?? -1) &&
      (tail == null || stale || headRows.length > TAIL_REFRESH_ROWS);
    history.storedThisRequest = shouldStore;

    // ── the draw window, last ───────────────────────────────────────────────
    // A life at or under `VAULT_TIMELINE_DRAW_ROWS` is handed over whole and `coverage` is the
    // same object it was.
    const { events, drawn } = vaultDrawWindow(allEvents);
    const coverage = drawn ? { ...base.coverage, drawn } : base.coverage;

    return {
      timeline: { ...base, coverage, history, events },
      allEvents,
      continueBuild: null,
      store: shouldStore
        ? {
            chainId: MAINNET_CHAIN_ID,
            vault: address,
            holder: who,
            loaderVersion: AAVE_VAULT_TAIL_VERSION,
            cut: finalized as number,
            cutBalance: store!.cutBalance,
            // The whole-life log counts AT OR BELOW the cut — the tail's own,
            // plus this head's logs that have finalized since.
            logsIn: (tail ? tail.logsIn : 0) + belowCut(inLogs, finalized as number),
            logsOut: (tail ? tail.logsOut : 0) + belowCut(outLogs, finalized as number),
            lane,
            storedAt: new Date().toISOString(),
            rows: store!.rows,
          }
        : null,
    };
  } catch (error) {
    console.error("Aave Ethereum vault timeline: a read did not answer —", error);
    return empty("a read on this path did not answer");
  }
}

/** How many of these logs are at or below the cut. Logs, not rows: a
 *  self-transfer is one row and appears in BOTH sweeps, and the two figures the
 *  store keeps are the sweeps' own counts. */
const belowCut = (logs: RawLog[], cut: number): number =>
  logs.filter((l) => Number(BigInt(l.blockNumber)) <= cut).length;

/** The rows a store may keep, and their signed sum — computed the same way the
 *  store re-computes it on the way in, so a body this loader builds can only be
 *  refused if this arithmetic is wrong. */
function candidateTail(
  eventsNewestFirst: VaultHolderEvent[],
  cut: number,
): { rows: VaultHolderEvent[]; cutBalance: string } {
  const rows = eventsNewestFirst
    .filter((r) => r.blockNumber <= cut)
    .slice()
    .reverse();
  let sum = ZERO;
  for (const r of rows) sum += BigInt(r.sharesDelta);
  return { rows, cutBalance: sum.toString() };
}

// ── building a heavy life a chunk at a time ──────────────────────────────────

/** The DISTINCT blocks these logs would make rows at, ascending — the unit
 *  `buildRows` spends its two calls per, and so the unit a chunk is measured
 *  in. A holder with two logs in one block costs one block, not two, which is
 *  why the count here and the row count are different figures. */
function rowBlocksAscending(transfers: RawLog[], cooldownLogs: RawLog[]): number[] {
  const set = new Set<number>();
  for (const log of transfers) set.add(Number(BigInt(log.blockNumber)));
  for (const log of cooldownLogs) if (!hasTransferTx(transfers, log)) set.add(Number(BigInt(log.blockNumber)));
  return [...set].sort((a, b) => a - b);
}

/** How many ROWS these logs make: one per transfer, plus one per cooldown that
 *  stands alone in its own transaction. The figure the building line counts
 *  against, so that "N of M rows" compares two counts of the same thing. */
const rowCount = (transfers: RawLog[], cooldownLogs: RawLog[]): number =>
  transfers.length + cooldownLogs.filter((l) => !hasTransferTx(transfers, l)).length;

/** Those of these logs that sit in `(lo, hi]`. */
const between = (logs: RawLog[], lo: number, hi: number): RawLog[] =>
  logs.filter((l) => {
    const b = Number(BigInt(l.blockNumber));
    return b > lo && b <= hi;
  });

interface ChunkedBuild {
  state: PublicClient;
  address: `0x${string}`;
  who: string;
  opts: VaultTimelineOptions;
  transfers: RawLog[];
  depositLogs: RawLog[];
  withdrawLogs: RawLog[];
  cooldownLogs: RawLog[];
  /** The head's own distinct row blocks, ascending. */
  headBlocks: number[];
  tail: StoredVaultTail | null;
  tailRows: VaultHolderEvent[];
  finalized: number;
  inLogs: RawLog[];
  outLogs: RawLog[];
  lane: string;
}

/**
 * Build one heavy life into the store, oldest first, a chunk of blocks at a
 * time.
 *
 * THE SWEEPS ARE NEVER REPEATED. Every log this life is made of is already in
 * hand when this is constructed; a chunk is a slice of them and the calls it
 * makes are the per-block timestamp and share price `buildRows` makes. So the
 * continuation queued in `after()` costs the lane no `eth_getLogs` at all.
 *
 * EVERY CHUNK IS A WHOLE UP TO ITS OWN CUT. The rows are built ASCENDING, so
 * what has been built is always a contiguous prefix of the life from block zero
 * (or from the stored tail's own cut) to the last block of the last chunk, and
 * the signed sum of that prefix is `cutBalance` — which is exactly what the
 * store re-computes on the way in and refuses a body over. There is no state in
 * the store that is not a complete, checkable value.
 *
 * A BLOCK THAT DID NOT ANSWER ENDS THE CHUNK THERE; IT DOES NOT COST THE CHUNK.
 * A block has answered when BOTH its reads have: the timestamp and the share
 * price. A row carrying the `timestamp: 0` placeholder is never stored — the
 * store's rule refuses a tail with one in it, and 0 is 1 January 1970 on a page
 * rather than an unread marker — and neither is a row whose price is null,
 * because a stored row is never read again. So the chunk is stored up to the
 * block BEFORE the first one that did not answer: every row under that cut was read, the rows
 * are ascending, so that prefix is a whole up to its own cut like any other.
 * The next attempt starts at the unread block and asks only for the blocks no
 * earlier attempt answered (`BlockReads`), so a retry repeats no call that
 * answered. `verify-ethereum-vault-cold-build.mjs` holds this against a lane
 * that refuses on its rate limit.
 */
function chunkedBuilder(b: ChunkedBuild) {
  // Only what has FINALIZED can be built into a tail; the rest is head on the
  // visit that draws.
  const buildable = b.headBlocks.filter((block) => block <= b.finalized);
  let built = b.tailRows.slice();
  let cut = b.tail ? b.tail.cut : -1;
  let taken = 0;
  const known = emptyBlockReads();

  const openingBalance = () => {
    let sum = ZERO;
    for (const r of built) sum += BigInt(r.sharesDelta);
    return sum;
  };

  /** Build the next chunk and return the tail to offer for it; "done" when
   *  there is nothing left to build, "stalled" when not even the chunk's first
   *  block answered. */
  const next = async (): Promise<StoredVaultTail | "done" | "stalled"> => {
    const blocks = buildable.slice(taken, taken + BUILD_CHUNK_BLOCKS);
    if (blocks.length === 0) return "done";
    const lo = cut;

    const rows = await buildRows(
      b.state,
      b.address,
      b.who,
      b.opts,
      between(b.transfers, lo, blocks[blocks.length - 1]),
      // The asset legs are handed over whole: `assetLegClaimer` pairs them by
      // transaction and share count, so a leg outside this chunk is simply
      // never claimed, and the claimer is a fresh closure per call so no
      // chunk can consume another's.
      b.depositLogs,
      b.withdrawLogs,
      between(b.cooldownLogs, lo, blocks[blocks.length - 1]),
      openingBalance(),
      known,
    );

    // The chunk's blocks are ascending, so the answered prefix is every block
    // before the first one whose timestamp or share price did not come back.
    const firstUnread = firstUnreadBlock(blocks, known);
    const kept = firstUnread === -1 ? blocks.length : firstUnread;
    if (kept === 0) {
      console.error(
        `Aave Ethereum vault timeline: block ${blocks[0]} would not answer; nothing above cut ${Math.max(cut, 0)} was stored`,
      );
      return "stalled";
    }
    const hi = blocks[kept - 1];
    if (kept < blocks.length)
      console.error(
        `Aave Ethereum vault timeline: block ${blocks[kept]} would not answer; the chunk is stored to block ${hi}`,
      );

    built = [...built, ...rows.filter((r) => r.blockNumber <= hi).reverse()];
    cut = hi;
    taken += kept;

    // The same filter-and-sum the whole-life path offers, over the prefix built
    // so far — and the same arithmetic the store re-runs on the way in.
    const candidate = candidateTail(built.slice().reverse(), cut);
    return {
      chainId: MAINNET_CHAIN_ID,
      vault: b.address,
      holder: b.who,
      loaderVersion: AAVE_VAULT_TAIL_VERSION,
      cut,
      cutBalance: candidate.cutBalance,
      // The whole-life counts AT OR BELOW this cut: the tail this request read,
      // plus the head logs that sit under it.
      logsIn: (b.tail ? b.tail.logsIn : 0) + belowCut(b.inLogs, cut),
      logsOut: (b.tail ? b.tail.logsOut : 0) + belowCut(b.outLogs, cut),
      lane: b.lane,
      storedAt: new Date().toISOString(),
      rows: candidate.rows,
    };
  };

  /** Keep building and storing until the head is built or the budget is spent.
   *  The clock is read BETWEEN chunks and never inside one: a chunk abandoned
   *  half-read is a chunk whose calls were paid for and thrown away.
   *
   *  A STALL IS WAITED OUT, not ended on. The block that did not answer is
   *  asked again after `STALL_WAIT_MS` — only that block and the ones after it
   *  that no attempt has read — for as long as the budget lasts. That is the
   *  same read the next visit would make, made while the lane is quieter, so
   *  it adds no call a later visit would not have spent. */
  const continueBuild = async (put: (tail: StoredVaultTail) => Promise<{ ok: boolean }>): Promise<void> => {
    const deadline = Date.now() + BUILD_WALL_MS;
    while (Date.now() < deadline) {
      const chunk = await next();
      if (chunk === "done") return;
      if (chunk === "stalled") {
        if (Date.now() + STALL_WAIT_MS >= deadline) return;
        await new Promise((r) => setTimeout(r, STALL_WAIT_MS));
        continue;
      }
      const answer = await put(chunk);
      if (!answer.ok) {
        console.error(`Aave Ethereum vault timeline: the store refused the chunk at cut ${chunk.cut}; the build stops`);
        return;
      }
    }
  };

  return { next, continueBuild };
}

// ── the gate's own read ──────────────────────────────────────────────────────

async function balanceAt(
  client: PublicClient,
  vault: `0x${string}`,
  holder: string,
  blockNumber: bigint,
): Promise<bigint> {
  return (await client.readContract({
    address: vault,
    abi: VAULT_ABI,
    functionName: "balanceOf",
    args: [holder as `0x${string}`],
    blockNumber,
  })) as bigint;
}

// ── the rows ─────────────────────────────────────────────────────────────────

async function buildRows(
  client: PublicClient,
  vault: `0x${string}`,
  holder: string,
  opts: VaultTimelineOptions,
  transfers: RawLog[],
  depositLogs: RawLog[],
  withdrawLogs: RawLog[],
  cooldownLogs: RawLog[],
  /** Where the running balance starts. Zero on a whole-life sweep; the stored
   *  tail's `cutBalance` when these rows are a HEAD sitting on top of one, so
   *  `balanceAfter` on the oldest head row continues the tail's last row rather
   *  than restarting the life at zero. */
  openingBalance: bigint = ZERO,
  /** Block reads already answered on an earlier attempt, filled in by this one.
   *  A chunked build hands the same maps to every attempt at a chunk, so a
   *  second attempt asks only for the blocks the first could not read. */
  known: BlockReads = emptyBlockReads(),
): Promise<VaultHolderEvent[]> {
  // One entry per DISTINCT block: measured on the fixtures that is very nearly
  // one per event, but a holder with two logs in one block must not be asked
  // the same question twice.
  const cooldownTxs = new Set(cooldownLogs.map((l) => l.transactionHash));
  const rowBlocks = new Set<string>();
  for (const log of transfers) rowBlocks.add(BigInt(log.blockNumber).toString());
  for (const log of cooldownLogs) if (!hasTransferTx(transfers, log)) rowBlocks.add(BigInt(log.blockNumber).toString());
  const blocks = [...rowBlocks].map((b) => BigInt(b));

  // ONE batched wave: a timestamp and an archive share price per block, only
  // for the blocks no earlier attempt answered, with one retry over the misses
  // (./vault-block-reads). A call that does not answer leaves the figure unread
  // rather than borrowing the head price — and a row whose block did not
  // answer carries a PLACEHOLDER timestamp of 0 or a null price, which the
  // store's own rule (below) refuses; the retry is what keeps that rule from
  // costing every large life its tail.
  await readBlockWave(client, vault, opts.shareDecimals, blocks, known);
  const timestampAt = known.timestamps;
  const priceAt = known.prices;

  // The asset leg, claimed once each: a transaction that ever carries two of
  // this owner's legs pairs them by share count rather than taking the first.
  const claimLeg = assetLegClaimer(depositLogs, withdrawLogs);

  const rows: VaultHolderEvent[] = [];
  let balance = openingBalance;
  for (const log of transfers) {
    const from = addrOf(log.topics[1]);
    const to = addrOf(log.topics[2]);
    const value = BigInt(log.data);
    const blockNumber = Number(BigInt(log.blockNumber));
    const key = BigInt(log.blockNumber).toString();

    let delta = ZERO;
    if (to === holder) delta += value;
    if (from === holder) delta -= value;
    balance += delta;

    // The kind is decided by the zero address, never by a label — and a log
    // whose two ends are both this holder is its own case, because calling it
    // an arrival would say shares came from somewhere.
    const kind = classifyTransfer(from, to, holder);
    const counterparty = counterpartyOf(kind, from, to, holder);

    const sameTxCooldowns = cooldownLogs.filter((c) => c.transactionHash === log.transactionHash);

    rows.push({
      id: `${log.transactionHash}:${Number(BigInt(log.logIndex))}`,
      txHash: log.transactionHash,
      blockNumber,
      timestamp: timestampAt.get(key) ?? 0,
      logIndex: Number(BigInt(log.logIndex)),
      kind,
      counterparty,
      sharesDelta: delta.toString(),
      balanceAfter: balance.toString(),
      // Only a mint or a burn has an ERC-4626 leg to claim. A plain transfer
      // emits none, and stating one for it would be an invention.
      assets: kind === "deposit" || kind === "withdrawal" ? claimLeg(log.transactionHash, value) : null,
      sharePriceAtBlock: priceAt.get(key) ?? null,
      shareDecimals: opts.shareDecimals,
      assetDecimals: opts.assetDecimals,
      extra: sameTxCooldowns.length ? umbrellaExtra(sameTxCooldowns) : undefined,
    });
  }

  // A cooldown that shares a transaction with one of this holder's own
  // transfers is already on that row. One that stands alone is an action the
  // holder took with no share movement, so it earns a row of its own.
  // Its balance is searched over the transfer rows alone: the loop below
  // pushes cooldown rows onto `rows`, and searching those would give each lone
  // cooldown after the first the previous cooldown's balance.
  const transferRows = rows.slice();
  for (const log of cooldownLogs) {
    if (hasTransferTx(transfers, log)) continue;
    const blockNumber = Number(BigInt(log.blockNumber));
    const key = BigInt(log.blockNumber).toString();
    const logIndex = Number(BigInt(log.logIndex));
    // The replay position at this moment: the balance after the last transfer
    // at or before this log. A cooldown moves no shares, so it inherits it.
    const balanceHere = transferRows.reduce(
      (acc, r) =>
        r.blockNumber < blockNumber || (r.blockNumber === blockNumber && r.logIndex < logIndex) ? r.balanceAfter : acc,
      openingBalance.toString(),
    );
    rows.push({
      id: `${log.transactionHash}:${logIndex}`,
      txHash: log.transactionHash,
      blockNumber,
      timestamp: timestampAt.get(key) ?? 0,
      logIndex,
      kind: "cooldown",
      counterparty: null,
      sharesDelta: "0",
      balanceAfter: balanceHere,
      assets: null,
      sharePriceAtBlock: priceAt.get(key) ?? null,
      shareDecimals: opts.shareDecimals,
      assetDecimals: opts.assetDecimals,
      extra: umbrellaExtra([log]),
    });
  }

  // NEWEST FIRST, which is the order every other Rails timeline renders in and
  // the order this object is served in — the API's array and the page's rows
  // are the same order, so a reader checking one against the other is checking
  // one claim. The REPLAY above runs ascending, because a running balance can
  // only be accumulated in the order the chain wrote the logs; the reversal is
  // the last thing that happens to it.
  return rows.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
}

const hasTransferTx = (transfers: RawLog[], log: RawLog): boolean =>
  transfers.some((t) => t.transactionHash === log.transactionHash);

function umbrellaExtra(logs: RawLog[]): UmbrellaEventExtra {
  return {
    kind: "umbrella",
    cooldown: logs.map((log) => {
      const [amount, endOfCooldown, unstakeWindow] = decodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
        log.data as `0x${string}`,
      );
      return {
        amount: amount.toString(),
        endOfCooldown: Number(endOfCooldown),
        unstakeWindow: Number(unstakeWindow),
      };
    }),
  };
}

// ── the notes ────────────────────────────────────────────────────────────────

/** Vault-wide configuration events: the ones that moved every holder's terms at
 *  once, and so are notes rather than rows. Each fires once or twice in a
 *  vault's whole life, which is why they can be swept per request; the accrual
 *  events, which fire thousands of times, are not read at all. */
async function readNotes(sweep: LogSweep, family: AaveVaultFamily): Promise<VaultNote[]> {
  const wanted: { topic: string; kind: VaultNote["kind"]; fields: string[] }[] =
    family === "sgho"
      ? [{ topic: TOPIC.targetRate, kind: "target-rate", fields: ["newRate"] }]
      : family === "umbrella-stake"
        ? [
            { topic: TOPIC.cooldownChanged, kind: "cooldown-config", fields: ["oldCooldown", "newCooldown"] },
            {
              topic: TOPIC.unstakeWindow,
              kind: "unstake-window-config",
              fields: ["oldUnstakeWindow", "newUnstakeWindow"],
            },
          ]
        : [];
  if (!wanted.length) return [];

  const answers = await Promise.all(
    wanted.map((w) =>
      sweep([w.topic]).then(
        (logs) =>
          logs.map((log) => {
            const words = decodeAbiParameters(
              w.fields.map(() => ({ type: "uint256" }) as const),
              log.data as `0x${string}`,
            ) as readonly bigint[];
            return {
              kind: w.kind,
              blockNumber: Number(BigInt(log.blockNumber)),
              // A note's own timestamp is not read: it would cost one call per
              // note for a line that names the block. The page names the block.
              timestamp: 0,
              txHash: log.transactionHash,
              fields: Object.fromEntries(w.fields.map((f, i) => [f, words[i].toString()])),
            } satisfies VaultNote;
          }),
        () => [] as VaultNote[],
      ),
    ),
  );
  return answers.flat().sort((a, b) => a.blockNumber - b.blockNumber);
}
