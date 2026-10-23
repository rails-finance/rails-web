// What a transaction moved to and from one wallet, read from its receipt —
// server-only (rails-ops TO-DO-ui-jobs 438; types and the sale reading in
// lib/shared/tx-legs.ts).
//
// ERC-20 legs are the receipt's Transfer logs from or to the wallet. A native
// coin payment leaves no log, so it comes from `alchemy_getAssetTransfers`
// (categories external + internal, to the wallet, pinned to the receipt's
// block, matched on the hash). That method is Alchemy's own, not JSON-RPC:
// a chain whose state URL is not an Alchemy endpoint answers it with an error,
// and the read then fails whole rather than reporting no native leg. The
// balance difference across the block is the named fallback and is not built:
// the wallet's other transactions in the block muddy it.
//
// A receipt never changes, so an answer is kept for the life of the process,
// keyed by chain, hash and wallet; a failure is not kept.

import { decodeEventLog, parseAbi, type Hex } from "viem";
import { chainClient } from "./rpc";
import { resolveErc20Meta } from "./erc20-meta";
import type { ChainId } from "@/lib/shared/chains";
import type { TxLeg, TxLegs } from "@/lib/shared/tx-legs";

const TRANSFER = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO = "0x0000000000000000000000000000000000000000";
/** The native coin on every chain the route reads (Ethereum, Base, Arbitrum). */
const NATIVE = { symbol: "ETH", decimals: 18 };

type Answer = Omit<TxLegs, "rpcCalls" | "cached">;
const kept = new Map<string, Answer>();
const inFlight = new Map<string, Promise<{ answer: Answer; rpcCalls: number }>>();

interface AssetTransfer {
  hash: string;
  from: string;
  to: string;
  asset: string | null;
  category: string;
  rawContract: { value: string | null; address: string | null; decimal: string | null };
}

async function read(chainId: ChainId, hash: string, wallet: string): Promise<{ answer: Answer; rpcCalls: number }> {
  const client = chainClient(chainId);
  let rpcCalls = 0;
  rpcCalls++;
  const receipt = await client.getTransactionReceipt({ hash: hash as Hex });
  const blockNumber = Number(receipt.blockNumber);

  const raw: { token: string; from: string; to: string; value: bigint; logIndex: number }[] = [];
  for (const log of receipt.logs) {
    if (log.topics[0] !== TRANSFER_TOPIC || log.topics.length !== 3) continue;
    try {
      const ev = decodeEventLog({ abi: TRANSFER, data: log.data, topics: log.topics });
      const from = ev.args.from.toLowerCase();
      const to = ev.args.to.toLowerCase();
      if (from !== wallet && to !== wallet) continue;
      raw.push({ token: log.address.toLowerCase(), from, to, value: ev.args.value, logIndex: log.logIndex });
    } catch {
      // An ERC-721 Transfer shares the topic with a fourth indexed field.
    }
  }

  const sentTokens = new Set(raw.filter((r) => r.from === wallet).map((r) => r.token));
  // A mint of a token the wallet also sent is the token minting the wallet's
  // accrued interest as it moves (an aToken), not a payment.
  const legsRaw = raw.filter((r) => !(r.from === ZERO && r.to === wallet && sentTokens.has(r.token)));

  // Native legs to the wallet. Vendor-specific: Alchemy's asset-transfers
  // index, the one source for an internal call's value without a trace.
  rpcCalls++;
  const block = `0x${blockNumber.toString(16)}`;
  const res = (await client.request({
    method: "alchemy_getAssetTransfers" as never,
    params: [
      {
        fromBlock: block,
        toBlock: block,
        toAddress: wallet,
        category: ["external", "internal"],
        excludeZeroValue: true,
        withMetadata: false,
        maxCount: "0x3e8",
      },
    ] as never,
  })) as { transfers?: AssetTransfer[] };
  const native = (res.transfers ?? []).filter((t) => t.hash.toLowerCase() === hash && t.rawContract.value != null);

  // Names and decimals for the tokens paid back, which the sale reading
  // prints; a token the wallet sent keeps its address (the row names it).
  const tokens = [...new Set(legsRaw.filter((r) => r.to === wallet && r.from !== wallet).map((r) => r.token))];
  if (tokens.length > 0) rpcCalls++; // one multicall; the helper keeps its own process cache, so this is an upper bound
  const meta = tokens.length > 0 ? await resolveErc20Meta(tokens, chainId) : new Map();

  const toLeg = (r: (typeof legsRaw)[number], counterparty: string): TxLeg => {
    const m = meta.get(r.token);
    return {
      token: r.token,
      symbol: m?.symbol ?? r.token,
      decimals: m?.decimals ?? 18,
      raw: r.value.toString(),
      counterparty,
      source: "log",
      logIndex: r.logIndex,
    };
  };
  const sent = legsRaw.filter((r) => r.from === wallet).map((r) => toLeg(r, r.to));
  const back: TxLeg[] = [
    ...legsRaw.filter((r) => r.to === wallet && r.from !== wallet).map((r) => toLeg(r, r.from)),
    ...native.map(
      (t): TxLeg => ({
        token: null,
        symbol: NATIVE.symbol,
        decimals: NATIVE.decimals,
        raw: BigInt(t.rawContract.value!).toString(),
        counterparty: t.from.toLowerCase(),
        source: "asset-transfers",
      }),
    ),
  ];
  return { answer: { chainId, hash, wallet, blockNumber, sent, back }, rpcCalls };
}

/** The legs of `hash` from and to `wallet` (both lowercase). */
export async function readTxLegs(chainId: ChainId, hash: string, wallet: string): Promise<TxLegs> {
  const key = `${chainId}:${hash}:${wallet}`;
  const hit = kept.get(key);
  if (hit) return { ...hit, rpcCalls: 0, cached: true };
  let p = inFlight.get(key);
  const joined = !!p;
  if (!p) {
    p = read(chainId, hash, wallet);
    inFlight.set(key, p);
  }
  try {
    const { answer, rpcCalls } = await p;
    kept.set(key, answer);
    return { ...answer, rpcCalls: joined ? 0 : rpcCalls, cached: joined };
  } finally {
    inFlight.delete(key);
  }
}
