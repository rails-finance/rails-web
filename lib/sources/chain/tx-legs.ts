// What a transaction moved to and from one wallet, read from its receipt —
// server-only (rails-ops TO-DO-ui-jobs 438; types and the sale reading in
// lib/shared/tx-legs.ts).
//
// ERC-20 legs are the receipt's Transfer logs from or to the wallet. A native
// coin payment leaves no log: it is a value-carrying call to the wallet inside
// the transaction (categories external and internal).
//
// Ethereum and Base ask rails-server's at-block store first
// (lib/sources/api/tx-legs-at-block.ts): it answers the Transfer legs and the
// receipt's `to`, and on Ethereum the native legs from the stored call tree.
// Where the store holds no call tree (Base always; Ethereum when its trace read
// failed) the native legs alone come from `alchemy_getAssetTransfers`, pinned
// to the receipt's block and matched on the hash. Where the store cannot
// answer, and on Arbitrum, the whole read is the chain's: the receipt, then the
// asset transfers. That method is Alchemy's own, not JSON-RPC: a chain whose
// state URL is not an Alchemy endpoint answers it with an error, and the read
// then fails whole rather than reporting no native leg. The balance difference
// across the block is the named fallback and is not built: the wallet's other
// transactions in the block muddy it. Token names and decimals are read here
// in every case. Where legs back come in two or more tokens, each is priced at
// the block by the chain's Aave oracle through rails-server
// (aaveOraclePricesAtBlock), the native coin as WETH.
//
// A receipt never changes, so an answer is kept for the life of the process,
// keyed by chain, hash and wallet; a failure is not kept. `rpcCalls` counts
// this process's own upstream calls, never the store's.

import { decodeEventLog, parseAbi, type Hex } from "viem";
import { chainClient } from "./rpc";
import { resolveErc20Meta } from "./erc20-meta";
import { aaveOraclePricesAtBlock } from "./aave-oracle-prices";
import { fetchStoredTxLegs } from "@/lib/sources/api/tx-legs-at-block";
import { nativeCurrency, type ChainId } from "@/lib/shared/chains";
import { needsLegPrices, type TxLeg, type TxLegs } from "@/lib/shared/tx-legs";

const TRANSFER = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO = "0x0000000000000000000000000000000000000000";
/** WETH per chain: the oracle prices the native coin under it. Arc has none:
 *  its native coin is USDC. */
const WRAPPED_NATIVE: Partial<Record<ChainId, string>> = {
  1: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  8453: "0x4200000000000000000000000000000000000006",
  42161: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  10: "0x4200000000000000000000000000000000000006",
};

type Answer = Omit<TxLegs, "rpcCalls" | "cached">;
const kept = new Map<string, Answer>();
const inFlight = new Map<string, Promise<{ answer: Answer; rpcCalls: number }>>();

type RawLeg = { token: string; from: string; to: string; value: bigint; logIndex: number };
type RawNative = { from: string; value: bigint };

interface AssetTransfer {
  hash: string;
  from: string;
  to: string;
  asset: string | null;
  category: string;
  rawContract: { value: string | null; address: string | null; decimal: string | null };
}

