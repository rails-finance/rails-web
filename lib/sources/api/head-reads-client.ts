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
// SERVER-ONLY.

import { decodeFunctionResult, encodeFunctionData, type Abi, type Hex, type PublicClient } from "viem";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { chainBatchClient, chainClient } from "@/lib/sources/chain/rpc";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";
import { noteChainRead, noteServerHead } from "./server-head-stamps";
import { ROUTE_WAIT_MS, routeGate } from "./route-gate";

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

interface Pending {
  reads: RawRead[];
  resolve: (answers: RawAnswer[] | null) => void;
}

const queues = new Map<string, Pending[]>();

function serverReads(chainId: number, block: bigint, reads: RawRead[]): Promise<RawAnswer[] | null> {
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
  const r = await ask<{ blockNumber?: unknown; answers?: unknown }>(chainId, "reads", {
    chain: chainId,
    block: Number(block),
    reads,
  });
  const ok =
    r != null &&
    r.blockNumber === Number(block) &&
    Array.isArray(r.answers) &&
    r.answers.length === reads.length &&
    r.answers.every((a, i) => answers(reads[i], a));
  let i = 0;
  for (const p of q) {
    const n = p.reads.length;
    p.resolve(ok ? (r!.answers as RawAnswer[]).slice(i, i + n) : null);
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

/** The block a read stands at: its own, or rails-server's when it names none. Null for a tag other than latest. */
async function blockFor(chainId: number, args: At): Promise<bigint | null> {
  if (args.blockNumber != null) return args.blockNumber;
  if (args.blockTag != null && args.blockTag !== "latest") return null;
  const h = await serverHead(chainId);
  return h ? BigInt(h.blockNumber) : null;
}

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

/**
 * The chain client a head reader reads through: rails-server's head and reads
 * where it answers, `fallback(chainId)` everywhere else.
 */
function apiFirstClient(chainId: ChainId, fallback: (chainId: ChainId) => PublicClient): PublicClient {
  if (override) return override(chainId);
  const chain = fallback(chainId);
  const own = {
    async getBlockNumber(): Promise<bigint> {
      const h = await serverHead(chainId);
      return h ? BigInt(h.blockNumber) : chain.getBlockNumber();
    },
    async getBlock(args?: At) {
      if (args?.blockNumber == null && (args?.blockTag == null || args.blockTag === "latest")) {
        const h = await serverHead(chainId);
        if (h) return { number: BigInt(h.blockNumber), timestamp: BigInt(h.blockTimestamp) };
      } else if (args?.blockNumber == null && args?.blockTag === "finalized") {
        const h = await serverHead(chainId, true);
        if (h?.finalizedBlock != null) return { number: BigInt(h.finalizedBlock) };
      }
      return chain.getBlock(args as never);
    },
    async readContract(args: ReadContractArgs) {
      const block = await blockFor(chainId, args);
      if (isNamed(chainId, block)) {
        const a = await serverReads(chainId, block, [rawCall(args, fromOf(args.account))]);
        if (a) {
          const s = settle(args, a[0] as CallAnswer);
          if (s.status === "failure") throw s.error;
          return s.result;
        }
      }
      noteChainRead(chainId, block);
      return chain.readContract(pin(args, block) as never);
    },
    async call(args: { to: string; data?: Hex; account?: Account } & At) {
      const block = await blockFor(chainId, args);
      if (isNamed(chainId, block) && args.to && args.data) {
        const from = fromOf(args.account);
        const read: RawRead = from
          ? { kind: "call", to: args.to.toLowerCase(), data: args.data, from: from.toLowerCase() }
          : { kind: "call", to: args.to.toLowerCase(), data: args.data };
        const a = await serverReads(chainId, block, [read]);
        if (a) {
          const c = a[0] as CallAnswer;
          if (!c.success) throw new Error("execution reverted");
          return { data: c.returnData === "0x" ? undefined : c.returnData };
        }
      }
      noteChainRead(chainId, block);
      return chain.call(pin(args, block) as never);
    },
    async multicall(args: MulticallArgs) {
      const block = await blockFor(chainId, args);
      if (isNamed(chainId, block) && args.contracts.length > 0) {
        const a = await serverReads(
          chainId,
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
      noteChainRead(chainId, block);
      return chain.multicall(pin(args, block) as never);
    },
    async getCode(args: { address: string } & At) {
      const block = await blockFor(chainId, args);
      if (isNamed(chainId, block)) {
        const a = await serverReads(chainId, block, [{ kind: "code", address: args.address.toLowerCase() }]);
        if (a) {
          const { hex } = a[0] as { hex: Hex };
          return hex === "0x" ? undefined : hex;
        }
      }
      noteChainRead(chainId, block);
      return chain.getCode(pin(args, block) as never);
    },
    async getStorageAt(args: { address: string; slot: Hex } & At) {
      const block = await blockFor(chainId, args);
      if (isNamed(chainId, block)) {
        const a = await serverReads(chainId, block, [
          { kind: "storage", address: args.address.toLowerCase(), slot: args.slot },
        ]);
        if (a) return (a[0] as { hex: Hex }).hex;
      }
      noteChainRead(chainId, block);
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

/** A single-page family's head reader's client; the chain through `chainClient`. */
export function headReadsClient(chainId: ChainId = MAINNET_CHAIN_ID): PublicClient {
  return apiFirstClient(chainId, chainClient);
}

/** A vault reader's client (pages, directories, holders, the listing overlay); the chain through `chainBatchClient`. */
export function vaultHeadClient(chainId: ChainId): PublicClient {
  return apiFirstClient(chainId, chainBatchClient);
}
