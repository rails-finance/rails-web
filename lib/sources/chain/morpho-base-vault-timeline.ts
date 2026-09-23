// One holder's life inside one MetaMorpho vault on Base. SERVER-ONLY.
// ----------------------------------------------------------------------------
// The sibling of morpho-base-vault.ts. That file reads the vault, and one
// address's attributed slice of it, AT one block; this one reads how the
// address got there — every `Transfer` the vault emitted about it, from the
// vault's own creation block to the block the page states, replayed into a
// running balance and checked against `balanceOf` before anything is drawn.
//
// It is the same reader as aave-ethereum-vault-timeline.ts and shares its log
// arithmetic (./vault-holder-logs). What differs is below.
//
// ── THE LANE ─────────────────────────────────────────────────────────────────
// Until 2026-09-19 chain 8453's `logsRpcEnv` named `BASE_LOGS_RPC_URL`, the
// Tenderly Base gateway. Measured 2026-09-07, both directions:
//
//   BASE_LOGS_RPC_URL      refuses ANY range over 1,000 blocks with
//                          `invalid params` — with or without a topic filter,
//                          tested at 1k / 10k / 100k / 2.5M / whole-life. A
//                          whole-life sweep cannot be asked of it at all.
//   BASE_BACKFILL_RPC_URL  answered this vault's whole 17.35M-block life,
//                          address- and topic-filtered, in ONE call in 274–336
//                          ms on every ordinary fixture. Its limit is on
//                          RESPONSE SIZE, not on range.
//
// So this file named `BASE_BACKFILL_RPC_URL` itself rather than going through
// `chainLogsClient`. Since 2026-09-19 `logsRpcEnv` names that same lane, so the
// two read one endpoint; the explicit name stays as the lane the page states
// (`MORPHO_BASE_TIMELINE_LANE`).
//
// `balanceOf` at the page's block, and one batched wave of
// `eth_getBlockByNumber` and archive `convertToAssets` per DISTINCT row block,
// go through `chainBatchClient(8453)` — the same client the vault reading
// itself uses, in batches of 60. The allocation read beside them posts its own
// batches on the same named lane, for the reason its own header gives.
//
// ── WHEN THE LANE REFUSES ON RESPONSE SIZE ───────────────────────────────────
// One address on this vault does that: its fee recipient, which holds 12.7% of
// the vault's whole `Transfer` stream because MetaMorpho mints performance-fee
// shares to it inside nearly every deposit and withdrawal. A refusal is not an
// unread history — it is evidence the history is LARGE — so the reader falls
// back to a chunked walk that COUNTS and stops the moment the count passes the
// horizon this page draws. What comes back is a lower bound, marked as one, and
// the rows are withheld. A floor and a census are different claims and the page
// states which it has. The gate cannot run on that path (there are no logs to
// replay), and nothing is drawn there, which is the same answer the horizon
// would have given anyway.
//
// ── THE FEE-SHARE MINT IS NEVER FETCHED ──────────────────────────────────────
// The sweeps are `[Transfer, holderTopic, null]` and `[Transfer, null,
// holderTopic]`. A mint to the fee recipient in the same transaction as this
// address's own mint carries neither topic, so it is never fetched and there is
// nothing to exclude. What follows for the COPY is that a row states this
// address's own leg and stops: it must not say the transaction moved nothing
// else, because it did.
//
// `AccrueInterest` — the accrual event the fee mint rides in — is read as a row
// nowhere. It fires on nearly every state-changing call, it is the mechanic
// behind each row's share price, and a row per accrual would not be a holder's
// life. `ReallocateSupply`, `ReallocateWithdraw` and `SetWithdrawQueue` are not
// read here at all: what the vault's asset sat in at a row's block is replayed
// from Morpho Blue's own rows by ./morpho-base-vault-allocation-at.ts, never
// from a curator's events. That read is a photograph at each row's own block
// and nothing spans the gap between two of them.
//
// ── THE STORED TAIL, AND WHY IT CANNOT MAKE A PAGE WRONG ─────────────────────
// A row at or below the lane's own `finalized` block never changes, so it may
// be kept. This reader takes an optional `StoredVaultTail` — every row of this
// life at or below a cut, with the signed sum of their deltas — sweeps only
// from `cut + 1` to the page's block, and replays `cutBalance + Σ head deltas`.
//
// THE GATE THEN RUNS ON THE MERGED ROWS, UNCHANGED. It is the same wei-exact
// comparison against `balanceOf` at the page's block. On a mismatch the head is
// re-fetched once; still mismatched, THE TAIL IS DISTRUSTED and the whole life
// is swept from the vault's creation block exactly as it is without one. So the
// worst a wrong or stale tail can do is make one page slow.
//
// THE CUT IS A CHAIN ANSWER. `eth_getBlockByNumber("finalized")` on the state
// lane, read in this request — never `latest − 650`, never a constant. Measured
// on this chain the tag sits 643 to 795 blocks behind head and STEPS in
// L1-epoch-sized jumps rather than creeping, so a constant written now would be
// wrong within five minutes.
//
// AND THE FLOOR PATH STORES NOTHING. Where the lane refuses a sweep on response
// size the count is a LOWER BOUND from a chunked walk, no gate ran, and no rows
// exist: there is nothing whole to keep, and storing a floor would turn "at
// least N" into "N". It is Tier 2 below and stays Tier 2: a build is a prefix
// of a KNOWN life, and a floor does not name one.
//
// ── A HEAVY LIFE IS BUILT ACROSS REQUESTS, NOT REFUSED ───────────────────────
// The twin of the same section in aave-ethereum-vault-timeline.ts, and the same
// three tiers. What costs a long life here is the same thing: one
// `eth_getBlockByNumber` and one archive `convertToAssets` per DISTINCT row
// block, 1.3 ms a block measured on this chain's state lane. So above
// `VAULT_TIMELINE_HORIZON` a head of more than `BUILD_BLOCKS_INLINE` unbuilt
// blocks has its OLDEST `BUILD_CHUNK_BLOCKS` built and stored here, and the
// continuation the caller queues in `after()` carries on until the head is
// built or `BUILD_WALL_MS` is spent; no rows are drawn until the life is whole.
// Above `tailMaxRows(BASE_CHAIN_ID)` the rows are withheld as they always were.
//
// TWO THINGS ARE BASE'S OWN. The asset-leg sweeps live inside `buildRows` here
// rather than beside the transfer sweeps, so the builder fetches them ONCE and
// hands every chunk the same two answers — a continuation costs the backfill
// lane no `eth_getLogs` at all. And the allocation band is NOT attached to a
// chunk's rows: it is capped at the newest blocks of a life and a chunk builds
// the oldest, so there would be nothing to read; the visit that draws attaches
// it over the merged rows exactly as it does today.
//
// THE WINDOW IS THE LAST THING THAT HAPPENS. The store is offered ALL the rows
// and the caller is handed the newest `VAULT_TIMELINE_DRAW_ROWS` of them, with
// `coverage.drawn` stating both figures.
//
// THE ALLOCATION BAND IS NEVER STORED. It is a read at each row's own block and
// it would keep, but it is not a gate operand, so a stored band would be a
// figure nothing checks. It is read fresh on every request over the newest
// ALLOCATION_BLOCKS of the MERGED rows, which is why a warm page and a cold one
// draw exactly the same bands.
//
// NO USD, NO RATE OF RETURN, NO SERIES. Each row's share price is a read at a
// block the HOLDER chose by transacting, and no field here holds a difference
// between two of them.

