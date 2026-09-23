// The ERC-4626 log primitives both vault-timeline readers are built out of.
// SERVER-ONLY.
// ----------------------------------------------------------------------------
// A holder's life inside a vault is the same three events on every chain and in
// every family — `Transfer`, `Deposit`, `Withdraw` — read the same way, merged
// the same way and replayed the same way. That arithmetic lives here once so
// `aave-ethereum-vault-timeline.ts` and `morpho-base-vault-timeline.ts` cannot
// drift into two answers to one question. What stays in each reader is what
// genuinely differs: which lane, which `fromBlock`, which family events, and
// what the rows say.
//
// EVERY TOPIC0 IS COMPUTED FROM A FRAGMENT. A pasted literal is a claim nobody
// can check against the ABI it came from, and nothing here makes one.
//
// The decode is deliberately hand-rolled against the raw `eth_getLogs` answer
// rather than run through viem's `parseEventLogs`: these sweeps go out as bare
// JSON-RPC requests so the range and the topics are exactly what was asked for,
// and the two fields a row needs — the 20-byte tails of two indexed addresses
// and one non-indexed word — are the cheapest part of a log to read.

import { decodeAbiParameters, parseAbiItem, toEventSelector } from "viem";
import type { VaultHolderEvent } from "@/lib/shared/vault-holder-timeline";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO = BigInt(0);

export const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
export const DEPOSIT_EVENT = parseAbiItem(
  "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)",
);
export const WITHDRAW_EVENT = parseAbiItem(
  "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)",
);

/** The three ERC-4626 topic0s every vault emits, whatever family it is. */
export const ERC4626_TOPIC = {
  transfer: toEventSelector(TRANSFER_EVENT),
  deposit: toEventSelector(DEPOSIT_EVENT),
  withdraw: toEventSelector(WITHDRAW_EVENT),
} as const;

/** One raw log as `eth_getLogs` answers it — hex throughout, undecoded. */
export interface RawLog {
  topics: string[];
  data: string;
  blockNumber: string;
  logIndex: string;
  transactionHash: string;
}

/** A topic-filtered sweep over one contract, as each reader wires its own lane
 *  and its own block range. `null` is a wildcard position. */
export type LogSweep = (topics: (string | null)[]) => Promise<RawLog[]>;

/** The 20-byte tail of a 32-byte address topic, lower-cased. */
export const addressOfTopic = (topic: string | undefined): string =>
  topic ? `0x${topic.slice(26)}`.toLowerCase() : ZERO_ADDRESS;

/** An address left-padded into a 32-byte topic. */
export const topicOfAddress = (address: string): string =>
  `0x${"0".repeat(24)}${address.toLowerCase().replace(/^0x/, "")}`;

/** A block number as the `0x`-prefixed hex `eth_getLogs` wants. */
export const hexBlock = (n: bigint | number): string => `0x${n.toString(16)}`;

/** Two words of a log's data, as `Deposit` and `Withdraw` both declare them. */
export const assetsAndShares = (data: string): { assets: bigint; shares: bigint } => {
  const [assets, shares] = decodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], data as `0x${string}`);
  return { assets, shares };
};

/**
 * Both directions of a holder's `Transfer` sweep, de-duplicated by
 * `(txHash, logIndex)` and ordered by `(blockNumber, logIndex)`.
 *
 * The de-duplication is not defensive tidying: a self-transfer carries the
 * holder in BOTH topics and so comes back from both sweeps, and counting it
 * twice would put a phantom pair of legs in the replay.
 *
 * Ordering across two sweeps of ONE address on ONE contract is safe — there is
 * one source, so `(block, logIndex)` is the chain's own order rather than a
 * comparison between two records of it.
 */
export function mergeTransfers(outLogs: RawLog[], inLogs: RawLog[]): RawLog[] {
  const seen = new Set<string>();
  const all: RawLog[] = [];
  for (const log of [...outLogs, ...inLogs]) {
    const id = `${log.transactionHash}:${log.logIndex}`;
    if (seen.has(id)) continue;
    seen.add(id);
    all.push(log);
  }
  return all.sort((a, b) => {
    const block = BigInt(a.blockNumber) - BigInt(b.blockNumber);
    if (block !== ZERO) return block < ZERO ? -1 : 1;
    return Number(BigInt(a.logIndex) - BigInt(b.logIndex));
  });
}

/** The signed sum — the quantity the gate compares against `balanceOf`. A
 *  self-transfer's `+=` and `-=` cancel, which is why it is a row with a zero
 *  delta rather than a skip. */
export function replayTransfers(transfers: RawLog[], holder: string): bigint {
  let total = ZERO;
  for (const log of transfers) {
    const value = BigInt(log.data);
    if (addressOfTopic(log.topics[2]) === holder) total += value;
    if (addressOfTopic(log.topics[1]) === holder) total -= value;
  }
  return total;
}

/** What one `Transfer` was, decided by the zero address and never by a label. A
 *  log whose two ends are both this holder is its own case: calling it an
 *  arrival would say shares came from somewhere. */
export function classifyTransfer(from: string, to: string, holder: string): VaultHolderEvent["kind"] {
  if (from === holder && to === holder) return "transfer-self";
  if (from === ZERO_ADDRESS) return "deposit";
  if (to === ZERO_ADDRESS) return "withdrawal";
  return to === holder ? "transfer-in" : "transfer-out";
}

/** The other end of a transfer, or null where there is none: a mint and a burn
 *  have the zero address at one end and a self-transfer has this same address
 *  at both. An address and nothing more — never a name. */
export function counterpartyOf(
  kind: VaultHolderEvent["kind"],
  from: string,
  to: string,
  holder: string,
): string | null {
  if (kind === "deposit" || kind === "withdrawal" || kind === "transfer-self" || kind === "cooldown") return null;
  return to === holder ? from : to;
}

/**
 * The asset leg, claimed once each. A row's `assets` is the ERC-4626 event's own
 * `assets` word, matched to the row by TRANSACTION AND SHARE COUNT — so a
 * transaction that ever carries two of one owner's legs pairs them rather than
 * handing both rows the first one. A row with no match states its shares alone
 * and says the leg was not emitted; nothing is divided out and presented as the
 * contract's figure.
 */
export function assetLegClaimer(
  depositLogs: RawLog[],
  withdrawLogs: RawLog[],
): (txHash: string, shares: bigint) => string | null {
  const legs = [...depositLogs, ...withdrawLogs].map((log) => ({
    txHash: log.transactionHash,
    ...assetsAndShares(log.data),
    taken: false,
  }));
  return (txHash: string, shares: bigint): string | null => {
    const exact = legs.find((l) => !l.taken && l.txHash === txHash && l.shares === shares);
    if (!exact) return null;
    exact.taken = true;
    return exact.assets.toString();
  };
}
