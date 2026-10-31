// The single-page families' head readers' chain client, asked of rails-server
// first.
// ----------------------------------------------------------------------------
// rails-server's `/api/at-block/head/block` names the block a head read pins,
// one per chain per 30 s, and `/api/at-block/head/reads` answers a round of
// calls at that block, each round read once on the keyless gateway first and
// the paid leg last (rails-ops decisions/0056 step 3, census rank 12 stage 8;
// the server half is api/src/services/vault-head.ts, which the vault pages read
// through too). The readers keep their code: this is the client they read
// through. It answers the five methods they call (`getBlockNumber`,
// `getBlock`, `readContract`, `multicall`, `call`) with what their chain client
// answers, decoded here with the same ABI and the rules viem applies to a chain
// answer, so a reader's figures are the ones it would compute reading the
// chain at that block.
//
// Concurrent reads at one block go as one round: a reader's `Promise.all` of
// `readContract`s is one request, as viem would batch a multicall. A read
// without a block is pinned to rails-server's block. A read at a block
// rails-server did not name, or one the route cannot answer (no RAILS_API_URL,
// a non-2xx answer or 8 s without one), is the chain read as before, at the
// same block; after a failure the chain is read for 30 s without asking.
//
// SERVER-ONLY.

import { decodeFunctionResult, encodeFunctionData, type Abi, type Hex, type PublicClient } from "viem";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { chainClient } from "@/lib/sources/chain/rpc";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

const TIMEOUT_MS = 8_000;
/** How long a block rails-server named is read there: inside its two-minute acceptance. */
const NAMED_MS = 90_000;
/** One head answer serves the reads that start within this long of it. */
const HEAD_REUSE_MS = 5_000;
/** After the route fails, how long the chain is read without asking it. */
const DOWN_MS = 30_000;

type RawRead = { kind: "call"; to: string; data: Hex; from?: string };
type RawAnswer = { success: boolean; returnData: Hex };

interface HeadAnswer {
  blockNumber: number;
  blockTimestamp: number;
  head?: { blockTime: number; readAt: string; provider: string };
}

const named = new Map<number, Map<bigint, number>>();
const heads = new Map<number, { at: number; p: Promise<HeadAnswer | null> }>();
const downUntil = new Map<number, number>();

function remember(chainId: number, block: bigint) {
  let m = named.get(chainId);
  if (!m) named.set(chainId, (m = new Map()));
  m.set(block, Date.now());
  for (const [b, at] of m) if (Date.now() - at > NAMED_MS) m.delete(b);
}

const isNamed = (chainId: number, block: bigint | undefined): block is bigint => {
  if (block == null) return false;
  const at = named.get(chainId)?.get(block);
  return at != null && Date.now() - at <= NAMED_MS;
};

const isDown = (chainId: number) => (downUntil.get(chainId) ?? 0) > Date.now();