import {
  createPublicClient,
  decodeAbiParameters,
  http,
  parseAbi,
  parseAbiItem,
  toEventSelector,
  type Chain,
  type PublicClient,
} from "viem";
import { base } from "viem/chains";
import { chainBatchClient } from "./rpc";
import { loadMorphoBaseVaultAllocationAt } from "./morpho-base-vault-allocation-at";
import {
  ERC4626_TOPIC,
  addressOfTopic,
  assetLegClaimer,
  classifyTransfer,
  counterpartyOf,
  hexBlock,
  mergeTransfers,
  replayTransfers,
  topicOfAddress,
  type RawLog,
} from "./vault-holder-logs";
import { countRefusedSweeps } from "./vault-sweep-walk";
import { emptyBlockReads, firstUnreadBlock, readBlockWave, type BlockReads } from "./vault-block-reads";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import {
  BUILD_BLOCKS_INLINE,
  BUILD_CHUNK_BLOCKS,
  BUILD_WALL_MS,
  MORPHO_BASE_VAULT_TAIL_VERSION,
  VAULT_TIMELINE_HORIZON,
  vaultDrawWindow,
  tailMaxRows,
  type MetaMorphoEventExtra,
  type MorphoVaultNote,
  type StoredVaultTail,
  type VaultHistorySource,
  type VaultHolderEvent,
  type VaultHolderTimeline,
} from "@/lib/shared/vault-holder-timeline";

const ZERO = BigInt(0);

/** The env var this reader's sweeps run on, named rather than resolved: a
 *  receipt states the NAME because the URL carries a key. */
export const MORPHO_BASE_TIMELINE_LANE = "BASE_BACKFILL_RPC_URL";

// MetaMorpho's own configuration topic0s, COMPUTED from their fragments. The
// three ERC-4626 ones every vault shares are in ./vault-holder-logs.
const SET_FEE_EVENT = parseAbiItem("event SetFee(address indexed caller, uint256 newFee)");
const SET_NAME_EVENT = parseAbiItem("event SetName(string name)");
const SET_SYMBOL_EVENT = parseAbiItem("event SetSymbol(string symbol)");

const TOPIC = {
  ...ERC4626_TOPIC,
  setFee: toEventSelector(SET_FEE_EVENT),
  setName: toEventSelector(SET_NAME_EVENT),
  setSymbol: toEventSelector(SET_SYMBOL_EVENT),
} as const;

const VAULT_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
]);

// The counting walk a refused sweep falls back to — its constants and its
// reasoning live in ./vault-sweep-walk.ts, shared with the Ethereum loader
// because a refusal means the same thing on both chains.

// ── how many blocks the allocation is read at ────────────────────────────────
// The allocation read costs three waves per block and grows with the queue's
// own length — six markets on the case-study vault, twenty on the widest one in
// the catalogue — so a holder just under the row horizon would ask for tens of
// thousands of calls. This caps it at the NEWEST blocks of the life, and every
// row past the cap states its band as unread rather than drawing one. That is a
// statement about a figure, not about the life: every row is still drawn and
// still reconciled, because the gate replays the logs, not the allocation.
const ALLOCATION_BLOCKS = 80;

/** The blocks the allocation is read at: the newest `ALLOCATION_BLOCKS` of
 *  them. `blocks` arrives ascending, so the tail is the newest. */
const allocationBlocks = (blocks: bigint[]): number[] =>
  blocks.slice(Math.max(0, blocks.length - ALLOCATION_BLOCKS)).map((b) => Number(b));

const logsClientCache = { client: null as PublicClient | null };

/** The sweeps' own client, on the lane this file names. Built here rather than
 *  taken from `chainLogsClient(8453)` for the reason in the header. */
