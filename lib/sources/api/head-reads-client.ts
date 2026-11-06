// The head readers' chain client, asked of rails-server first.
// ----------------------------------------------------------------------------
// rails-server's `/api/at-block/head/block` names the block a head read pins,
// one per chain per 30 s, and `/api/at-block/head/reads` answers a round of
// calls, codes and storage words at that block, each round read once on the
// keyless gateway first and the paid leg last (rails-ops decisions/0056 step 3,
// census rank 12 stages 7 and 8; the server half is api/src/services/vault-head.ts,
// which also answers the two keys at `/api/at-block/vault/head` and `/reads`).
// The readers keep their code: this is the client they read through. Two
// entries share it: `headReadsClient` for the single-page families (Maker,
// Dolomite, LlamaLend, Frankencoin, Liquity V1, Maple's pools, f(x), Fluid),
// which read the chain through `chainClient` when the route cannot answer, and
// `vaultHeadClient` for the vault pages, directories, holders and the listing
// overlay, which read it through `chainBatchClient`. It answers
// `getBlockNumber`, `getBlock` (latest and finalized), `readContract`,
// `multicall`, `call`, `getCode` and `getStorageAt` with what the chain client
// answers, decoded here with the same ABI and the rules viem applies to a
// chain answer, so a reader's figures are the ones it would compute reading
// the chain at that block. Every other method is the chain client's.
//
// Concurrent reads at one block go as one round: a reader's `Promise.all` of
// `readContract`s is one request, as viem would batch a multicall; a round
// stays inside the route's caps (`MAX_ROUND_READS`, `MAX_ROUND_CHARS`). A read
// without a block is pinned to rails-server's block. A read at a block
// rails-server did not name, or one the route cannot answer (no RAILS_API_URL,
// a refused connection, a non-2xx answer, 3 s without a head or 8 s without a
// round), is the chain read as before, at the same block; after a 5xx, 429,
// refusal or timeout the chain is read for 30 s without asking
// (`route-gate.ts`). The head waits 3 s so that a slow api leaves a server
// render's 8 s budget (`position-tail-page-data.ts`) time for the chain read.
//
// A build or an ISR render asks each round with `wait: 6000`: rails-server's
// keyless gate holds the round up to 6 s for a slot before the paid leg, so a
// build's burst of prerenders queues on the gateway. A request render sends no
// `wait` (the server's 2 s). The round's 8 s timeout stays above the 6 s.
//
// `recordingHeadClient` is `headReadsClient` that also collects the `round`
// ids rails-server gave the rounds one loader's reads went in, and
// `snapshotClient` answers the same calls from a surface's stored snapshot
// (both for lib/sources/api/head-snapshot.ts, ui-jobs 467).
//
// SERVER-ONLY.

import { decodeFunctionResult, encodeFunctionData, type Abi, type Hex, type PublicClient } from "viem";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { chainBatchClient, chainClient } from "@/lib/sources/chain/rpc";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";
import { noteChainRead, noteServerHead } from "./server-head-stamps";
import { ROUTE_WAIT_MS, routeGate } from "./route-gate";
// Next's internal work-unit store (not a public API; next 16.4.5). A Next upgrade that moves
// this module fails the build at this import. One that keeps the module but renames the
// prerender store types leaves renderWait() sending no wait: rails-server then keeps its 2 s
// default, so builds and ISR renders overflow to the paid leg sooner.
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external.js";

const TIMEOUT_MS = 8_000;
/** The head is one small cached answer: past this, the api is taken as down. */
const HEAD_TIMEOUT_MS = ROUTE_WAIT_MS;
/** How long a block rails-server named is read there: inside its two-minute acceptance. */
const NAMED_MS = 90_000;
/** One head answer serves the reads that start within this long of it. */
const HEAD_REUSE_MS = 5_000;
/** The route's MAX_READS: rounds asked together are split to stay under it. */
const MAX_ROUND_READS = 1_500;
/** Under the route's 512 kb body limit, with room for the envelope. */
const MAX_ROUND_CHARS = 480_000;
/** A build's or ISR render's gate wait on rails-server (its clamp's top). */
const STATIC_RENDER_WAIT_MS = 6_000;

/** `{ wait }` for a build or an ISR render, else nothing. Next 16 renders both under a prerender
 *  work-unit store (`prerender-legacy` without Cache Components); the build phase covers a read
 *  outside a render's store. A read inside `unstable_cache` sees the cache's own store and sends
 *  no wait. */