async function ask<T>(chainId: number, path: string, body?: unknown): Promise<T | null> {
  const api = process.env.RAILS_API_URL;
  if (!api || isDown(chainId)) return null;
  try {
    const res = await fetch(`${api}/api/at-block/head/${path}`, {
      ...createAuthFetchOptions(
        body === undefined
          ? undefined
          : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      ),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      void res.body?.cancel().catch(() => undefined);
      // A block the route no longer names (409) is not the route down.
      if (res.status !== 409) downUntil.set(chainId, Date.now() + DOWN_MS);
      return null;
    }
    return (await res.json()) as T;
  } catch {
    downUntil.set(chainId, Date.now() + DOWN_MS);
    return null;
  }
}

/** rails-server's block for the chain; one request serves the reads of the next few seconds. */
function serverHead(chainId: number): Promise<HeadAnswer | null> {
  const hit = heads.get(chainId);
  if (hit && Date.now() - hit.at < HEAD_REUSE_MS) return hit.p;
  const p = ask<HeadAnswer>(chainId, `block?chain=${chainId}`).then((h) => {
    if (!h || typeof h.blockNumber !== "number" || typeof h.blockTimestamp !== "number") {
      heads.delete(chainId);
      return null;
    }
    remember(chainId, BigInt(h.blockNumber));
    return h;
  });
  heads.set(chainId, { at: Date.now(), p });
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

async function flush(chainId: number, block: bigint, key: string) {
  const q = queues.get(key) ?? [];
  queues.delete(key);
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
    r.answers.every((a) => a && typeof a === "object" && "success" in a);
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
function settle(c: Contract, a: RawAnswer): Settled {
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

type ReadContractArgs = Contract & { blockNumber?: bigint; blockTag?: string; account?: string | { address: string } };
type MulticallArgs = {
  contracts: readonly Contract[];
  allowFailure?: boolean;
  blockNumber?: bigint;
  blockTag?: string;
};

/** The block a read stands at: its own, or rails-server's when it names none. Null for a tag other than latest. */
async function blockFor(chainId: number, args: { blockNumber?: bigint; blockTag?: string }): Promise<bigint | null> {
  if (args.blockNumber != null) return args.blockNumber;
  if (args.blockTag != null && args.blockTag !== "latest") return null;
  const h = await serverHead(chainId);
  return h ? BigInt(h.blockNumber) : null;
}

let override: ((chainId: ChainId) => PublicClient) | null = null;

/** The equality check's seam (scripts/verify/head-reads-equality.ts): every
 *  `headReadsClient()` answers with `fn`'s client until it is cleared. */
export function overrideHeadReadsClient(fn: ((chainId: ChainId) => PublicClient) | null): void {
  override = fn;
}

/** The block rails-server last named for the chain, for the equality check. */
export async function lastServerHead(chainId: ChainId = MAINNET_CHAIN_ID): Promise<number | null> {
  return (await heads.get(chainId)?.p)?.blockNumber ?? null;
}

/**
 * The chain client a single-page family's head reader reads through:
 * rails-server's head and reads where it answers, `chainClient(chainId)`
 * (the reader's own client) everywhere else.
 */
export function headReadsClient(chainId: ChainId = MAINNET_CHAIN_ID): PublicClient {
  if (override) return override(chainId);
  const chain = chainClient(chainId);
  const own = {
    async getBlockNumber(): Promise<bigint> {
      const h = await serverHead(chainId);
      return h ? BigInt(h.blockNumber) : chain.getBlockNumber();
    },
    async getBlock(args?: { blockTag?: string; blockNumber?: bigint }) {
      if (args?.blockNumber == null && (args?.blockTag == null || args.blockTag === "latest")) {
        const h = await serverHead(chainId);
        if (h) return { number: BigInt(h.blockNumber), timestamp: BigInt(h.blockTimestamp) };
      }
      return chain.getBlock(args as never);
    },
    async readContract(args: ReadContractArgs) {
      const block = await blockFor(chainId, args);
      if (isNamed(chainId, block ?? undefined)) {
        const from = typeof args.account === "string" ? args.account : args.account?.address;
        const answers = await serverReads(chainId, block!, [rawCall(args, from)]);
        if (answers) {
          const s = settle(args, answers[0]);
          if (s.status === "failure") throw s.error;
          return s.result;
        }
      }
      return chain.readContract((block != null ? { ...args, blockNumber: block, blockTag: undefined } : args) as never);
    },
    async call(args: {
      to: string;
      data?: Hex;
      blockNumber?: bigint;
      blockTag?: string;
      account?: string | { address: string };
    }) {
      const block = await blockFor(chainId, args);
      if (isNamed(chainId, block ?? undefined) && args.to && args.data) {
        const from = typeof args.account === "string" ? args.account : args.account?.address;
        const read: RawRead = from
          ? { kind: "call", to: args.to.toLowerCase(), data: args.data, from: from.toLowerCase() }
          : { kind: "call", to: args.to.toLowerCase(), data: args.data };
        const answers = await serverReads(chainId, block!, [read]);
        if (answers) {
          if (!answers[0].success) throw new Error("execution reverted");
          return { data: answers[0].returnData === "0x" ? undefined : answers[0].returnData };
        }
      }
      return chain.call((block != null ? { ...args, blockNumber: block, blockTag: undefined } : args) as never);
    },
    async multicall(args: MulticallArgs) {
      const block = await blockFor(chainId, args);
      if (isNamed(chainId, block ?? undefined) && args.contracts.length > 0) {
        const answers = await serverReads(
          chainId,
          block!,
          args.contracts.map((c) => rawCall(c)),
        );
        if (answers) {
          const settled = args.contracts.map((c, i) => settle(c, answers[i]));
          if (args.allowFailure ?? true) return settled;
          const failed = settled.find((s) => s.status === "failure");
          if (failed) throw failed.error;
          return settled.map((s) => s.result);
        }
      }
      return chain.multicall((block != null ? { ...args, blockNumber: block, blockTag: undefined } : args) as never);
    },
  };
  return new Proxy(chain, {
    get(target, prop, receiver) {
      if (Object.hasOwn(own, prop)) return own[prop as keyof typeof own];
      return Reflect.get(target, prop, receiver);
    },
  }) as PublicClient;
}
