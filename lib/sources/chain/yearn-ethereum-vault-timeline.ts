// One holder's life inside one Yearn V3 vault on Ethereum. SERVER-ONLY.
// ----------------------------------------------------------------------------
// The sibling of yearn-ethereum-vault.ts. That file reads the vault AT one
// block — idle, debt, share price, the withdrawal queue. This one reads how one
// address got to the balance it holds there: every `Transfer` the vault emitted
// about it, replayed into a running balance and checked against `balanceOf`
// before a single row is drawn.
//
// Yearn V3 IS ERC-4626, so the grammar is the shared one
// (lib/shared/vault-holder-timeline.ts) unchanged, and the log arithmetic is
// the shared one too (./vault-holder-logs.ts). What is Yearn's own is in this
// file and nowhere else: which lane, which `fromBlock`, and the exponent.
//
// ── THE SPINE IS `Transfer`, NOT `Deposit`/`Withdraw` ────────────────────────
// Three reasons, the same three the Aave reader states. A mint (`from == 0x0`)
// and a burn (`to == 0x0`) already identify a deposit and a withdrawal, so
// `Transfer` alone covers every share movement INCLUDING a plain
// holder-to-holder move, which `Deposit` and `Withdraw` do not emit at all.
// `Transfer` is the only event whose signed sum IS `balanceOf`, so it is the
// only one the gate can be built on. And it is the one event every ERC-4626
// vault emits for every share that moves, whoever moved it.
//
// `Deposit`/`Withdraw` are then a JOIN, matched on the TRANSACTION AND THE
// SHARE COUNT, so a row's asset leg is the contract's own `assets` word. Where
// no leg was emitted the row states its shares and says so; nothing is divided
// out of a share price and dressed as the contract's figure.
//
// ── THE GATE COMES FIRST ─────────────────────────────────────────────────────
// Nothing is drawn until the replayed balance equals `balanceOf` at the page's
// block, wei-exact. On a mismatch both figures are stated and NO rows are
// drawn — not a partial timeline, not one with a caveat. One re-fetch on the
// same lane after a pause, never a third and never a quiet hop to another lane.
// The reason is measured rather than theoretical: a wide-range logs lane has
// answered a whole-life query with HTTP 200 and an empty array where the true
// answer was six figures of logs, and no status code, timing or count tells
// that apart from a genuinely empty history.
//
// ── THE SHARE EXPONENT IS A READING, AND IT IS NOT 18 ────────────────────────
// A Yearn V3 vault's `decimals()` is its ASSET's decimals — the vault mirrors
// the token it takes, and it adds no offset of its own. That is where it parts
// company with MetaMorpho, whose factory mints shares at the asset's decimals
// PLUS a `DECIMALS_OFFSET()`. Most of the Yearn roster is 6-decimal assets, so
// a fixed `10 ** 18` would ask `convertToAssets` a question a trillion times
// too large and print the answer as a share price. The exponent here is
// therefore the vault's own `decimals()`, READ at the page's block by the
// caller and passed in — never assumed from the asset and never defaulted.
// `verify-ethereum-yearn-vault-timeline.mjs`'s break test Y2 is the guard.
//
// ── WHAT IS NOT READ, ON PURPOSE ─────────────────────────────────────────────
// `StrategyReported` fires on every harvest, `UpdateDebt` on every rebalance:
// they are the mechanic behind each row's share price, named in that figure's
// receipt, and neither is an event of this holder's. No vault-wide notes are
// read either — Yearn's configuration events (`UpdateAccountant`,
// `UpdateProfitMaxUnlockTime`, `Shutdown`) are real and would be legitimate
// notes, and the day one earns a place it is added here with its own receipt
// beside the mechanic it describes. `notes` is an empty array until then, which
// is a different claim from a note being hidden.
//
// NO USD, NO APY, NO RATE OF RETURN, NO SERIES. Each row's share price is a
// read at a block the HOLDER chose by transacting. No field here holds a
// difference between two of them, so a renderer has nothing to draw the curve
// through blocks nobody chose that decision `0017` §6 refuses.
//
// ── NO STORED TAIL, AND THAT IS A CHOICE ─────────────────────────────────────
// The Aave reader keeps a tail in Rails's store because chain-1 vault lives run
// to five figures of logs. This one sweeps the whole life every request, the
// way the MetaMorpho reader on Base does. The sweep is not the cost — an
// address-filtered `eth_getLogs` over one contract answers in a few hundred
// milliseconds — and a store is a second place a reading can be wrong. A Yearn
// life long enough to want one can have one, at which point it earns a
// `YEARN_VAULT_TAIL_VERSION` beside the other two; adding the constant before a
// fixture needs it would be a version number for a store nothing writes to.
//
// ── WHEN THE LANE REFUSES A SWEEP ON RESPONSE SIZE ───────────────────────────
// Chain 1's logs lane refuses a one-direction `eth_getLogs` past 10,000 logs. A
// refusal there is not an unread history: it is evidence the history is LARGE.
// So each sweep catches to null, and a refused TRANSFER direction falls back to
// the chunked counting walk in ./vault-sweep-walk.ts, shared with the other two
// readers. The rows are withheld with the count stated as a FLOOR. A `Deposit`
// or `Withdraw` sweep that refuses WHILE THE TRANSFERS ANSWERED is a different
// thing and is stated as unread: every leg has its own `Transfer` in one of the
// two directions that just came back, so the leg sweeps are bounded by sweeps
// this lane answered and a refusal over a strictly smaller answer says nothing
// about size.

