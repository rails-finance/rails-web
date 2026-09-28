// A liquidated Liquity-V2-architecture Trove's collateral surplus, read at the
// head: is it still claimable, or has the owner claimed it? Shared by Liquity
// V2 and its forks (Asymmetry, Ebisu, Basedollar), which run the same
// CollSurplusPool.
//
// The index records the surplus the Liquidation log credited, but not the
// claim: BorrowerOperations.claimCollateral() pays the owner's whole pool
// balance out and emits nothing on the TroveManager. So the replayed figure
// alone cannot say whether the collateral is still there. This reader:
//
//   1. finds the branch's CollSurplusPool in the liquidation transaction — the
//      contract that emitted CollBalanceUpdated(owner, …) — and accepts it only
//      when its troveManagerAddress() is the branch's TroveManager;
//   2. takes this Trove's surplus as the owner's pool balance after the
//      liquidation minus the balance one block before it;
//   3. looks for a later CollBalanceUpdated(owner, 0) — the claim, which
//      empties the balance in one call — and reads getCollateral(owner) at
//      the head.
//
// Claimed: a zeroing log after the liquidation. Claimable: none, and the
// amount is this Trove's surplus (capped at the head balance, which also
// holds any other Trove's surplus the same owner has on the branch).
// SERVER-ONLY.

import { parseAbi, type Hex } from "viem";
import { chainClient } from "./rpc";
import type { ChainId } from "@/lib/shared/chains";

const POOL_ABI = parseAbi([
  "event CollBalanceUpdated(address indexed _account, uint256 _newBalance)",
  "function getCollateral(address _account) view returns (uint256)",
  "function troveManagerAddress() view returns (address)",
]);

/** keccak256("CollBalanceUpdated(address,uint256)") */
const COLL_BALANCE_UPDATED = "0xf0393a34d05e6567686ad4e097f9d9d2781565957394f1f0d984e5d8e6378f20";

/** The claim, when the pool's log search answered; a balance below the
 *  surplus with no log to date it reads as claimed with these fields null. */
export interface CollSurplusClaim {
  block: number | null;
  txHash: string | null;
  timestamp: number | null;
}

export interface CollSurplusRead {
  /** Head block the balance was read at. */
  blockNumber: number;
  /** The branch's CollSurplusPool; null when the liquidation credited no surplus. */
  pool: string | null;
  /** This Trove's surplus as the liquidation credited it (integer string). */
  surplusRaw: string;
  /** The owner's whole pool balance at the head (integer string). */
  balanceRaw: string;
  /** What the owner can still claim of this Trove's surplus (integer string). */
  claimableRaw: string;
  decimals: number;
  claimed: CollSurplusClaim | null;
}

const pad = (addr: string) => `0x${addr.toLowerCase().replace(/^0x/, "").padStart(64, "0")}` as Hex;

export async function readTroveCollSurplus(args: {
  chainId: ChainId;
  troveManager: string;
  owner: string;
  liquidationTx: string;
  decimals: number;
}): Promise<CollSurplusRead> {
  const { chainId, troveManager, owner, liquidationTx, decimals } = args;
  const client = chainClient(chainId);
  const head = await client.getBlockNumber();
  const ownerTopic = pad(owner);

  const receipt = await client.getTransactionReceipt({ hash: liquidationTx as Hex });
  const credits = receipt.logs.filter(
    (l) => l.topics[0]?.toLowerCase() === COLL_BALANCE_UPDATED && l.topics[1]?.toLowerCase() === ownerTopic,
  );
  const empty: CollSurplusRead = {
    blockNumber: Number(head),
    pool: null,
    surplusRaw: "0",
    balanceRaw: "0",
    claimableRaw: "0",
    decimals,
    claimed: null,
  };
  if (credits.length === 0) return empty;

  const credit = credits[credits.length - 1];
  const pool = credit.address as Hex;
  const tm = await client.readContract({ address: pool, abi: POOL_ABI, functionName: "troveManagerAddress" });
  if (tm.toLowerCase() !== troveManager.toLowerCase()) return empty;

  const liqBlock = receipt.blockNumber;
  const [before, balance] = await Promise.all([
    client.readContract({
      address: pool,
      abi: POOL_ABI,
      functionName: "getCollateral",
      args: [owner as Hex],
      blockNumber: liqBlock - BigInt(1),
    }),
    client.readContract({
      address: pool,
      abi: POOL_ABI,
      functionName: "getCollateral",
      args: [owner as Hex],
      blockNumber: head,
    }),
  ]);
  const after = BigInt(credit.data);
  const surplus = after > before ? after - before : BigInt(0);

  // The log search dates the claim; a provider that refuses the range leaves
  // the head balance to decide (a balance below this Trove's surplus can only
  // mean a claim emptied it since).
  let claimed: CollSurplusClaim | null = null;
  try {
    const logs = await client.getLogs({
      address: pool,
      event: POOL_ABI[0],
      args: { _account: owner as Hex },
      fromBlock: liqBlock,
      toBlock: head,
    });
    const zeroing = logs.find(
      (l) =>
        l.args._newBalance === BigInt(0) &&
        (l.blockNumber! > liqBlock || (l.blockNumber === liqBlock && l.logIndex! > credit.logIndex)),
    );
    if (zeroing) {
      const b = await client.getBlock({ blockNumber: zeroing.blockNumber! });
      claimed = {
        block: Number(zeroing.blockNumber),
        txHash: zeroing.transactionHash!,
        timestamp: Number(b.timestamp),
      };
    }
  } catch {
    if (balance < surplus) claimed = { block: null, txHash: null, timestamp: null };
  }
  const claimable = claimed ? BigInt(0) : surplus < balance ? surplus : balance;

  return {
    blockNumber: Number(head),
    pool: pool.toLowerCase(),
    surplusRaw: surplus.toString(),
    balanceRaw: balance.toString(),
    claimableRaw: claimable.toString(),
    decimals,
    claimed,
  };
}