function backfillLogsClient(): PublicClient | null {
  const url = process.env[MORPHO_BASE_TIMELINE_LANE];
  if (!url) return null;
  if (!logsClientCache.client)
    logsClientCache.client = createPublicClient({
      chain: base as Chain,
      transport: http(url, { batch: false, retryCount: 2, timeout: 60_000 }),
    });
  return logsClientCache.client;
}

export interface MorphoBaseVaultTimelineOptions {
  /** THE block, pinned by the vault loader that already read it. */
  blockNumber: number;
  /** The vault's own creation block, from the catalogue. The Base lane refuses
   *  `0x0` on response size for a busy vault, and there is nothing to find
   *  before a vault exists. */
  fromBlock: number;
  /** The share token's own `decimals()`, read at the same block — the exponent
   *  each row's share price is asked with. MetaMorpho's `DECIMALS_OFFSET` puts
   *  it at 18 on every catalogued Base vault, and it is READ rather than
   *  assumed: `decimals()` is the asset's decimals plus that offset, and both
   *  are the vault's to answer. */
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
export interface MorphoBaseVaultTimelineResult {
  timeline: VaultHolderTimeline;
  /** Null when nothing may be stored: no rows, a failed gate, a withheld life,
   *  a floor, or a tail that is still fresh. */
  store: StoredVaultTail | null;
  /** EVERY row of the life, newest first — of which `timeline.events` is the
   *  newest `VAULT_TIMELINE_DRAW_ROWS`. The same array (by value) whenever the life fits, so a
   *  caller that always reads this one is always reading the whole life. It
   *  exists so that what reduces over a life reduces over the life: the
   *  lifetime-flows tower is computed from this on the server. Empty on every
   *  path that draws nothing. */
  allEvents: VaultHolderEvent[];
  /** Set only while a heavy life is being built into the store a chunk at a
   *  time. The caller queues it in `after()` AFTER the first PUT was accepted,
   *  handing it the same store client. See `chunkedBuilder`. */
  continueBuild: ((put: (tail: StoredVaultTail) => Promise<{ ok: boolean }>) => Promise<void>) | null;
}

/** A tail older than this many blocks below `finalized` is refreshed after the
 *  request that used it. Base runs at two seconds a block, so 300,000 blocks is
 *  about a week — the same cadence chain 1's 50,000 buys there. Not a
 *  correctness figure: the gate runs either way, and this only decides how much
 *  head a later request has to sweep. */
export const BASE_TAIL_REFRESH_BLOCKS = 300_000;
/** …and so is a head that came back with more rows than this. */
export const BASE_TAIL_REFRESH_ROWS = 200;

/** How long a chunked build waits before asking again for a block that would
 *  not answer. The state lane's client has already backed off for about seven
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
  if (tail.chainId !== BASE_CHAIN_ID) return null;
  if (tail.loaderVersion !== MORPHO_BASE_VAULT_TAIL_VERSION) return null;
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
  // never be below the number of rows. A tail that says otherwise would make
  // the merged reconcile state a log count smaller than the rows it drew,
  // which is a claim about the sweeps that the sweeps did not make.
  if (tail.logsIn + tail.logsOut < tail.rows.length) return null;
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
    console.error("MetaMorpho Base vault timeline: the finalized tag did not answer —", error);
    return null;
  }
}

/** How many of these logs are at or below the cut. */
const belowCut = (logs: RawLog[], cut: number): number =>
  logs.filter((l) => Number(BigInt(l.blockNumber)) <= cut).length;

/** The rows a store may keep, and their signed sum — computed the same way the
 *  store re-computes it on the way in, so a body this loader builds can only be
 *  refused if this arithmetic is wrong.
 *
 *  THE BAND IS STRIPPED HERE. What is kept is what a row IS — its transfer, its
 *  share price, its balance after — and never what the vault's asset sat in at
 *  that block, which every request re-reads over the newest rows. */
function candidateTail(
  eventsNewestFirst: VaultHolderEvent[],
  cut: number,
): { rows: VaultHolderEvent[]; cutBalance: string } {
  const rows = eventsNewestFirst
    .filter((r) => r.blockNumber <= cut)
    .slice()
    .reverse()
    .map((r) => ({ ...r, extra: BARE_EXTRA }));
  let sum = ZERO;
  for (const r of rows) sum += BigInt(r.sharesDelta);
  return { rows, cutBalance: sum.toString() };
}

/** A row's `extra` before the allocation read fills it — and the only shape a
 *  STORED row ever carries. Every field of it is unread, which is what it is. */
const BARE_EXTRA: MetaMorphoEventExtra = {
  kind: "metamorpho",
  totalSupplyAtBlock: null,
  holderSharesAtBlock: null,
  allocation: null,
  allocatedTotal: null,
};

/**
 * Read one holder's whole life in one MetaMorpho vault on Base, at one pinned
 * block, and reconcile it against the vault's own `balanceOf` before returning
 * a single row.
 *
 * `holder` must already be an address — name resolution belongs to the caller,
 * exactly as it does for `loadMorphoBaseVault`.
 *
 * Three outcomes are kept apart because they are three different facts, and the
 * page states each differently: a read that did not answer at all (`unread`), a
 * read that answered something that does not add up (`reconcile.reconciled`
 * false), and a life larger than this page draws (`coverage.withheldAbove`).
 */
export async function loadMorphoBaseVaultTimelineWithTail(
  vault: string,
  holder: string,
  opts: MorphoBaseVaultTimelineOptions,
): Promise<MorphoBaseVaultTimelineResult> {
  const address = vault.toLowerCase() as `0x${string}`;
  const who = holder.toLowerCase();
  const blockNumber = BigInt(opts.blockNumber);
  const tailsAllowed = opts.useTail !== false;

  const base_: VaultHolderTimeline = {
    vault: address,
    holder: who,
    blockNumber: opts.blockNumber,
    blockTimestamp: 0,
    unread: null,
    reconcile: null,
    history: { source: "chain", cut: null, tailRows: 0, headRows: 0, storedThisRequest: false },
    events: [],
    notes: [],
    coverage: { fromDeployment: true, logCount: 0, withheldAbove: null, logCountIsLowerBound: false },
  };

  const logs = backfillLogsClient();
  // "No endpoint configured" and "this address has no history" must never
  // render the same, so this is stated rather than answered with an empty list.
  if (!logs)
    return {
      timeline: { ...base_, unread: `${MORPHO_BASE_TIMELINE_LANE} is not set on this deployment` },
      store: null,
      allEvents: [],
      continueBuild: null,
    };

  try {
    const state = chainBatchClient(BASE_CHAIN_ID);

    /** One `eth_getLogs`, over an explicit range on the backfill lane. */
    const sweepRange = (topics: (string | null)[], from: number, to: bigint | number): Promise<RawLog[]> =>
      logs.request({
        method: "eth_getLogs",
        params: [{ address, topics, fromBlock: hexBlock(from), toBlock: hexBlock(to) }],
      } as never) as Promise<RawLog[]>;

    const sweepFrom = (from: number) => (topics: (string | null)[]) => sweepRange(topics, from, blockNumber);

    let tail = tailsAllowed ? usableTail(opts.tail, address, who, opts.blockNumber) : null;

    /** The two transfer directions over one range. */
    const readRange = async (from: number) => {
      const sweep = sweepFrom(from);
      const [outLogs, inLogs] = await Promise.all([
        sweep([TOPIC.transfer, topicOfAddress(who), null]).catch(() => null),
        sweep([TOPIC.transfer, null, topicOfAddress(who)]).catch(() => null),
      ]);
      return { outLogs, inLogs };
    };

    // The vault-wide notes are read over the WHOLE life whatever the tail says:
    // they are not this holder's events, they are never stored, and there are
    // one or two of them in a vault's life.
    const notesPromise = readNotes(sweepFrom(opts.fromBlock));

    // ⚠️ THE ROW FLOOR IS DERIVED, NEVER BOUND ONCE. It is `tail.cut + 1` while
    // a tail is trusted and the vault's own creation block the moment one is
    // discarded — and a tail can be discarded in two places below, after this
    // point. A constant captured here would leave the `Deposit`/`Withdraw`
    // sweeps inside `buildRows` starting at a cut that no longer applies, so a
    // re-swept whole life would come back with `assets: null` on nearly every
    // row AND that legless life would be what is offered to the store, which a
    // later warm request would then serve. That is a tail making a page WRONG,
    // which is the one thing this design says it cannot do. Read it as a
    // function of the CURRENT `tail`, every time.
    const rowFloor = () => (tail ? tail.cut + 1 : opts.fromBlock);
    const [head, finalized] = await Promise.all([
      readRange(rowFloor()),
      // Only read when a store could follow. `?tail=0` buys the cold path a
      // call as well as a sweep.
      tailsAllowed ? finalizedBlock(state) : Promise.resolve(null),
    ]);
    let { outLogs, inLogs } = head;

    // A HEAD SWEEP THAT REFUSED, WITH A TAIL IN HAND, IS NOT A FLOOR. The floor
    // path is what a WHOLE life the lane will not hand over looks like; a
    // refused head over a few hundred blocks is a bad minute on the lane. So
    // the tail is dropped and the whole life is asked for, which is the only
    // request that can tell the two apart.
    if ((outLogs === null || inLogs === null) && tail) {
      tail = null;
      const whole = await readRange(opts.fromBlock);
      outLogs = whole.outLogs;
      inLogs = whole.inLogs;
    }

    if (outLogs === null || inLogs === null) {
      // A refusal on this lane is a refusal on RESPONSE SIZE, which is itself
      // evidence the answer is large. Count what can be counted, stop at the
      // horizon, and withhold — never a partial list of the newest rows, and
      // never a stored tail: a floor is "at least N" and storing it would make
      // it "N".
      const counted = await countRefusedSweeps(
        (topics, from, to) => sweepRange(topics, from, to),
        [
          { topics: [TOPIC.transfer, topicOfAddress(who), null], answered: outLogs },
          { topics: [TOPIC.transfer, null, topicOfAddress(who)], answered: inLogs },
        ],
        opts.fromBlock,
        blockNumber,
      );
      const notes = await notesPromise;
      if (counted === null)
        return {
          timeline: {
            ...base_,
            notes,
            unread: "this address's share transfers on this vault could not be counted whole",
          },
          store: null,
          allEvents: [],
          continueBuild: null,
        };
      return {
        timeline: {
          ...base_,
          notes,
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

    // ── the gate ────────────────────────────────────────────────────────────
    const opening = () => (tail ? BigInt(tail.cutBalance) : ZERO);
    let transfers = mergeTransfers(outLogs, inLogs);
    let replayed = opening() + replayTransfers(transfers, who);
    let onChain = await balanceAt(state, address, who, blockNumber);
    let logsOut = outLogs.length;
    let logsIn = inLogs.length;
    let refetched = false;
    let refetchDiffered = false;

    if (replayed !== onChain) {
      // ONE re-fetch, on the same lane, after a pause — never a third attempt,
      // never a silent hop to the other lane, never a narrowed range. If the
      // second answer differs in COUNT that fact is itself the finding. With a
      // tail the re-fetch covers the HEAD only: the tail is a value, and
      // reading it again would return the same bytes.
      refetched = true;
      await new Promise((r) => setTimeout(r, 250));
      const again = await readRange(rowFloor());
      if (again.outLogs && again.inLogs) {
        const second = mergeTransfers(again.outLogs, again.inLogs);
        refetchDiffered = second.length !== transfers.length;
        outLogs = again.outLogs;
        inLogs = again.inLogs;
        transfers = second;
        logsOut = again.outLogs.length;
        logsIn = again.inLogs.length;
        replayed = opening() + replayTransfers(transfers, who);
        onChain = await balanceAt(state, address, who, blockNumber);
      }

      // STILL out. The tail is DISTRUSTED — not patched, not partly believed —
      // and the whole life is swept from the vault's creation block, which is
      // what this loader does when there is no tail at all. A tail can
      // therefore make a page slow and never wrong.
      if (replayed !== onChain && tail) {
        tail = null;
        const whole = await readRange(opts.fromBlock);
        if (whole.outLogs && whole.inLogs) {
          outLogs = whole.outLogs;
          inLogs = whole.inLogs;
          transfers = mergeTransfers(outLogs, inLogs);
          logsOut = outLogs.length;
          logsIn = inLogs.length;
          replayed = replayTransfers(transfers, who);
          onChain = await balanceAt(state, address, who, blockNumber);
        }
      }
    }

    const tailRows = tail ? tail.rows : [];

    const reconcile = {
      reconciled: replayed === onChain,
      replayed: replayed.toString(),
      onChain: onChain.toString(),
      logsIn: (tail ? tail.logsIn : 0) + logsIn,
      logsOut: (tail ? tail.logsOut : 0) + logsOut,
      refetched,
      refetchDiffered,
      lane: MORPHO_BASE_TIMELINE_LANE,
      fromBlock: opts.fromBlock,
      toBlock: opts.blockNumber,
      cutBalance: tail ? tail.cutBalance : null,
    };

    const blockTimestamp = Number((await state.getBlock({ blockNumber })).timestamp);
    const notes = await notesPromise;
    const history: VaultHistorySource = {
      source: tail ? "stored+head" : "chain",
      cut: tail ? tail.cut : null,
      tailRows: tailRows.length,
      headRows: 0,
      storedThisRequest: false,
    };
    const answered: VaultHolderTimeline = {
      ...base_,
      blockTimestamp,
      reconcile,
      history,
      notes,
      coverage: { ...base_.coverage, logCount: tailRows.length + transfers.length },
    };

    if (!reconcile.reconciled) return { timeline: answered, store: null, allEvents: [], continueBuild: null };

    const wholeCount = answered.coverage.logCount;
    const heavy = wholeCount > VAULT_TIMELINE_HORIZON;
    // A life can only be BUILT across requests if there is a store to build
    // into. `?tail=0` refuses both halves of it and a lane that will not name
    // its `finalized` block gives nothing to cut at, so on either the answer is
    // the one this loader has always given for a heavy life.
    const storable = tailsAllowed && finalized != null;

    // ── Tier 2: withheld, and the count stated ──────────────────────────────
    // Above what Rails stores, or with nowhere to store it. A count that is
    // only a LOWER BOUND — the refused-sweep path above — never reaches here at
    // all: it returns its own withholding, because a floor may not be built on.
    if (heavy && (wholeCount > tailMaxRows(BASE_CHAIN_ID) || !storable))
      return {
        timeline: { ...answered, coverage: { ...answered.coverage, withheldAbove: wholeCount } },
        store: null,
        allEvents: [],
        continueBuild: null,
      };

    // ── Tier 1: the head is too large to build in this request ──────────────
    // The blocks are the unit the row wave spends its two calls per, so the
    // test is over DISTINCT blocks and not over rows.
    const headBlocks = rowBlocksAscending(transfers);
    if (heavy && headBlocks.length > BUILD_BLOCKS_INLINE) {
      const builder = chunkedBuilder({
        state,
        address,
        who,
        opts,
        transfers,
        headBlocks,
        legSweep: sweepFrom(rowFloor()),
        tail,
        tailRows,
        finalized: finalized as number,
        inLogs,
        outLogs,
      });
      const next = await builder.next();
      const first = typeof next === "string" ? null : next;
      history.storedThisRequest = first != null;
      history.building = {
        keptRows: first ? first.rows.length : tailRows.length,
        keptCut: first ? first.cut : (tail?.cut ?? 0),
        totalRows: tailRows.length + transfers.length,
      };
      return {
        timeline: { ...answered, history, events: [] },
        store: first,
        allEvents: [],
        // Offered whenever there is something left to build — ALSO when this
        // request's first chunk stalled on a block that would not answer, so
        // the life is still built behind the response. The caller runs it
        // after its own PUT of `store` answered, or straight away when there
        // was no `store` to PUT.
        continueBuild: next === "done" ? null : builder.continueBuild,
      };
    }

    // The head's own rows, replayed from where the tail left off, then the
    // tail's under them — both already newest-first, and every head block is
    // above every tail block, so the concatenation IS the sorted order.
    // `rowFloor()` and not a captured constant: the two distrust paths above
    // may have set `tail` to null since it was first read, and the asset legs
    // must be swept over the same range these transfers were.
    const headRows = await buildRows(state, address, who, opts, transfers, sweepFrom(rowFloor()), opening());
    const merged = [...headRows, ...tailRows.slice().reverse()];
    history.headRows = headRows.length;

    // The band, read fresh over the newest rows of the MERGED list — never
    // stored, so a warm page and a cold one draw the same bands at the same
    // blocks.
    const allEvents = await attachAllocation(address, who, merged);

    // ── the candidate tail, if the rule fires ───────────────────────────────
    // THE STORE IS OFFERED ALL THE ROWS. The window below is taken after this
    // line, so what is kept is a whole life and what crosses to the client is a
    // slice of it.
    const store = finalized == null ? null : candidateTail(allEvents, finalized);
    // A ROW WHOSE BLOCK DID NOT ANSWER IS NOT STORED. `timestamp: 0` is the
    // placeholder the row grammar leaves when `eth_getBlockByNumber` refused —
    // and 0 is not an unread marker, it is 1 January 1970, so a page drawing a
    // stored one would state a date that is simply wrong. A row whose share
    // price did not answer is refused on the same terms: stored, it would never
    // be asked for again.
    const wholeRows = store != null && store.rows.every((r) => r.timestamp > 0 && r.sharePriceAtBlock != null);
    const stale = tail != null && finalized != null && finalized - tail.cut > BASE_TAIL_REFRESH_BLOCKS;
    const shouldStore =
      tailsAllowed &&
      store != null &&
      wholeRows &&
      finalized != null &&
      store.rows.length > 0 &&
      finalized > (tail?.cut ?? -1) &&
      (tail == null || stale || headRows.length > BASE_TAIL_REFRESH_ROWS);
    history.storedThisRequest = shouldStore;

    // ── the draw window, last ───────────────────────────────────────────────
    // A life at or under `VAULT_TIMELINE_DRAW_ROWS` is handed over whole and `coverage` is the
    // same object it was.
    const { events, drawn } = vaultDrawWindow(allEvents);
    const coverage = drawn ? { ...answered.coverage, drawn } : answered.coverage;

    return {
      timeline: { ...answered, coverage, history, events },
      allEvents,
      continueBuild: null,
      store: shouldStore
        ? {
            chainId: BASE_CHAIN_ID,
            vault: address,
            holder: who,
            loaderVersion: MORPHO_BASE_VAULT_TAIL_VERSION,
            cut: finalized as number,
            cutBalance: store!.cutBalance,
            // The whole-life `eth_getLogs` counts AT OR BELOW the cut — the
            // tail's own, plus this head's logs that have finalized since.
            logsIn: (tail ? tail.logsIn : 0) + belowCut(inLogs, finalized as number),
            logsOut: (tail ? tail.logsOut : 0) + belowCut(outLogs, finalized as number),
            lane: MORPHO_BASE_TIMELINE_LANE,
            storedAt: new Date().toISOString(),
            rows: store!.rows,
          }
        : null,
    };
  } catch (error) {
    console.error("MetaMorpho Base vault timeline: a read did not answer —", error);
    return {
      timeline: { ...base_, unread: "a read on this path did not answer" },
      store: null,
      allEvents: [],
      continueBuild: null,
    };
  }
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

// ── building a heavy life a chunk at a time ──────────────────────────────────

/** The DISTINCT blocks these transfers make rows at, ascending — the unit the
 *  row wave spends its two calls per, and so the unit a chunk is measured in. */
const rowBlocksAscending = (transfers: RawLog[]): number[] =>
  [...new Set(transfers.map((l) => Number(BigInt(l.blockNumber))))].sort((a, b) => a - b);

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
  opts: MorphoBaseVaultTimelineOptions;
  transfers: RawLog[];
  /** The head's own distinct row blocks, ascending. */
  headBlocks: number[];
  /** The sweep `buildRows` asks its two asset-leg questions with, over the same
   *  range these transfers were read over. */
  legSweep: (topics: (string | null)[]) => Promise<RawLog[]>;
  tail: StoredVaultTail | null;
  tailRows: VaultHolderEvent[];
  finalized: number;
  inLogs: RawLog[];
  outLogs: RawLog[];
}

/**
 * Build one heavy life into the store, oldest first, a chunk of blocks at a
 * time. The twin of the same function in aave-ethereum-vault-timeline.ts; its
 * header states the shared reasoning and only what is Base's own is repeated.
 *
 * THE SWEEPS ARE NEVER REPEATED — INCLUDING THE ASSET LEGS. Every transfer log
 * is already in hand when this is constructed, and the two `Deposit`/`Withdraw`
 * sweeps `buildRows` makes are asked ONCE here and answered from that one
 * answer for every chunk. So a continuation costs the backfill lane nothing.
 *
 * THE ALLOCATION BAND IS NOT ATTACHED HERE. It is capped at the newest blocks
 * of a life and a chunk builds the oldest, so a chunk's rows are stored bare
 * and the visit that draws reads the band over the merged rows, which is where
 * it has always been read.
 *
 * A BLOCK THAT DID NOT ANSWER ENDS THE CHUNK THERE, as on chain 1. A block
 * has answered when BOTH its reads have, the timestamp and the share price: a
 * `timestamp: 0` placeholder in the store would be 1 January 1970 on a page,
 * and a null price would stay unread for good. The chunk is stored up to the
 * block BEFORE the first one that did not answer, and the next attempt asks
 * only for the blocks no earlier attempt answered (`BlockReads`).
 * `verify-base-vault-cold-build.mjs` holds this against a lane that refuses.
 */
function chunkedBuilder(b: ChunkedBuild) {
  const buildable = b.headBlocks.filter((block) => block <= b.finalized);
  let built = b.tailRows.slice();
  let cut = b.tail ? b.tail.cut : -1;
  let taken = 0;
  const known = emptyBlockReads();

  // Asked once, answered from here on. `buildRows` calls this with the deposit
  // topic and then the withdraw one, and each is a whole-range answer already.
  const legs = new Map<string, Promise<RawLog[]>>();
  const legSweepOnce = (topics: (string | null)[]): Promise<RawLog[]> => {
    const key = String(topics[0]);
    const held = legs.get(key);
    if (held) return held;
    const asked = b.legSweep(topics);
    legs.set(key, asked);
    return asked;
  };

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
      legSweepOnce,
      openingBalance(),
      known,
    );

    // The chunk's blocks are ascending, so the answered prefix is every block
    // before the first one whose timestamp or share price did not come back.
    const firstUnread = firstUnreadBlock(blocks, known);
    const kept = firstUnread === -1 ? blocks.length : firstUnread;
    if (kept === 0) {
      console.error(
        `MetaMorpho Base vault timeline: block ${blocks[0]} would not answer; nothing above cut ${Math.max(cut, 0)} was stored`,
      );
      return "stalled";
    }
    const hi = blocks[kept - 1];
    if (kept < blocks.length)
      console.error(
        `MetaMorpho Base vault timeline: block ${blocks[kept]} would not answer; the chunk is stored to block ${hi}`,
      );

    built = [...built, ...rows.filter((r) => r.blockNumber <= hi).reverse()];
    cut = hi;
    taken += kept;

    const candidate = candidateTail(built.slice().reverse(), cut);
    return {
      chainId: BASE_CHAIN_ID,
      vault: b.address,
      holder: b.who,
      loaderVersion: MORPHO_BASE_VAULT_TAIL_VERSION,
      cut,
      cutBalance: candidate.cutBalance,
      logsIn: (b.tail ? b.tail.logsIn : 0) + belowCut(b.inLogs, cut),
      logsOut: (b.tail ? b.tail.logsOut : 0) + belowCut(b.outLogs, cut),
      lane: MORPHO_BASE_TIMELINE_LANE,
      storedAt: new Date().toISOString(),
      rows: candidate.rows,
    };
  };

  /** Keep building and storing until the head is built or the budget is spent.
   *  The clock is read BETWEEN chunks and never inside one. A stall is waited
   *  out, not ended on: the block that did not answer is asked again after
   *  `STALL_WAIT_MS`, only it and the ones after it no attempt has read. */
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
        console.error(
          `MetaMorpho Base vault timeline: the store refused the chunk at cut ${chunk.cut}; the build stops`,
        );
        return;
      }
    }
  };

  return { next, continueBuild };
}