import { parseAbi, type PublicClient } from "viem";
import { chainBatchClient, chainLogsClient } from "./rpc";
import {
  ERC4626_TOPIC,
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
import { chainMeta } from "@/lib/shared/chains";
import { YEARN_CHAIN_ID } from "./yearn-ethereum-vault-directory";
import {
  VAULT_TIMELINE_HORIZON,
  vaultDrawWindow,
  tailMaxRows,
  type VaultHolderEvent,
  type VaultHolderTimeline,
} from "@/lib/shared/vault-holder-timeline";

const ZERO = BigInt(0);

const VAULT_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
]);

export interface YearnVaultTimelineOptions {
  /** THE block, pinned by the vault loader that already read it. Nothing here
   *  passes `"latest"`: the reading and the history are one claim about one
   *  moment, and two `eth_blockNumber` calls a second apart are two moments. */
  blockNumber: number;
  /** The vault's own `decimals()`, read at the same block — the exponent every
   *  row's share price is asked with. On Yearn V3 it is the ASSET's decimals;
   *  see the header on why that must be read rather than assumed. */
  shareDecimals: number;
  assetDecimals: number;
  /** The block the vault's creation log sits in, from the catalogue. The sweeps
   *  start here rather than at block 0: the vault emitted no log before it
   *  existed, so this is the same answer for a fraction of the range, and it is
   *  what makes `coverage.fromDeployment` a statement rather than a hope. */
  createdBlock: number;
}

export interface YearnVaultTimelineResult {
  timeline: VaultHolderTimeline;
  /** EVERY row of the life, newest first — of which `timeline.events` is the
   *  newest `VAULT_TIMELINE_DRAW_ROWS`. It exists so that what reduces over a
   *  life reduces over the life: the lifetime-flows tower is computed from this
   *  on the server rather than the client being handed rows to sum. Empty on
   *  every path that draws nothing. */
  allEvents: VaultHolderEvent[];
}

/**
 * Read one holder's whole life in one Yearn V3 vault at one pinned block, and
 * reconcile it against the vault's own `balanceOf` before returning a row.
 *
 * `holder` must already be an address — name resolution belongs to the caller.
 *
 * Three outcomes are kept apart because they are three different facts. A read
 * that did not answer comes back with `unread` set and no rows. A read that
 * answered but did not reconcile comes back with `reconcile.reconciled` false
 * and no rows. A sweep the lane REFUSED comes back withheld with a stated
 * floor. "The lane would not answer", "the lane answered something that does
 * not add up" and "the life is at least this long" must never render the same.
 */
