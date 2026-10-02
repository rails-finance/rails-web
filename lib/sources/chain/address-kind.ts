// What an address is, from one code read at head (rails-ops ui-jobs 232): a
// key's account (no code), a smart account (an EIP-7702 delegation, or a
// Safe whose singleton is a released deployment), or a contract, with the
// `name()` and `symbol()` it answers. Every verdict is the chain's own
// answer; no explorer label is consulted.
//
// The code shapes are the ones the vault holder reader proves
// (aave-ethereum-vault.ts `readAaveVaultHolderShape`); this reader asks only
// what the wallet row states.
//
// SERVER-ONLY.

import { parseAbi } from "viem";
import { chainClient } from "./rpc";
import { EIP1167_RE, EIP7702_RE, SAFE_SINGLETONS, SLOT_ZERO } from "./aave-ethereum-vault";
import type { ChainId } from "@/lib/shared/chains";
import type { AddressKind } from "@/lib/api/fetch-address-kind";

const NAME_ABI = parseAbi(["function name() view returns (string)", "function symbol() view returns (string)"]);

const text = (r: { status: string; result?: unknown } | undefined): string | null => {
  if (r?.status !== "success" || typeof r.result !== "string") return null;
  const t = r.result.replace(/\0/g, "").trim();
  return t.length > 0 && t.length <= 64 ? t : null;
};

export async function readAddressKind(addressRaw: string, chainId: ChainId): Promise<AddressKind | null> {
  const address = addressRaw.toLowerCase() as `0x${string}`;
  const client = chainClient(chainId);
  try {
    const blockNumber = await client.getBlockNumber();
    const code = await client.getCode({ address, blockNumber });
    const block = Number(blockNumber);
    if (!code || code === "0x") return { kind: "account", block };
    const delegation = EIP7702_RE.exec(code);
    if (delegation) return { kind: "delegated", delegate: `0x${delegation[1].toLowerCase()}`, block };
    const minimal = EIP1167_RE.exec(code);
    const minimalImpl = minimal ? `0x${minimal[1].toLowerCase()}` : null;
    if (minimalImpl && SAFE_SINGLETONS[minimalImpl])
      return { kind: "safe", version: SAFE_SINGLETONS[minimalImpl], block };
    const [names, slotZero] = await Promise.all([
      client.multicall({
        allowFailure: true,
        blockNumber,
        contracts: [
          { address, abi: NAME_ABI, functionName: "name" },
          { address, abi: NAME_ABI, functionName: "symbol" },
        ],
      }),
      client.getStorageAt({ address, slot: SLOT_ZERO as `0x${string}`, blockNumber }),
    ]);
    if (slotZero && slotZero !== SLOT_ZERO) {
      const singleton = `0x${slotZero.slice(-40)}`.toLowerCase();
      if (SAFE_SINGLETONS[singleton]) return { kind: "safe", version: SAFE_SINGLETONS[singleton], block };
    }
    return { kind: "contract", name: text(names[0]), symbol: text(names[1]), block };
  } catch (error) {
    console.error("Address kind read failed:", error);
    return null;
  }
}
