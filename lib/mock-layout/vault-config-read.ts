// The layout mock's "Vault configuration" reads (Miles, 10 Nov 2026): a
// MetaMorpho vault's `fee()` and `feeRecipient()` at the protects read's head
// block, and the time of its creation block.
//
// SERVER-ONLY: the reads use the RPC keys.

import "server-only";
import { parseAbi, type Address } from "viem";
import type { ChainId } from "@/lib/shared/chains";
import { vaultHeadClient } from "@/lib/sources/api/head-reads-client";
import { chainClient } from "@/lib/sources/chain/rpc";

const ABI = parseAbi(["function fee() view returns (uint96)", "function feeRecipient() view returns (address)"]);

export interface MockVaultConfig {
  /** `fee()`, a WAD fraction, raw; null where the read failed. */
  fee: string | null;
  feeRecipient: string | null;
  /** The block the two were read at. */
  block: number | null;
  /** The creation block's time, seconds; null where it was not read. */
  createdAt: number | null;
}

export async function readMockVaultConfig(
  chainId: ChainId,
  vault: string,
  createdBlock: number,
  headBlock: number | null,
): Promise<MockVaultConfig> {
  const c = vaultHeadClient(chainId);
  const fees = (async () => {
    try {
      const block = headBlock != null ? BigInt(headBlock) : await c.getBlockNumber();
      const at = { address: vault as Address, abi: ABI, blockNumber: block } as const;
      const [fee, feeRecipient] = await Promise.all([
        c.readContract({ ...at, functionName: "fee" }),
        c.readContract({ ...at, functionName: "feeRecipient" }),
      ]);
      return { fee: fee.toString(), feeRecipient: feeRecipient.toLowerCase(), block: Number(block) };
    } catch (e) {
      console.error(`mock config read for ${chainId}:${vault} failed`, e);
      return { fee: null, feeRecipient: null, block: null };
    }
  })();
  const created = (async () => {
    if (!(createdBlock > 0)) return null;
    try {
      const b = await chainClient(chainId).getBlock({ blockNumber: BigInt(createdBlock) });
      return Number(b.timestamp);
    } catch {
      return null;
    }
  })();
  const [f, createdAt] = await Promise.all([fees, created]);
  return { ...f, createdAt };
}