export async function loadYearnEthereumVaultTimeline(
  vault: string,
  holder: string,
  opts: YearnVaultTimelineOptions,
): Promise<YearnVaultTimelineResult> {
  const address = vault.toLowerCase() as `0x${string}`;
  const who = holder.toLowerCase();
  const blockNumber = BigInt(opts.blockNumber);
  const lane = chainMeta(YEARN_CHAIN_ID).logsRpcEnv;
  const from = Math.max(0, opts.createdBlock);

  const empty = (unread: string | null): YearnVaultTimelineResult => ({
    timeline: {
      vault: address,
      holder: who,
      blockNumber: opts.blockNumber,
      blockTimestamp: 0,
      unread,
      reconcile: null,
      events: [],
      notes: [],
      coverage: { fromDeployment: true, logCount: 0, withheldAbove: null, logCountIsLowerBound: false },
    },
    allEvents: [],
  });

  try {
    const logs = chainLogsClient(YEARN_CHAIN_ID);
    const state = chainBatchClient(YEARN_CHAIN_ID);

    const sweep: LogSweep = (topics) =>
      logs.request({
        method: "eth_getLogs",
        params: [{ address, topics, fromBlock: hex(from), toBlock: hex(blockNumber) }],
      } as never) as Promise<RawLog[]>;

    /** The four sweeps this life is made of.
     *
     *  EACH ONE CATCHES TO NULL RATHER THAN THROWING. A refusal is a fact about
     *  ONE sweep and the caller decides what it means; a throw here would fall
     *  to the outer catch and make every refusal an unread history, which is
     *  what the counting walk below exists to stop. Null is "this direction did
     *  not come back", never "this direction is empty". */
    const readAll = async () => {
      const [outLogs, inLogs, depositLogs, withdrawLogs] = await Promise.all([
        sweep([ERC4626_TOPIC.transfer, topicOf(who), null]).catch(() => null),
        sweep([ERC4626_TOPIC.transfer, null, topicOf(who)]).catch(() => null),
        // `owner` is topic2 on Deposit and topic3 on Withdraw — the ERC-4626
        // party whose shares moved, which is the one this page is about.
        sweep([ERC4626_TOPIC.deposit, null, topicOf(who)]).catch(() => null),
        sweep([ERC4626_TOPIC.withdraw, null, null, topicOf(who)]).catch(() => null),
      ]);
      return { outLogs, inLogs, depositLogs, withdrawLogs };
    };

    let { outLogs, inLogs, depositLogs, withdrawLogs } = await readAll();

    if (outLogs === null || inLogs === null) {
      // A refusal on this lane is a refusal on RESPONSE SIZE, which is itself
      // evidence the answer is large. Count what can be counted, stop at the
      // horizon, and withhold: never a partial list of the newest rows.
      //
      // ONLY THE TRANSFER DIRECTIONS ARE WALKED. They are the spine — every
      // share movement is one of them — so a floor over the two is a floor over
      // the life.
      const counted = await countRefusedSweeps(
        (topics, lo, hi) =>
          logs.request({
            method: "eth_getLogs",
            params: [{ address, topics, fromBlock: hex(lo), toBlock: hex(hi) }],
          } as never) as Promise<RawLog[]>,
        [
          { topics: [ERC4626_TOPIC.transfer, topicOf(who), null], answered: outLogs },
          { topics: [ERC4626_TOPIC.transfer, null, topicOf(who)], answered: inLogs },
        ],
        from,
        blockNumber,
      );
      if (counted === null) return empty("this address's share transfers on this vault could not be counted whole");
      return {
        timeline: {
          ...empty(null).timeline,
          coverage: {
            fromDeployment: true,
            logCount: counted.count,
            withheldAbove: counted.count,
            logCountIsLowerBound: !counted.exact,
          },
        },
        allEvents: [],
      };
    }

    // A LEG SWEEP THAT REFUSED WHILE THE TRANSFERS ANSWERED IS A LANE FAULT,
    // NOT A SIZE FACT, so it is stated as unread rather than counted. Every
    // `Deposit` mints shares and every `Withdraw` burns them, so each has its
    // own `Transfer` in one of the two directions that just came back.
    if (depositLogs === null || withdrawLogs === null)
      return empty("this address's deposit and withdrawal events on this vault did not answer");

    // ── the gate ──────────────────────────────────────────────────────────────
    let transfers = mergeTransfers(outLogs, inLogs);
    let replayed = replay(transfers, who);
    let onChain = await balanceAt(state, address, who, blockNumber);
    let refetched = false;
    let refetchDiffered = false;

    if (replayed !== onChain) {
      // ONE re-fetch, on the same lane, after a pause — never a third attempt,
      // never a silent hop to another lane, never a narrowed range. If the
      // second answer differs in COUNT that fact is itself the finding, and it
      // is stated on the page.
      refetched = true;
      await new Promise((r) => setTimeout(r, 250));
      const again = await readAll();
      // A SECOND READING IS TAKEN WHOLE OR NOT AT ALL. One of its sweeps
      // refusing leaves the first reading standing — the gate then states the
      // mismatch it already found, which is a fact, rather than one computed
      // from a half-replaced set of logs.
      if (again.outLogs && again.inLogs && again.depositLogs && again.withdrawLogs) {
        const second = mergeTransfers(again.outLogs, again.inLogs);
        refetchDiffered = second.length !== transfers.length;
        outLogs = again.outLogs;
        inLogs = again.inLogs;
        depositLogs = again.depositLogs;
        withdrawLogs = again.withdrawLogs;
        transfers = second;
        replayed = replay(transfers, who);
        onChain = await balanceAt(state, address, who, blockNumber);
      }
    }

    const reconcile = {
      reconciled: replayed === onChain,
      replayed: replayed.toString(),
      onChain: onChain.toString(),
      logsIn: inLogs.length,
      logsOut: outLogs.length,
      refetched,
      refetchDiffered,
      lane,
      fromBlock: from,
      toBlock: opts.blockNumber,
    };

    const blockTimestamp = Number((await state.getBlock({ blockNumber })).timestamp);
    const base: VaultHolderTimeline = {
      vault: address,
      holder: who,
      blockNumber: opts.blockNumber,
      blockTimestamp,
      unread: null,
      reconcile,
      events: [],
      notes: [],
      coverage: {
        fromDeployment: true,
        logCount: transfers.length,
        withheldAbove: null,
        logCountIsLowerBound: false,
      },
    };

    if (!reconcile.reconciled) return { timeline: base, allEvents: [] };

    // Above the horizon the rows are withheld and the count stated. The life
    // was READ and RECONCILED — what is withheld is the drawing of it — because
    // each row costs an `eth_getBlockByNumber` and an archive `convertToAssets`
    // at its own block, and nobody waits a minute for a page. With no store to
    // build into, `tailMaxRows` is not the bound here; the inline horizon is.
    if (transfers.length > VAULT_TIMELINE_HORIZON)
      return {
        timeline: { ...base, coverage: { ...base.coverage, withheldAbove: transfers.length } },
        allEvents: [],
      };

    const allEvents = await buildRows(state, address, who, opts, transfers, depositLogs, withdrawLogs);

    // ── the draw window, last ─────────────────────────────────────────────────
    // THE WINDOW IS THE LAST THING THAT HAPPENS. Everything that reduces over a
    // life — the gate above, and the lifetime-flows tower the page computes —
    // reads the whole array before this slice is taken, so no aggregate on the
    // page is a window's arithmetic.
    const { events, drawn } = vaultDrawWindow(allEvents);
    return {
      timeline: { ...base, coverage: drawn ? { ...base.coverage, drawn } : base.coverage, events },
      allEvents,
    };
  } catch (error) {
    console.error("Yearn Ethereum vault timeline: a read did not answer —", error);
    return empty("a read on this path did not answer");
  }
}

