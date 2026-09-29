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
//      the head. The balance the log before it recorded is what the claim
//      paid out: this Trove's surplus plus any other the same owner had
//      waiting in the pool, since claimColl pays the account's whole balance.
//
// The log search asks the state RPC first and, when it refuses the range,
// the chain's wide-range logs lane (`chainLogsClient`: BASE_BACKFILL_RPC_URL
// on Base; on Ethereum the two are one endpoint, so there is no second try). Neither of Base's
// other two lanes is tried: BASE_LOGS_RPC_URL refuses any range over 1,000
// blocks and BASE_HYPERRPC_URL has answered a whole-life query short with no
// error (scripts/census-morpho-base-vaults.mjs), which here would read a
// claimed surplus as still claimable.
//
// Claimed: a zeroing log after the liquidation. Claimable: none, and the
// amount is this Trove's surplus (capped at the head balance, which also
// holds any other Trove's surplus the same owner has on the branch).
// SERVER-ONLY.

import { parseAbi, type Hex, type PublicClient } from "viem";
import { chainClient, chainLogsClient } from "./rpc";
import { chainMeta, type ChainId } from "@/lib/shared/chains";

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
  /** The claim log's index in its block, to order it among same-block rows. */
  logIndex?: number | null;
  /** What the claim paid out in all: the owner's pool balance the log before
   *  it recorded (integer string). Above `surplusRaw` when the same claim
   *  also paid out other Troves' surplus. Null when no log dated the claim. */
  paidRaw?: string | null;
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
  const logs = await balanceLogs(chainId, pool, owner, liqBlock, head);
  if (logs) {
    // Re-checked in code: an endpoint may ignore the indexed-account filter.
    const own = logs
      .filter((l) => l.args._account?.toLowerCase() === owner.toLowerCase())
      .sort((a, b) => Number(a.blockNumber! - b.blockNumber!) || a.logIndex! - b.logIndex!);
    const sinceCredit = (l: (typeof own)[number]) =>
      l.blockNumber! > liqBlock || (l.blockNumber === liqBlock && l.logIndex! > credit.logIndex);
    const zi = own.findIndex((l) => l.args._newBalance === BigInt(0) && sinceCredit(l));
    if (zi >= 0) {
      const zeroing = own[zi];
      // The balance the log before recorded is what the claim paid; the credit
      // log itself is in range, so there is always one.
      const prev = zi > 0 ? own[zi - 1].args._newBalance : null;
      const b = await client.getBlock({ blockNumber: zeroing.blockNumber! });
      claimed = {
        block: Number(zeroing.blockNumber),
        txHash: zeroing.transactionHash!,
        timestamp: Number(b.timestamp),
        logIndex: zeroing.logIndex ?? null,
        paidRaw: prev != null ? prev.toString() : null,
      };
    }
  } else if (balance < surplus) claimed = { block: null, txHash: null, timestamp: null };
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

/** The owner's CollBalanceUpdated logs from `from` to `to`: the state RPC
 *  first, then the chain's wide-range logs lane when it is a different
 *  endpoint. Null when every lane refused. */
async function balanceLogs(chainId: ChainId, pool: Hex, owner: string, from: bigint, to: bigint) {
  const meta = chainMeta(chainId);
  const lanes: (() => PublicClient)[] = [() => chainClient(chainId)];
  if (meta.logsRpcEnv !== meta.rpcEnv) lanes.push(() => chainLogsClient(chainId));
  for (const lane of lanes) {
    try {
      return await lane().getLogs({
        address: pool,
        event: POOL_ABI[0],
        args: { _account: owner as Hex },
        fromBlock: from,
        toBlock: to,
      });
    } catch {
      // The next lane, if any.
    }
  }
  return null;
}
