// A transaction's legs to and from one wallet, asked of rails-server first.
// SERVER-ONLY.
// ----------------------------------------------------------------------------
// `GET /api/at-block/tx/legs?chain=1|8453&tx=&wallet=` answers the raw half of
// lib/sources/chain/tx-legs.ts from the at-block store (rails-server
// services/tx-legs.ts; rails-ops decisions/0056): the receipt's Transfer legs
// from or to the wallet (the aToken mint left out, as the web leaves it out),
// the contract the transaction entered, and on Ethereum the native legs to the
// wallet from the stored call tree (`nativeRead: "trace"`). Where the tree was
// not read (Base always, Ethereum when the trace read failed) the answer says
// `nativeRead: "not-read"` and `native: null`. Null where the route cannot
// answer: the web then reads the chain as before. After a 5xx, 429, refusal or
// timeout the chain is read for 30 s without asking (`route-gate.ts`).

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { routeGate } from "./route-gate";

export interface StoredErc20Leg {
  token: string;
  from: string;
  to: string;
  /** The log's integer, a decimal string. */
  raw: string;
  logIndex: number;
}

export interface StoredNativeLeg {
  from: string;
  to: string;
  /** Wei, a decimal string. */
  raw: string;
  kind: "external" | "internal";
}

export interface StoredTxLegs {
  blockNumber: number;
  to: string | null;
  erc20: StoredErc20Leg[];
  /** Null where the call tree was not read. */
  native: StoredNativeLeg[] | null;
}

/** The chains the route answers. */
const STORED_TX_LEGS_CHAINS: ReadonlySet<number> = new Set([MAINNET_CHAIN_ID, BASE_CHAIN_ID]);

const gate = routeGate();
const ADDRESS = /^0x[0-9a-f]{40}$/;
const UINT = /^\d+$/;

const isErc20 = (l: unknown): l is StoredErc20Leg => {
  const r = l as Record<string, unknown> | null;
  return (
    r != null &&
    typeof r.token === "string" &&
    ADDRESS.test(r.token) &&
    typeof r.from === "string" &&
    ADDRESS.test(r.from) &&
    typeof r.to === "string" &&
    ADDRESS.test(r.to) &&
    typeof r.raw === "string" &&
    UINT.test(r.raw) &&
    Number.isInteger(r.logIndex)
  );
};

const isNative = (l: unknown): l is StoredNativeLeg => {
  const r = l as Record<string, unknown> | null;
  return (
    r != null &&
    typeof r.from === "string" &&
    ADDRESS.test(r.from) &&
    typeof r.to === "string" &&
    ADDRESS.test(r.to) &&
    typeof r.raw === "string" &&
    UINT.test(r.raw) &&
    (r.kind === "external" || r.kind === "internal")
  );
};

/** The stored legs of `tx` from and to `wallet` (both lowercase), or null. */
export async function fetchStoredTxLegs(chainId: number, tx: string, wallet: string): Promise<StoredTxLegs | null> {
  if (!STORED_TX_LEGS_CHAINS.has(chainId)) return null;
  const qs = new URLSearchParams({ chain: String(chainId), tx, wallet });
  const r = await gate.json<Record<string, unknown>>(
    `tx-legs:${chainId}`,
    `${process.env.RAILS_API_URL}/api/at-block/tx/legs?${qs}`,
    createAuthFetchOptions(),
  );
  if (!r || r.chainId !== chainId || r.tx !== tx || r.wallet !== wallet) return null;
  if (!Number.isInteger(r.blockNumber) || (r.to !== null && (typeof r.to !== "string" || !ADDRESS.test(r.to))))
    return null;
  if (!Array.isArray(r.erc20) || !r.erc20.every(isErc20)) return null;
  let native: StoredNativeLeg[] | null = null;
  if (r.nativeRead === "trace") {
    if (!Array.isArray(r.native) || !r.native.every(isNative)) return null;
    native = r.native;
  } else if (r.nativeRead !== "not-read") return null;
  return { blockNumber: r.blockNumber as number, to: r.to as string | null, erc20: r.erc20, native };
}