/** The ceiling a withheld life is measured against on the page. Stated here so
 *  the reader and the renderer name one figure: with no stored tail on this
 *  arm, what bounds a drawn life is what one request will BUILD inline. */
export const YEARN_VAULT_TIMELINE_CEILING = VAULT_TIMELINE_HORIZON;

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
  opts: YearnVaultTimelineOptions,
  transfers: RawLog[],
  depositLogs: RawLog[],
  withdrawLogs: RawLog[],
): Promise<VaultHolderEvent[]> {
  // One entry per DISTINCT block: a holder with two logs in one block must not
  // be asked the same question twice.
  const rowBlocks = new Set<string>();
  for (const log of transfers) rowBlocks.add(BigInt(log.blockNumber).toString());
  const blocks = [...rowBlocks].map((b) => BigInt(b));

  // ONE batched wave: a timestamp and an archive share price per block. The
  // price is asked with 10 ** the vault's OWN `decimals()` — see the header — and
  // a call that does not answer leaves the figure UNREAD rather than borrowing
  // the head price.
  //
  // ONE RETRY OVER THE MISSES, and only the misses: a first wave over a few
  // thousand blocks comes back with a handful of refusals on a metered lane,
  // and a second pass over just those recovers nearly all of them.
  const one = BigInt(10) ** BigInt(opts.shareDecimals);
  const readTimestamp = (blockNumber: bigint) =>
    client
      .getBlock({ blockNumber })
      .then((b) => Number(b.timestamp))
      .catch(() => null);
  const readPrice = (blockNumber: bigint) =>
    client
      .readContract({ address: vault, abi: VAULT_ABI, functionName: "convertToAssets", args: [one], blockNumber })
      .then((v) => (v as bigint).toString())
      .catch(() => null);

  const retryMisses = async <T>(first: (T | null)[], read: (b: bigint) => Promise<T | null>): Promise<(T | null)[]> => {
    const misses = first.flatMap((v, i) => (v == null ? [i] : []));
    if (misses.length === 0) return first;
    await new Promise((r) => setTimeout(r, 300));
    const second = await Promise.all(misses.map((i) => read(blocks[i])));
    const out = first.slice();
    misses.forEach((i, k) => (out[i] = second[k]));
    return out;
  };

  const [timestamps, prices] = await Promise.all([
    Promise.all(blocks.map(readTimestamp)).then((first) => retryMisses(first, readTimestamp)),
    Promise.all(blocks.map(readPrice)).then((first) => retryMisses(first, readPrice)),
  ]);
  const timestampAt = new Map(blocks.map((b, i) => [b.toString(), timestamps[i]]));
  const priceAt = new Map(blocks.map((b, i) => [b.toString(), prices[i]]));

  // The asset leg, claimed once each: a transaction that ever carries two of
  // this owner's legs pairs them by share count rather than handing both rows
  // the first one.
  const claimLeg = assetLegClaimer(depositLogs, withdrawLogs);

  const rows: VaultHolderEvent[] = [];
  let balance = ZERO;
  for (const log of transfers) {
    const fromAddr = addrOf(log.topics[1]);
    const to = addrOf(log.topics[2]);
    const value = BigInt(log.data);
    const blockNumber = Number(BigInt(log.blockNumber));
    const key = BigInt(log.blockNumber).toString();

    let delta = ZERO;
    if (to === holder) delta += value;
    if (fromAddr === holder) delta -= value;
    balance += delta;

    // The kind is decided by the zero address, never by a label — and a log
    // whose two ends are both this holder is its own case, because calling it
    // an arrival would say shares came from somewhere.
    const kind = classifyTransfer(fromAddr, to, holder);

    rows.push({
      id: `${log.transactionHash}:${Number(BigInt(log.logIndex))}`,
      txHash: log.transactionHash,
      blockNumber,
      timestamp: timestampAt.get(key) ?? 0,
      logIndex: Number(BigInt(log.logIndex)),
      kind,
      counterparty: counterpartyOf(kind, fromAddr, to, holder),
      sharesDelta: delta.toString(),
      balanceAfter: balance.toString(),
      // Only a mint or a burn has an ERC-4626 leg to claim. A plain transfer
      // emits none, and stating one for it would be an invention.
      assets: kind === "deposit" || kind === "withdrawal" ? claimLeg(log.transactionHash, value) : null,
      sharePriceAtBlock: priceAt.get(key) ?? null,
      shareDecimals: opts.shareDecimals,
      assetDecimals: opts.assetDecimals,
      // ⚠️ NO FAMILY ARM. Yearn's candidates — the withdrawal queue and
      // `profitMaxUnlockTime` — are VAULT-wide facts, true of every holder at
      // once, and neither is a figure this row could state about this address.
      // An arm is added when a fixture proves a reader needs one, which is how
      // Aave's cooldown and MetaMorpho's denominator each earned theirs.
    });
  }

  // NEWEST FIRST, which is the order every other Rails timeline renders in, so
  // this array and the rows on screen are one claim rather than two. The REPLAY
  // above runs ascending, because a running balance can only be accumulated in
  // the order the chain wrote the logs; the reversal is the last thing that
  // happens to it.
  return rows.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
}