// ── the rows ─────────────────────────────────────────────────────────────────

async function buildRows(
  client: PublicClient,
  vault: `0x${string}`,
  holder: string,
  opts: MorphoBaseVaultTimelineOptions,
  transfers: RawLog[],
  sweep: (topics: (string | null)[]) => Promise<RawLog[]>,
  /** Where the running balance starts. Zero on a whole-life sweep; the stored
   *  tail's `cutBalance` when these rows are a HEAD sitting on top of one, so
   *  `balanceAfter` on the oldest head row continues the tail's last row rather
   *  than restarting the life at zero. */
  openingBalance: bigint = ZERO,
  /** Block reads already answered on an earlier attempt, filled in by this one.
   *  A chunked build hands the same maps to every attempt at a chunk. */
  known: BlockReads = emptyBlockReads(),
): Promise<VaultHolderEvent[]> {
  // The asset leg is only asked for once the rows are going to be drawn: on the
  // withheld and unreconciled paths it would be two sweeps for nothing.
  // `owner` is topic2 on `Deposit` and topic3 on `Withdraw` — the ERC-4626
  // party whose shares moved, which is the one this page is about.
  const [depositLogs, withdrawLogs] = await Promise.all([
    sweep([TOPIC.deposit, null, topicOfAddress(holder)]),
    sweep([TOPIC.withdraw, null, null, topicOfAddress(holder)]),
  ]);
  const claimLeg = assetLegClaimer(depositLogs, withdrawLogs);

  // One entry per DISTINCT block: an address with two logs in one block must
  // not be asked the same question twice.
  const blocks = [...new Set(transfers.map((log) => BigInt(log.blockNumber).toString()))].map((b) => BigInt(b));

  // ONE batched wave: a timestamp and an archive share price per block, only
  // for the blocks no earlier attempt answered, with one retry over the misses
  // (./vault-block-reads). A call that does not answer leaves its figure
  // unread rather than borrowing the head's.
  //
  // The vault's SUPPLY at each block is not read here — it is wave 1 of the
  // allocation read below, which needs the same figure as its attribution
  // denominator. Reading it twice would be two calls that could answer two
  // things about one block, and the row's "share of the vault" and its
  // allocation band would then rest on different denominators.
  await readBlockWave(client, vault, opts.shareDecimals, blocks, known);
  const timestampAt = known.timestamps;
  const priceAt = known.prices;

  const rows: VaultHolderEvent[] = [];
  let balance = openingBalance;
  for (const log of transfers) {
    const from = addressOfTopic(log.topics[1]);
    const to = addressOfTopic(log.topics[2]);
    const value = BigInt(log.data);
    const key = BigInt(log.blockNumber).toString();

    let delta = ZERO;
    if (to === holder) delta += value;
    if (from === holder) delta -= value;
    balance += delta;

    const kind = classifyTransfer(from, to, holder);

    rows.push({
      id: `${log.transactionHash}:${Number(BigInt(log.logIndex))}`,
      txHash: log.transactionHash,
      blockNumber: Number(BigInt(log.blockNumber)),
      timestamp: timestampAt.get(key) ?? 0,
      logIndex: Number(BigInt(log.logIndex)),
      kind,
      counterparty: counterpartyOf(kind, from, to, holder),
      sharesDelta: delta.toString(),
      balanceAfter: balance.toString(),
      // Only a mint or a burn has an ERC-4626 leg to claim. A plain transfer
      // emits none, and stating one for it would be an invention.
      assets: kind === "deposit" || kind === "withdrawal" ? claimLeg(log.transactionHash, value) : null,
      sharePriceAtBlock: priceAt.get(key) ?? null,
      shareDecimals: opts.shareDecimals,
      assetDecimals: opts.assetDecimals,
      // Unread here, and filled by `attachAllocation` over the MERGED rows —
      // which is where the cap belongs, because the newest rows of a life are
      // not necessarily the newest rows of its head.
      extra: BARE_EXTRA,
    });
  }

  // NEWEST FIRST, which is the order every other Rails timeline renders in and
  // the order this object is served in — the API's array and the page's rows
  // are the same order, so a reader checking one against the other is checking
  // one claim. The REPLAY above runs ascending, because a running balance can
  // only be accumulated in the order the chain wrote the logs; the reversal is
  // the last thing that happens to it.
  return rows.reverse();
}

