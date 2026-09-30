// PWN v1.1 deadline extensions, read from the chain for a loan page.
// ----------------------------------------------------------------------------
// PWNSimpleLoan v1.1 moves a loan's deadline with
// `LOANExpirationDateExtended(uint256 indexed loanId, uint40 extendedExpirationDate)`.
// Only the LOAN holder can call it (pwn_contracts tag v1.1,
// `extendLOANExpirationDate`: `CallerNotLOANTokenHolder`), the new date must be
// later than the current one and at most 30 days past the call, and nothing is
// paid for it. The index did not capture the event until rails-server mig 370,
// so loans 27, 29, 31 and 38 read as repaid after a deadline the contract would
// have refused (`repayLOAN` reverts `LoanDefaulted` once the expiration passes).
//
// Until that migration is on the box, the proxy asks the chain for a loan's
// extensions whenever the index answered none for a v1.1 loan, and hands them
// to the timeline shaped as index rows. Once the index carries them this read
// never fires: the proxy only asks for loans with no `extended` row.
//
// One eth_getLogs over the v1.1 contract filtered on the loan ids (topic 1),
// then one block and one transaction read per log for the time and the sender.
// Ten logs exist in all (2026-09-30), so a page costs at most a handful of
// reads, cached for ten minutes. SERVER-ONLY.

import { parseAbiItem, type Hex } from "viem";
import { chainClient, chainLogsClient } from "./rpc";
import { PWN_ADDRESSES } from "@/lib/pwn/asset-catalog";

const EXTENDED = parseAbiItem(
  "event LOANExpirationDateExtended(uint256 indexed loanId, uint40 extendedExpirationDate)",
);

/** The sieve stanza's floor for the v1.1 contract, below its first loan. */
const V11_FROM_BLOCK = BigInt(18_000_000);

export interface PwnChainExtension {
  loanId: string;
  blockNumber: number;
  timestamp: number;
  txHash: string;
  /** Position of the log within its transaction's receipt (the index's convention). */
  logIndex: number;
  /** The sender, lowercase — the LOAN holder, the only caller v1.1 allows. */
  from: string;
  /** The deadline this extension replaced (unix seconds): the loan's previous
   *  extension, else the expiration its terms struck. Null when neither is known. */
  previousDeadline: number | null;
  /** The new deadline (unix seconds). */
  newDeadline: number;
}

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; rows: PwnChainExtension[] }>();

/**
 * Every v1.1 extension of the given loans, oldest first per loan. `struckDeadline`
 * maps loan id → the expiration in its terms, to state what the first extension
 * replaced. Throws on an RPC failure; the caller decides what the page says.
 */
export async function readPwnV11Extensions(
  loanIds: string[],
  struckDeadline: Map<string, number>,
): Promise<PwnChainExtension[]> {
  const ids = [...new Set(loanIds)].sort((a, b) => Number(a) - Number(b));
  if (ids.length === 0) return [];
  const key = ids.join(",");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;

  const logs = await chainLogsClient().getLogs({
    address: PWN_ADDRESSES.SIMPLE_LOAN_V11 as Hex,
    event: EXTENDED,
    args: { loanId: ids.map((id) => BigInt(id)) },
    fromBlock: V11_FROM_BLOCK,
    toBlock: "latest",
  });

  const state = chainClient();
  const blocks = new Map<bigint, number>();
  const rows: PwnChainExtension[] = [];
  for (const log of logs) {
    if (log.blockNumber == null || log.transactionHash == null) continue;
    if (!blocks.has(log.blockNumber)) {
      const b = await state.getBlock({ blockNumber: log.blockNumber });
      blocks.set(log.blockNumber, Number(b.timestamp));
    }
    const [tx, receipt] = await Promise.all([
      state.getTransaction({ hash: log.transactionHash }),
      state.getTransactionReceipt({ hash: log.transactionHash }),
    ]);
    const local = receipt.logs.findIndex((l) => l.logIndex === log.logIndex);
    rows.push({
      loanId: String(log.args.loanId),
      blockNumber: Number(log.blockNumber),
      timestamp: blocks.get(log.blockNumber)!,
      txHash: log.transactionHash,
      logIndex: local >= 0 ? local : Number(log.logIndex ?? 0),
      from: tx.from.toLowerCase(),
      previousDeadline: null,
      newDeadline: Number(log.args.extendedExpirationDate),
    });
  }

  rows.sort((a, b) => Number(a.loanId) - Number(b.loanId) || a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  const last = new Map<string, number>();
  for (const r of rows) {
    r.previousDeadline = last.get(r.loanId) ?? struckDeadline.get(r.loanId) ?? null;
    last.set(r.loanId, r.newDeadline);
  }

  cache.set(key, { at: Date.now(), rows });
  return rows;
}
