import { NextRequest, NextResponse } from "next/server";
import { decodeEventLog, parseAbi } from "viem";
import { chainClient } from "@/lib/sources/chain/rpc";
import { COMPOUND_DEPLOYMENT_CHAIN, compoundDeploymentParam } from "@/lib/compound/deployments";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { serverUserOpSender } from "@/lib/sources/api/event-panels-at-block";

// Who sent a Comet row's transaction, for the rows where the owner neither
// signed it nor funded it. A smart-account wallet (ERC-4337) never signs a
// transaction itself: it signs a user operation, and a bundler sends a
// transaction to the EntryPoint contract carrying it. The EntryPoint then
// emits UserOperationEvent with the account as `sender`, which is what this
// reads from the receipt.
//
// `?deployment=ethereum|base|arbitrum&tx=<hash>&account=<address>` answers
// `{ userOpSender }`: the account when one of the transaction's user
// operations was the account's, else null.
//
// Ethereum and Base ask rails-server's `/api/at-block/tx/user-op` first, which
// reads the receipt through its at-block store; where it cannot answer, and on
// Arbitrum, the receipt is read from the chain.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const USER_OP_EVENT = parseAbi([
  "event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)",
]);

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const deploymentKey = compoundDeploymentParam(q.get("deployment"));
  const chainId = COMPOUND_DEPLOYMENT_CHAIN[deploymentKey];
  const tx = (q.get("tx") ?? "").toLowerCase();
  const account = (q.get("account") ?? "").toLowerCase();
  if (!HASH.test(tx) || !ADDRESS.test(account)) {
    return NextResponse.json({ error: "tx and account are required" }, { status: 400 });
  }
  // A mined transaction never changes.
  const immutable = { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable" } };
  const served =
    deploymentKey !== "arbitrum"
      ? await serverUserOpSender(chainId, tx, account, readerIpFromRequest(request))
      : undefined;
  if (served) return NextResponse.json(served, immutable);
  try {
    const receipt = await chainClient(chainId).getTransactionReceipt({ hash: tx as `0x${string}` });
    let userOpSender: string | null = null;
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: USER_OP_EVENT, data: log.data, topics: log.topics });
        if (ev.args.sender.toLowerCase() === account) {
          userOpSender = account;
          break;
        }
      } catch {
        // Not a UserOperationEvent.
      }
    }
    return NextResponse.json({ userOpSender }, immutable);
  } catch (error) {
    console.error("Error reading a Comet row's transaction:", error);
    return NextResponse.json({ userOpSender: null });
  }
}