// ── the band, over the newest rows of the WHOLE life ─────────────────────────

/**
 * What the vault's asset sat in at each row's own block, and this address's
 * proportional slice of each market — read at that block and at no other.
 *
 * Capped at `ALLOCATION_BLOCKS` distinct blocks, newest first, and run over the
 * MERGED rows rather than over a swept head: on a warm request most of a life
 * comes out of the store, and reading the band over the head alone would leave
 * the newest rows on screen banded and the ones just below them unread, which
 * would be an artefact of the store rather than a fact about the chain.
 *
 * NOTHING HERE IS EVER STORED. A band is not a gate operand, so a stored one
 * would be a figure nothing checks; it is cheap to re-read and it is re-read.
 * A block the cap did not reach keeps `BARE_EXTRA` and states itself as unread.
 */
async function attachAllocation(
  vault: `0x${string}`,
  holder: string,
  eventsNewestFirst: VaultHolderEvent[],
): Promise<VaultHolderEvent[]> {
  if (eventsNewestFirst.length === 0) return eventsNewestFirst;
  // The rows arrive newest first; `allocationBlocks` takes the tail of an
  // ASCENDING list, so the list is built ascending here.
  const ascending = [...new Set(eventsNewestFirst.map((e) => e.blockNumber))]
    .sort((a, b) => a - b)
    .map((b) => BigInt(b));
  const allocation = await loadMorphoBaseVaultAllocationAt(vault, holder, allocationBlocks(ascending));
  return eventsNewestFirst.map((event) => {
    const at = allocation.get(event.blockNumber);
    if (!at) return event;
    const extra: MetaMorphoEventExtra = {
      kind: "metamorpho",
      totalSupplyAtBlock: at.totalSupply ?? null,
      holderSharesAtBlock: at.holderShares ?? null,
      // Null, not an empty list: a block the allocation read did not reach is
      // stated as unread, and an empty list would read as "in no market".
      allocation: at.unread ? null : at.legs,
      allocatedTotal: at.allocatedTotal ?? null,
    };
    return { ...event, extra };
  });
}

