// The vault readers' chain client, asked of rails-server first.
// ----------------------------------------------------------------------------
// rails-server's `/api/at-block/vault/head` names the block a vault read pins,
// one per chain per 30 s, and `/api/at-block/vault/reads` answers a round of
// calls, codes and storage words at that block, each batch read once on the
// keyless gateway first (rails-ops decisions/0056 step 3; the server half is
// api/src/services/vault-head.ts). The vault readers keep their code: this is
// the client they read through, and it answers the five methods they call
// (`getBlock`, `getBlockNumber`, `multicall`, `getCode`, `getStorageAt`) with
// what `chainBatchClient` answers, decoded here with the same ABI and the same
// rules viem's multicall applies to a chain answer.
//
// A read goes to rails-server only at a block rails-server named; a read at any
// other block, an unpinned one, or one the route cannot answer (no
// RAILS_API_URL, a non-2xx answer or 8 s without one) is the chain read as
// before, at the same block. Every other method is the chain client's.
//
// SERVER-ONLY.

import { decodeFunctionResult, encodeFunctionData, type Abi, type Hex, type PublicClient } from "viem";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { chainBatchClient } from "@/lib/sources/chain/rpc";
import type { ChainId } from "@/lib/shared/chains";

const TIMEOUT_MS = 8_000;
/** How long a block rails-server named is read there: inside its two-minute acceptance. */
const NAMED_MS = 90_000;

type RawRead =
  | { kind: "call"; to: string; data: Hex }
  | { kind: "code"; address: string }
  | { kind: "storage"; address: string; slot: string };
type RawAnswer = { success: boolean; returnData: Hex } | { hex: Hex };

const named = new Map<number, Map<bigint, number>>();

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

async function ask<T>(path: string, init?: { body: unknown }): Promise<T | null> {
  const api = process.env.RAILS_API_URL;
  if (!api) return null;
  try {
    const res = await fetch(`${api}/api/at-block/vault/${path}`, {
      ...createAuthFetchOptions(
        init
          ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) }
          : undefined,
      ),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      void res.body?.cancel().catch(() => undefined);
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface HeadAnswer {
  blockNumber: number;
  blockTimestamp: number;
  finalizedBlock?: number | null;
}

async function serverHead(chainId: number, finalized = false): Promise<HeadAnswer | null> {
  const h = await ask<HeadAnswer>(`head?chain=${chainId}${finalized ? "&finalized=1" : ""}`);
  if (!h || typeof h.blockNumber !== "number" || typeof h.blockTimestamp !== "number") return null;
  remember(chainId, BigInt(h.blockNumber));
  return h;
}

async function serverReads(chainId: number, block: bigint, reads: RawRead[]): Promise<RawAnswer[] | null> {
  const r = await ask<{ blockNumber?: unknown; answers?: unknown }>("reads", {
    body: { chain: chainId, block: Number(block), reads },
  });
  if (!r || r.blockNumber !== Number(block) || !Array.isArray(r.answers) || r.answers.length !== reads.length)
    return null;
  return r.answers as RawAnswer[];
}

type Contract = { address: string; abi: Abi | readonly unknown[]; functionName: string; args?: readonly unknown[] };
type MulticallArgs = { contracts: readonly Contract[]; allowFailure?: boolean; blockNumber?: bigint };
type Settled = { status: "success"; result: unknown } | { status: "failure"; error: Error; result: undefined };

/** One aggregate3 result decoded as viem's multicall decodes it. */
function settle(c: Contract, a: { success: boolean; returnData: Hex }): Settled {
  if (!a.success) return { status: "failure", error: new Error(`${c.functionName} reverted`), result: undefined };
  try {
    if (a.returnData === "0x") throw new Error("zero data");
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

/**
 * The chain client a vault reader reads through: rails-server's head and
 * reads where it answers, `chainBatchClient(chainId)` everywhere else.
 */
export function vaultHeadClient(chainId: ChainId): PublicClient {
  const chain = chainBatchClient(chainId);
  const own = {
    async getBlockNumber(): Promise<bigint> {
      const h = await serverHead(chainId);
      return h ? BigInt(h.blockNumber) : chain.getBlockNumber();
    },
    async getBlock(args?: { blockTag?: string; blockNumber?: bigint }) {
      if (args?.blockNumber == null && (args?.blockTag == null || args.blockTag === "latest")) {
        const h = await serverHead(chainId);
        if (h) return { number: BigInt(h.blockNumber), timestamp: BigInt(h.blockTimestamp) };
      } else if (args?.blockNumber == null && args?.blockTag === "finalized") {
        const h = await serverHead(chainId, true);
        if (h?.finalizedBlock != null) return { number: BigInt(h.finalizedBlock) };
      }
      return chain.getBlock(args as never);
    },
    async multicall(args: MulticallArgs) {
      if (isNamed(chainId, args.blockNumber)) {
        const reads: RawRead[] = args.contracts.map((c) => ({
          kind: "call",
          to: c.address.toLowerCase(),
          data: encodeFunctionData({ abi: c.abi as Abi, functionName: c.functionName, args: c.args } as never),
        }));
        const answers = await serverReads(chainId, args.blockNumber, reads);
        if (answers && answers.every((a) => "success" in a)) {
          const settled = args.contracts.map((c, i) => settle(c, answers[i] as { success: boolean; returnData: Hex }));
          if (args.allowFailure ?? true) return settled;
          const failed = settled.find((s) => s.status === "failure");
          if (failed) throw failed.error;
          return settled.map((s) => s.result);
        }
      }
      return chain.multicall(args as never);
    },
    async getCode(args: { address: string; blockNumber?: bigint }) {
      if (isNamed(chainId, args.blockNumber)) {
        const a = await serverReads(chainId, args.blockNumber, [{ kind: "code", address: args.address.toLowerCase() }]);
        if (a && "hex" in a[0]) return a[0].hex === "0x" ? undefined : a[0].hex;
      }
      return chain.getCode(args as never);
    },
    async getStorageAt(args: { address: string; slot: Hex; blockNumber?: bigint }) {
      if (isNamed(chainId, args.blockNumber)) {
        const a = await serverReads(chainId, args.blockNumber, [
          { kind: "storage", address: args.address.toLowerCase(), slot: args.slot },
        ]);
        if (a && "hex" in a[0]) return a[0].hex;
      }
      return chain.getStorageAt(args as never);
    },
  };
  return new Proxy(chain, {
    get(target, prop, receiver) {
      if (Object.hasOwn(own, prop)) return own[prop as keyof typeof own];
      return Reflect.get(target, prop, receiver);
    },
  }) as PublicClient;
}