/** The receipt's Transfer legs from or to the wallet, the aToken mint left out. */
function receiptLegs(
  logs: readonly { topics: readonly Hex[]; data: Hex; address: string; logIndex: number }[],
  wallet: string,
): RawLeg[] {
  const raw: RawLeg[] = [];
  for (const log of logs) {
    if (log.topics[0] !== TRANSFER_TOPIC || log.topics.length !== 3) continue;
    try {
      const ev = decodeEventLog({ abi: TRANSFER, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      const from = ev.args.from.toLowerCase();
      const to = ev.args.to.toLowerCase();
      if (from !== wallet && to !== wallet) continue;
      raw.push({ token: log.address.toLowerCase(), from, to, value: ev.args.value, logIndex: log.logIndex });
    } catch {
      // An ERC-721 Transfer shares the topic with a fourth indexed field.
    }
  }
  return dropInterestMints(raw, wallet);
}

/** A mint to the wallet of a token it also sent, or also received from
 *  another account, is the token minting the wallet's accrued interest as its
 *  balance moves (an aToken does this on every transfer), not a payment. The
 *  store's answer leaves out the first case only, so both paths pass here. */
function dropInterestMints(raw: RawLeg[], wallet: string): RawLeg[] {
  const moved = new Set(
    raw.filter((r) => r.from === wallet || (r.to === wallet && r.from !== ZERO)).map((r) => r.token),
  );
  return raw.filter((r) => !(r.from === ZERO && r.to === wallet && moved.has(r.token)));
}

/** Native legs to the wallet from Alchemy's asset-transfers index, the one
 *  chain source for an internal call's value without a trace. */
async function assetTransfers(
  chainId: ChainId,
  hash: string,
  wallet: string,
  blockNumber: number,
): Promise<RawNative[]> {
  const block = `0x${blockNumber.toString(16)}`;
  const res = (await chainClient(chainId).request({
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
  return (res.transfers ?? [])
    .filter((t) => t.hash.toLowerCase() === hash && t.rawContract.value != null)
    .map((t) => ({ from: t.from.toLowerCase(), value: BigInt(t.rawContract.value!) }));
}

async function read(chainId: ChainId, hash: string, wallet: string): Promise<{ answer: Answer; rpcCalls: number }> {
  let rpcCalls = 0;
  const stored = await fetchStoredTxLegs(chainId, hash, wallet);
  let blockNumber: number;
  let to: string | null;
  let legsRaw: RawLeg[];
  if (stored) {
    blockNumber = stored.blockNumber;
    to = stored.to;
    legsRaw = dropInterestMints(
      stored.erc20.map((l) => ({ ...l, value: BigInt(l.raw) })),
      wallet,
    );
  } else {
    rpcCalls++;
    const receipt = await chainClient(chainId).getTransactionReceipt({ hash: hash as Hex });
    blockNumber = Number(receipt.blockNumber);
    to = receipt.to ? receipt.to.toLowerCase() : null;
    legsRaw = receiptLegs(receipt.logs, wallet);
  }

  let native: RawNative[];
  let nativeSource: "trace" | "asset-transfers";
  if (stored?.native) {
    native = stored.native.map((n) => ({ from: n.from, value: BigInt(n.raw) }));
    nativeSource = "trace";
  } else {
    rpcCalls++;
    native = await assetTransfers(chainId, hash, wallet, blockNumber);
    nativeSource = "asset-transfers";
  }

  // Names and decimals for the tokens paid back, which the sale reading
  // prints; a token the wallet sent keeps its address (the row names it).
  const tokens = [...new Set(legsRaw.filter((r) => r.to === wallet && r.from !== wallet).map((r) => r.token))];
  if (tokens.length > 0) rpcCalls++; // one multicall; the helper keeps its own process cache, so this is an upper bound
  const meta = tokens.length > 0 ? await resolveErc20Meta(tokens, chainId) : new Map();

  const toLeg = (r: RawLeg, counterparty: string): TxLeg => {
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
        // The native balance's decimals: 18 on Arc too, where USDC's ERC-20
        // interface states 6.
        symbol: nativeCurrency(chainId).symbol,
        decimals: nativeCurrency(chainId).decimals,
        raw: t.value.toString(),
        counterparty: t.from,
        source: nativeSource,
      }),
    ),
  ];
  // Legs back in two or more tokens are ranked by USD at the block (the
  // rulings in lib/shared/tx-legs.ts): one request to rails-server, no chain
  // read of this process's, so `rpcCalls` does not count it.
  if (needsLegPrices({ sent, back })) {
    const assetOf = (l: TxLeg) => l.token ?? WRAPPED_NATIVE[chainId];
    const assets = [...new Set(back.map(assetOf).filter((a): a is string => !!a))];
    const prices = await aaveOraclePricesAtBlock(chainId, blockNumber, assets);
    for (const l of back) {
      const usd = prices.get(assetOf(l) ?? "");
      if (usd != null) l.usd = usd;
    }
  }
  return { answer: { chainId, hash, wallet, blockNumber, to, sent, back }, rpcCalls };
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