// ── the notes ────────────────────────────────────────────────────────────────

/**
 * The vault-wide configuration events: the ones that moved every holder's terms
 * at once, so they are notes rather than rows.
 *
 * Three, and each fires once or twice in a vault's whole life, which is why
 * they can be swept per request. `SetFee` moves what every holder's shares
 * accrue; `SetName` and `SetSymbol` are the two events that make a V1.1 vault's
 * name a READING at a block rather than an identity — 44 of the 505 catalogued
 * Base vaults already answer a different name than their creation log.
 *
 * Not read here, on purpose: `SetWithdrawQueue` (103 logs) and `SetCap` (11)
 * are the allocation's own shape, and this phase draws no allocation;
 * `SetFeeRecipient` names an address whose only business with an ordinary
 * holder is that it is never fetched; and `AccrueInterest` is the accrual
 * mechanic, read as a row nowhere.
 */
async function readNotes(sweep: (topics: (string | null)[]) => Promise<RawLog[]>): Promise<MorphoVaultNote[]> {
  const wanted: { topic: string; kind: MorphoVaultNote["kind"]; decode: (data: string) => Record<string, string> }[] = [
    {
      topic: TOPIC.setFee,
      kind: "fee",
      decode: (data) => ({
        newFee: decodeAbiParameters([{ type: "uint256" }], data as `0x${string}`)[0].toString(),
      }),
    },
    {
      topic: TOPIC.setName,
      kind: "vault-name",
      decode: (data) => ({ name: decodeAbiParameters([{ type: "string" }], data as `0x${string}`)[0] }),
    },
    {
      topic: TOPIC.setSymbol,
      kind: "vault-symbol",
      decode: (data) => ({ symbol: decodeAbiParameters([{ type: "string" }], data as `0x${string}`)[0] }),
    },
  ];

  const answers = await Promise.all(
    wanted.map((w) =>
      sweep([w.topic]).then(
        (logs) =>
          logs.map(
            (log): MorphoVaultNote => ({
              kind: w.kind,
              blockNumber: Number(BigInt(log.blockNumber)),
              // A note's own timestamp is not read: it would cost one call per
              // note for a line that names the block. The page names the block.
              timestamp: 0,
              txHash: log.transactionHash,
              fields: w.decode(log.data),
            }),
          ),
        () => [] as MorphoVaultNote[],
      ),
    ),
  );
  return answers.flat().sort((a, b) => a.blockNumber - b.blockNumber);
}
