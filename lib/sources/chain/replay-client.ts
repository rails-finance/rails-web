// A head reader's RPC client, answered from calls rails-server already read.
// ----------------------------------------------------------------------------
// rails-server's lender head routes (`/api/at-block/compound/position`,
// `/api/at-block/morpho/position`, `/api/at-block/morpho/wallet`) answer with
// every call a head reader here makes for an account, each with its answer, at
// one block B (rails-ops decisions/0056 step 3). `replayClient` hands a reader
// those answers through the client calls it already makes — `multicall`,
// `readContract`, `getBlockNumber`, `getBlock` — so the reader's arithmetic
// runs unchanged and states block B. A call the answer does not hold marks the
// replay `missed`; the caller then reads the chain instead.
//
// `pinnedClient` is the other side of the equality check: the reader's own
// RPC client with every call asked at block B.
//
// SERVER-ONLY.

import { encodeFunctionData, getAbiItem, type Abi, type AbiFunction, type AbiParameter, type PublicClient } from "viem";

/** One call's answer as rails-server sends it: viem's decoded value with
 *  integers as decimal strings, or why it did not answer. */
export type ServedAnswer = { ok: true; value: unknown } | { ok: false; why: string };

export interface ServedCalls {
  blockNumber: number;
  blockTime: number;
  head: { blockTime: number; readAt: string; provider: string };
  /** `<address>:<calldata>`, both lowercase. */
  calls: Record<string, ServedAnswer>;
}

/** A value from JSON back into viem's types: integers wider than 48 bits are
 *  bigint, narrower ones number, tuples and arrays walked. */
function hydrate(param: AbiParameter, v: unknown): unknown {
  const t = param.type;
  const arr = /^(.*)\[(\d*)\]$/.exec(t);
  if (arr) return (v as unknown[]).map((x) => hydrate({ ...param, type: arr[1] } as AbiParameter, x));
  if (t === "tuple") {
    const comps = (param as { components: readonly AbiParameter[] }).components;
    if (Array.isArray(v)) return comps.map((c, i) => hydrate(c, v[i]));
    const o: Record<string, unknown> = {};
    for (const c of comps) o[c.name as string] = hydrate(c, (v as Record<string, unknown>)[c.name as string]);
    return o;
  }
  const int = /^u?int(\d*)$/.exec(t);
  if (int) return Number(int[1] || 256) > 48 ? BigInt(v as string | number) : Number(v);
  return v;
}

function hydrateResult(fn: AbiFunction, value: unknown): unknown {
  if (fn.outputs.length === 1) return hydrate(fn.outputs[0], value);
  return fn.outputs.map((o, i) => hydrate(o, (value as unknown[])[i]));
}

class Missed extends Error {
  constructor(what: string) {
    super(`replay: no served answer for ${what}`);
  }
}

interface CallSpec {
  address: string;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
}

export interface Replay {
  client: PublicClient;
  /** True once the reader asked a call the answer does not hold. */
  missed(): boolean;
}

export function replayClient(served: ServedCalls): Replay {
  let missed = false;
  const look = (c: CallSpec): { ok: true; value: unknown } | { ok: false; error: Error } => {
    const abi = c.abi as Abi;
    const data = encodeFunctionData({ abi, functionName: c.functionName, args: c.args } as never);
    const a = served.calls[`${c.address.toLowerCase()}:${data.toLowerCase()}`];
    if (!a) {
      missed = true;
      throw new Missed(c.functionName);
    }
    if (!a.ok) return { ok: false, error: new Error(`${c.functionName}: ${a.why}`) };
    const fn = getAbiItem({ abi, name: c.functionName, args: c.args } as never) as AbiFunction;
    return { ok: true, value: hydrateResult(fn, a.value) };
  };
  const B = BigInt(served.blockNumber);
  const client = {
    async getBlockNumber() {
      return B;
    },
    async getBlock(args?: { blockNumber?: bigint }) {
      if (args?.blockNumber != null && args.blockNumber !== B) {
        missed = true;
        throw new Missed(`block ${args.blockNumber}`);
      }
      return { number: B, timestamp: BigInt(served.blockTime) };
    },
    async readContract(c: CallSpec & { blockNumber?: bigint }) {
      if (c.blockNumber != null && c.blockNumber !== B) {
        missed = true;
        throw new Missed(`block ${c.blockNumber}`);
      }
      const r = look(c);
      if (!r.ok) throw r.error;
      return r.value;
    },
    async multicall(p: { contracts: readonly CallSpec[]; allowFailure?: boolean; blockNumber?: bigint }) {
      if (p.blockNumber != null && p.blockNumber !== B) {
        missed = true;
        throw new Missed(`block ${p.blockNumber}`);
      }
      const allowFailure = p.allowFailure ?? true;
      return p.contracts.map((c) => {
        const r = look(c);
        if (allowFailure)
          return r.ok
            ? { status: "success", result: r.value }
            : { status: "failure", error: r.error, result: undefined };
        if (!r.ok) throw r.error;
        return r.value;
      });
    },
  };
  return { client: client as unknown as PublicClient, missed: () => missed };
}

/** `client` with every read asked at `block`: the equality check's side. */
export function pinnedClient(client: PublicClient, block: number): PublicClient {
  const B = BigInt(block);
  const pinned = {
    getBlockNumber: async () => B,
    getBlock: (args?: { blockNumber?: bigint }) => client.getBlock({ blockNumber: args?.blockNumber ?? B }),
    readContract: (p: Parameters<PublicClient["readContract"]>[0]) =>
      client.readContract({ ...p, blockNumber: B } as never),
    multicall: (p: Parameters<PublicClient["multicall"]>[0]) => client.multicall({ ...p, blockNumber: B } as never),
  };
  return pinned as unknown as PublicClient;
}
