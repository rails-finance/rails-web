// The reads behind a MetaMorpho vault page's Configuration and addresses: the
// vault's `fee()`, `feeRecipient()` and `guardian()` at the card's pinned
// block (the block `owner()` and `curator()` were read at), and the time of
// its creation block. One read per request (React `cache`).
//
// SERVER-ONLY: the reads use the RPC keys.

import "server-only";
import { cache } from "react";
import { parseAbi, type Address } from "viem";
import type { ChainId } from "@/lib/shared/chains";
import { vaultHeadClient } from "@/lib/sources/api/head-reads-client";
import { serverHeadStampAt } from "@/lib/sources/api/server-head-stamps";
import { chainClient } from "@/lib/sources/chain/rpc";
import type { ServerRead } from "@/lib/shared/server-head-read";

const ABI = parseAbi([
  "function fee() view returns (uint96)",
  "function feeRecipient() view returns (address)",
  "function guardian() view returns (address)",
]);

const ZERO = /^0x0{40}$/;

export interface VaultConfig {
  /** The block the three calls were read at; null where the read failed. */
  block: number | null;
  /** rails-server's read of `block`, where it answered every call. */
  readBy?: ServerRead;
  /** `fee()`, a WAD fraction, raw. */
  fee: string | null;
  /** `feeRecipient()`; null at the zero address or where the read failed. */
  feeRecipient: string | null;
  /** `guardian()`; null at the zero address or where the read failed. */
  guardian: string | null;
  /** The creation block's time, seconds; null where it was not read. */
  createdAt: number | null;
}

const orNull = (a: string) => (ZERO.test(a) ? null : a.toLowerCase());

export const readVaultConfig = cache(
  async (chainId: ChainId, vault: string, block: number, createdBlock: number): Promise<VaultConfig> => {
    const calls = (async () => {
      try {
        const c = vaultHeadClient(chainId);
        const at = { address: vault as Address, abi: ABI, blockNumber: BigInt(block) } as const;
        const [fee, feeRecipient, guardian] = await Promise.all([
          c.readContract({ ...at, functionName: "fee" }),
          c.readContract({ ...at, functionName: "feeRecipient" }),
          c.readContract({ ...at, functionName: "guardian" }),
        ]);
        const head = serverHeadStampAt(chainId, block);
        return {
          block,
          ...(head ? { readBy: { ...head, block } } : {}),
          fee: fee.toString(),
          feeRecipient: orNull(feeRecipient),
          guardian: orNull(guardian),
        };
      } catch (e) {
        console.error(`The configuration read did not answer for ${chainId}:${vault}`, e);
        return { block: null, fee: null, feeRecipient: null, guardian: null };
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
    const [r, createdAt] = await Promise.all([calls, created]);
    return { ...r, createdAt };
  },
);
