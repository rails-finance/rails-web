// How a loan's NFT collateral came back to the borrower between two loans.
// ----------------------------------------------------------------------------
// A borrower can post the same NFT (or PWN bundle) on a new loan after an
// earlier loan defaulted and the lender claimed it (loan 61 → 62: Bundle #58).
// The loan's events say nothing about the gap; the token contract does. This
// reads the token's transfers of that id from the prior lender, or to the new
// borrower, between the prior claim's block and the new loan's creation block.
//
// ERC-721 `Transfer(from, to, tokenId)` and ERC-1155 `TransferSingle(operator,
// from, to, id, value)`, two eth_getLogs each (from = lender, to = borrower),
// then one block read per match for its time. Cached for ten minutes.
// SERVER-ONLY.

import { parseAbiItem, type Hex } from "viem";
import { chainClient, chainLogsClient } from "./rpc";

const ERC721_TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
);
const ERC1155_SINGLE = parseAbiItem(
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
);

export interface PwnCollateralTransfer {
  from: string;
  to: string;
  txHash: string;
  blockNumber: number;
  timestamp: number;
}

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; rows: PwnCollateralTransfer[] }>();

/** Every transfer of `asset` #`id` from `lender` or to `borrower` in
 *  [fromBlock, toBlock], oldest first. Throws on an RPC failure. */
export async function readPwnCollateralTransfers(p: {
  asset: string;
  category: "ERC721" | "ERC1155";
  id: string;
  lender: string;
  borrower: string;
  fromBlock: number;
  toBlock: number;
}): Promise<PwnCollateralTransfer[]> {
  const key = JSON.stringify(p);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;

  const logs = chainLogsClient();
  const range = { fromBlock: BigInt(p.fromBlock), toBlock: BigInt(p.toBlock) };
  const address = p.asset as Hex;
  const lender = p.lender as Hex;
  const borrower = p.borrower as Hex;
  const id = BigInt(p.id);

  const found: { from: string; to: string; txHash: string; blockNumber: bigint; logIndex: number }[] = [];
  if (p.category === "ERC721") {
    for (const args of [
      { from: lender, tokenId: id },
      { to: borrower, tokenId: id },
    ]) {
      const got = await logs.getLogs({ address, event: ERC721_TRANSFER, args, ...range });
      for (const l of got)
        found.push({
          from: l.args.from!.toLowerCase(),
          to: l.args.to!.toLowerCase(),
          txHash: l.transactionHash!,
          blockNumber: l.blockNumber!,
          logIndex: l.logIndex ?? 0,
        });
    }
  } else {
    for (const args of [{ from: lender }, { to: borrower }]) {
      const got = await logs.getLogs({ address, event: ERC1155_SINGLE, args, ...range });
      for (const l of got)
        if (l.args.id === id)
          found.push({
            from: l.args.from!.toLowerCase(),
            to: l.args.to!.toLowerCase(),
            txHash: l.transactionHash!,
            blockNumber: l.blockNumber!,
            logIndex: l.logIndex ?? 0,
          });
    }
  }

  const seen = new Set<string>();
  const unique = found
    .filter((f) => {
      const k = `${f.txHash}:${f.logIndex}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => Number(a.blockNumber - b.blockNumber) || a.logIndex - b.logIndex);

  const state = chainClient();
  const times = new Map<bigint, number>();
  const rows: PwnCollateralTransfer[] = [];
  for (const f of unique) {
    if (!times.has(f.blockNumber)) {
      const b = await state.getBlock({ blockNumber: f.blockNumber });
      times.set(f.blockNumber, Number(b.timestamp));
    }
    rows.push({
      from: f.from,
      to: f.to,
      txHash: f.txHash,
      blockNumber: Number(f.blockNumber),
      timestamp: times.get(f.blockNumber)!,
    });
  }
  cache.set(key, { at: Date.now(), rows });
  return rows;
}