function renderWait(): { wait?: number } {
  if (process.env.NEXT_PHASE === "phase-production-build") return { wait: STATIC_RENDER_WAIT_MS };
  const type = workUnitAsyncStorage.getStore()?.type;
  return type === "prerender-legacy" || type === "prerender" ? { wait: STATIC_RENDER_WAIT_MS } : {};
}

type RawRead =
  | { kind: "call"; to: string; data: Hex; from?: string }
  | { kind: "code"; address: string }
  | { kind: "storage"; address: string; slot: string };
type CallAnswer = { success: boolean; returnData: Hex };
type RawAnswer = CallAnswer | { hex: Hex };

interface HeadAnswer {
  blockNumber: number;
  blockTimestamp: number;
  finalizedBlock?: number | null;
  head?: PositionHeadStamp;
}

const named = new Map<number, Map<bigint, number>>();
const heads = new Map<string, { at: number; p: Promise<HeadAnswer | null> }>();
const gate = routeGate();

function remember(chainId: number, block: bigint) {
  let m = named.get(chainId);
  if (!m) named.set(chainId, (m = new Map()));
  m.set(block, Date.now());
  for (const [b, at] of m) if (Date.now() - at > NAMED_MS) m.delete(b);
}

const isNamed = (chainId: number, block: bigint | null | undefined): block is bigint => {
  if (block == null) return false;
  const at = named.get(chainId)?.get(block);
  return at != null && Date.now() - at <= NAMED_MS;
};

function ask<T>(chainId: number, path: string, body?: unknown, timeoutMs = TIMEOUT_MS): Promise<T | null> {
  return gate.json<T>(
    String(chainId),
    `${process.env.RAILS_API_URL}/api/at-block/head/${path}`,
    createAuthFetchOptions(
      body === undefined
        ? undefined
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    ),
    { timeoutMs },
  );
}

const headKey = (chainId: number, finalized: boolean) => `${chainId}:${finalized ? "f" : "h"}`;

/** rails-server's block for the chain (and its finalized block when asked); one request serves the reads of the next few seconds. */
function serverHead(chainId: number, finalized = false): Promise<HeadAnswer | null> {
  const key = headKey(chainId, finalized);
  const hit = heads.get(key);
  if (hit && Date.now() - hit.at < HEAD_REUSE_MS) return hit.p;
  const p = ask<HeadAnswer>(
    chainId,
    `block?chain=${chainId}${finalized ? "&finalized=1" : ""}`,
    undefined,
    HEAD_TIMEOUT_MS,
  ).then((h) => {
    if (!h || typeof h.blockNumber !== "number" || typeof h.blockTimestamp !== "number") {
      heads.delete(key);
      return null;
    }
    remember(chainId, BigInt(h.blockNumber));
    noteServerHead(chainId, h.blockNumber, h.head);
    return h;
  });
  heads.set(key, { at: Date.now(), p });
  return p;
}

// ── rounds: the reads asked at one block in one turn go as one request ──────

/** A round's answers to one reader's reads, and the id rails-server gave the round. */
interface Served {
  answers: RawAnswer[];
  round?: string;
}

interface Pending {
  reads: RawRead[];
  resolve: (served: Served | null) => void;
}

const queues = new Map<string, Pending[]>();

function serverReads(chainId: number, block: bigint, reads: RawRead[]): Promise<Served | null> {
  const key = `${chainId}:${block}`;
  return new Promise((resolve) => {
    let q = queues.get(key);
    if (!q) {
      queues.set(key, (q = []));
      setTimeout(() => void flush(chainId, block, key), 0);
    }
    q.push({ reads, resolve });
  });
}

const answers = (r: RawRead, a: unknown): boolean =>
  a != null && typeof a === "object" && (r.kind === "call" ? "success" in a : "hex" in a);

