import { NextRequest, NextResponse } from "next/server";
import { decodeEventLog, parseAbi } from "viem";
import { chainClient } from "@/lib/sources/chain/rpc";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// Who sent a Comet row's transaction, for the rows where the owner neither
// signed it nor funded it. A smart-account wallet (ERC-4337) never signs a
// transaction itself: it signs a user operation, and a bundler sends a
// transaction to the EntryPoint contract carrying it. The EntryPoint then
// emits UserOperationEvent with the account as `sender`, which is what this
// reads from the receipt.
//
// `?deployment=ethereum|base&tx=<hash>&account=<address>` answers
// `{ from, to, userOpSender }`: `userOpSender` is the account when one of the
// transaction's user operations was the account's own, else null.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const USER_OP_EVENT = parseAbi([
  "event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)",
]);

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const chainId = q.get("deployment") === "base" ? BASE_CHAIN_ID : MAINNET_CHAIN_ID;
  const tx = (q.get("tx") ?? "").toLowerCase();
  const account = (q.get("account") ?? "").toLowerCase();
  if (!HASH.test(tx) || !ADDRESS.test(account)) {
    return NextResponse.json({ error: "tx and account are required" }, { status: 400 });
  }
  try {
    const client = chainClient(chainId);
    const [t, receipt] = await Promise.all([
      client.getTransaction({ hash: tx as `0x${string}` }),
      client.getTransactionReceipt({ hash: tx as `0x${string}` }),
    ]);
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
    return NextResponse.json(
      { from: t.from.toLowerCase(), to: t.to?.toLowerCase() ?? null, userOpSender },
      // A mined transaction never changes.
      { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable" } },
    );
  } catch (error) {
    console.error("Error reading a Comet row's transaction:", error);
    return NextResponse.json({ from: null, to: null, userOpSender: null });
  }
}