/** The turn's reads in rounds under the route's caps; a reader's own reads are never split. */
function rounds(q: Pending[]): Pending[][] {
  const out: Pending[][] = [];
  let cur: Pending[] = [];
  let n = 0;
  let chars = 0;
  for (const p of q) {
    const c = JSON.stringify(p.reads).length;
    if (cur.length > 0 && (n + p.reads.length > MAX_ROUND_READS || chars + c > MAX_ROUND_CHARS)) {
      out.push(cur);
      cur = [];
      n = 0;
      chars = 0;
    }
    cur.push(p);
    n += p.reads.length;
    chars += c;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

async function flush(chainId: number, block: bigint, key: string) {
  const q = queues.get(key) ?? [];
  queues.delete(key);
  await Promise.all(rounds(q).map((round) => askRound(chainId, block, round)));
}

async function askRound(chainId: number, block: bigint, q: Pending[]) {
  const reads = q.flatMap((p) => p.reads);
  const r = await ask<{ blockNumber?: unknown; answers?: unknown; round?: unknown }>(chainId, "reads", {
    chain: chainId,
    block: Number(block),
    reads,
    ...renderWait(),
  });
  const ok =
    r != null &&
    r.blockNumber === Number(block) &&
    Array.isArray(r.answers) &&
    r.answers.length === reads.length &&
    r.answers.every((a, i) => answers(reads[i], a));
  const round = typeof r?.round === "string" && r.round !== "" ? r.round : undefined;
  let i = 0;
  for (const p of q) {
    const n = p.reads.length;
    p.resolve(ok ? { answers: (r!.answers as RawAnswer[]).slice(i, i + n), round } : null);
    i += n;
  }
}

// ── decoding, as viem decodes a chain answer ────────────────────────────────

type Contract = { address: string; abi: Abi | readonly unknown[]; functionName: string; args?: readonly unknown[] };
type Settled = { status: "success"; result: unknown } | { status: "failure"; error: Error; result: undefined };

function rawCall(c: Contract, from?: string): RawRead {
  const data = encodeFunctionData({ abi: c.abi as Abi, functionName: c.functionName, args: c.args } as never);
  return from
    ? { kind: "call", to: c.address.toLowerCase(), data, from: from.toLowerCase() }
    : { kind: "call", to: c.address.toLowerCase(), data };
}

/** One answer decoded as viem's multicall decodes an aggregate3 result (and readContract an eth_call's). */
function settle(c: Contract, a: CallAnswer): Settled {
  if (!a.success) return { status: "failure", error: new Error(`${c.functionName} reverted`), result: undefined };
  try {
    if (a.returnData === "0x") throw new Error(`${c.functionName} returned no data`);
    const result = decodeFunctionResult({
      abi: c.abi as Abi,
      functionName: c.functionName,
      args: c.args,
      data: a.returnData,
    } as never);
    return { status: "success", result };
  } catch (error) {
    return { status: "failure", error: error as Error, result: undefined };
  }
}

type At = { blockNumber?: bigint; blockTag?: string };
type Account = string | { address: string } | undefined;
type ReadContractArgs = Contract & At & { account?: Account };
type MulticallArgs = { contracts: readonly Contract[]; allowFailure?: boolean } & At;

const fromOf = (account: Account) => (typeof account === "string" ? account : account?.address);

/** The chain read's arguments, pinned to the block the read stands at. */
const pin = <T extends At>(args: T, block: bigint | null): T =>
  block != null ? { ...args, blockNumber: block, blockTag: undefined } : args;

let override: ((chainId: ChainId) => PublicClient) | null = null;

/** The equality check's seam (scripts/verify/head-reads-equality.ts): every
 *  `headReadsClient()` and `vaultHeadClient()` answers with `fn`'s client until it is cleared. */
export function overrideHeadReadsClient(fn: ((chainId: ChainId) => PublicClient) | null): void {
  override = fn;
}

/** The block rails-server last named for the chain, for the equality check. */
export async function lastServerHead(chainId: ChainId = MAINNET_CHAIN_ID): Promise<number | null> {
  return (await heads.get(headKey(chainId, false))?.p)?.blockNumber ?? null;
}

/** Where a client's head and reads come from before its fallback: rails-server's
 *  live routes, or a snapshot it stored (`snapshotClient`). */
interface ReadSource {
  head(finalized: boolean): Promise<HeadAnswer | null>;
  /** True for a block this source answers reads at. */
  answersAt(block: bigint | null): block is bigint;
  reads(block: bigint, reads: RawRead[]): Promise<RawAnswer[] | null>;
  /** A read (or the head) went to the fallback, at `block` where it had one. */
  fellBack(block: bigint | null): void;
}

/**
 * The chain client a head reader reads through: `source`'s head and reads
 * where it answers, `chain` everywhere else.
 */
function sourcedClient(source: ReadSource, chain: PublicClient): PublicClient {
  const own = {
    async getBlockNumber(): Promise<bigint> {
      const h = await source.head(false);
      if (h) return BigInt(h.blockNumber);
      source.fellBack(null);
      return chain.getBlockNumber();
    },
    async getBlock(args?: At) {
      if (args?.blockNumber == null && (args?.blockTag == null || args.blockTag === "latest")) {
        const h = await source.head(false);
        if (h) return { number: BigInt(h.blockNumber), timestamp: BigInt(h.blockTimestamp) };
      } else if (args?.blockNumber == null && args?.blockTag === "finalized") {
        const h = await source.head(true);
        if (h?.finalizedBlock != null) return { number: BigInt(h.finalizedBlock) };
      }
      // A block's header from the chain leaves the block's stamp alone.
      source.fellBack(null);
      return chain.getBlock(args as never);
    },
    async readContract(args: ReadContractArgs) {
      const block = await blockFor(source, args);
      if (source.answersAt(block)) {
        const a = await source.reads(block, [rawCall(args, fromOf(args.account))]);
        if (a) {
          const s = settle(args, a[0] as CallAnswer);
          if (s.status === "failure") throw s.error;
          return s.result;
        }
      }
      source.fellBack(block);
      return chain.readContract(pin(args, block) as never);
    },
    async call(args: { to: string; data?: Hex; account?: Account } & At) {
      const block = await blockFor(source, args);
      if (source.answersAt(block) && args.to && args.data) {
        const from = fromOf(args.account);
        const read: RawRead = from
          ? { kind: "call", to: args.to.toLowerCase(), data: args.data, from: from.toLowerCase() }
          : { kind: "call", to: args.to.toLowerCase(), data: args.data };
        const a = await source.reads(block, [read]);
        if (a) {
          const c = a[0] as CallAnswer;
          if (!c.success) throw new Error("execution reverted");
          return { data: c.returnData === "0x" ? undefined : c.returnData };
        }
      }
      source.fellBack(block);
      return chain.call(pin(args, block) as never);
    },
    async multicall(args: MulticallArgs) {
      const block = await blockFor(source, args);
      if (source.answersAt(block) && args.contracts.length > 0) {
        const a = await source.reads(
          block,
          args.contracts.map((c) => rawCall(c)),
        );
        if (a) {
          const settled = args.contracts.map((c, i) => settle(c, a[i] as CallAnswer));
          if (args.allowFailure ?? true) return settled;
          const failed = settled.find((s) => s.status === "failure");
          if (failed) throw failed.error;
          return settled.map((s) => s.result);
        }
      }
      source.fellBack(block);
      return chain.multicall(pin(args, block) as never);
    },
    async getCode(args: { address: string } & At) {
      const block = await blockFor(source, args);
      if (source.answersAt(block)) {
        const a = await source.reads(block, [{ kind: "code", address: args.address.toLowerCase() }]);
        if (a) {
          const { hex } = a[0] as { hex: Hex };
          return hex === "0x" ? undefined : hex;
        }
      }
      source.fellBack(block);
      return chain.getCode(pin(args, block) as never);
    },
    async getStorageAt(args: { address: string; slot: Hex } & At) {
      const block = await blockFor(source, args);
      if (source.answersAt(block)) {
        const a = await source.reads(block, [
          { kind: "storage", address: args.address.toLowerCase(), slot: args.slot },
        ]);
        if (a) return (a[0] as { hex: Hex }).hex;
      }
      source.fellBack(block);
      return chain.getStorageAt(pin(args, block) as never);
    },
  };
  return new Proxy(chain, {
    get(target, prop, receiver) {
      if (Object.hasOwn(own, prop)) return own[prop as keyof typeof own];
      return Reflect.get(target, prop, receiver);
    },
  }) as PublicClient;
}

/** What one loader's reads on a recording client were answered by: the
 *  rounds rails-server served them in, at which blocks, and whether any read
 *  went to the chain or came back without a round id. */
export interface HeadRecord {
  rounds: Set<string>;
  blocks: Set<number>;
  /** A served read whose answer carried no `round` (a server without the snapshot route). */
  unnamed: boolean;
  /** A read (or the head) went to the chain. */
  chain: boolean;
}

/** rails-server's live routes as a source; `record` collects what answered. */
function liveSource(chainId: ChainId, record?: HeadRecord): ReadSource {
  return {
    head: (finalized) => serverHead(chainId, finalized),
    answersAt: (block): block is bigint => isNamed(chainId, block),
    async reads(block, reads) {
      const r = await serverReads(chainId, block, reads);
      if (r && record) {
        if (r.round) record.rounds.add(r.round);
        else record.unnamed = true;
        record.blocks.add(Number(block));
      }
      return r?.answers ?? null;
    },
    fellBack(block) {
      noteChainRead(chainId, block);
      if (record) record.chain = true;
    },
  };
}

/** The block a read stands at: its own, or the source's head when it names none. Null for a tag other than latest. */
async function blockFor(source: ReadSource, args: At): Promise<bigint | null> {
  if (args.blockNumber != null) return args.blockNumber;
  if (args.blockTag != null && args.blockTag !== "latest") return null;
  const h = await source.head(false);
  return h ? BigInt(h.blockNumber) : null;
}

function apiFirstClient(chainId: ChainId, fallback: (chainId: ChainId) => PublicClient): PublicClient {
  if (override) return override(chainId);
  return sourcedClient(liveSource(chainId), fallback(chainId));
}

/** A single-page family's head reader's client; the chain through `chainClient`. */
export function headReadsClient(chainId: ChainId = MAINNET_CHAIN_ID): PublicClient {
  return apiFirstClient(chainId, chainClient);
}

/** A vault reader's client (pages, directories, holders, the listing overlay); the chain through `chainBatchClient`. */
export function vaultHeadClient(chainId: ChainId): PublicClient {
  return apiFirstClient(chainId, chainBatchClient);
}

/** `headReadsClient(chainId)` that records what answered one loader's reads
 *  (`lib/sources/api/head-snapshot.ts`). */
export function recordingHeadClient(chainId: ChainId): { client: PublicClient; record: HeadRecord } {
  const record: HeadRecord = { rounds: new Set(), blocks: new Set(), unnamed: false, chain: false };
  if (override) return { client: override(chainId), record: { ...record, chain: true } };
  return { client: sourcedClient(liveSource(chainId, record), chainClient(chainId)), record };
}

// ── a stored snapshot as a source ───────────────────────────────────────────

/** `GET /api/at-block/head/snapshot`: the reads one surface made at one block, and their answers. */
export interface HeadSnapshot {
  chainId: number;
  surface: string;
  blockNumber: number;
  blockTimestamp: number | null;
  readAt: string;
  provider: string;
  reads: RawRead[];
  answers: RawAnswer[];
}

const readKey = (r: RawRead): string =>
  r.kind === "call"
    ? `call:${r.to.toLowerCase()}:${r.data.toLowerCase()}:${(r.from ?? "").toLowerCase()}`
    : r.kind === "code"
      ? `code:${r.address.toLowerCase()}`
      : `storage:${r.address.toLowerCase()}:${r.slot.toLowerCase()}`;

/** A snapshot's shape checked; null where it is not one. */
export function parseHeadSnapshot(body: unknown): HeadSnapshot | null {
  const b = body as Partial<HeadSnapshot> | null;
  if (
    !b ||
    typeof b !== "object" ||
    typeof b.blockNumber !== "number" ||
    typeof b.readAt !== "string" ||
    typeof b.provider !== "string" ||
    !Array.isArray(b.reads) ||
    !Array.isArray(b.answers) ||
    b.reads.length !== b.answers.length ||
    !b.reads.every((r, i) => r != null && typeof r === "object" && answers(r, b.answers![i]))
  )
    return null;
  return { ...b, blockTimestamp: typeof b.blockTimestamp === "number" ? b.blockTimestamp : null } as HeadSnapshot;
}

const noChain = new Proxy({} as PublicClient, {
  get(_, prop) {
    if (prop === "then") return undefined;
    return () => {
      throw new Error(`replay: the snapshot does not answer ${String(prop)}`);
    };
  },
});

/** A client that answers a reader's reads from a stored snapshot at its block.
 *  A read the snapshot does not hold throws and marks the replay `missed`. */
export function snapshotClient(snapshot: HeadSnapshot): { client: PublicClient; missed(): boolean } {
  const B = BigInt(snapshot.blockNumber);
  const held = new Map<string, RawAnswer>();
  snapshot.reads.forEach((r, i) => held.set(readKey(r), snapshot.answers[i]));
  let missed = false;
  const head: HeadAnswer = {
    blockNumber: snapshot.blockNumber,
    blockTimestamp: snapshot.blockTimestamp ?? 0,
  };
  const source: ReadSource = {
    head: async (finalized) => (finalized ? null : head),
    answersAt: (block): block is bigint => block === B,
    async reads(_, reads) {
      const out: RawAnswer[] = [];
      for (const r of reads) {
        const a = held.get(readKey(r));
        if (!a) return null;
        out.push(a);
      }
      return out;
    },
    fellBack() {
      missed = true;
    },
  };
  return { client: sourcedClient(source, noChain), missed: () => missed };
}
