// sUSDS drip state at the page's sealed block: the stored chi and rho the
// share price grows from (convertToAssets = rpow(ssr, t − rho) × chi ÷ 10^27,
// SUsds.sol). The share price's receipt names them as its inputs.
//
// SERVER-ONLY (reads ALCHEMY_URL via lib/sources/chain/rpc). A failed read
// returns null and the receipt states the share price without its inputs.

import { parseAbi } from "viem";
import { alchemyClient } from "./rpc";
import { SUSDS } from "@/lib/sky-savings/constants";
import type { SkyAsOf, SkyDrip } from "@/lib/sky-savings/types";

const abi = parseAbi(["function chi() view returns (uint192)", "function rho() view returns (uint64)"]);

export async function readSkyDrip(block: number): Promise<SkyDrip | null> {
  try {
    const client = alchemyClient();
    const address = SUSDS.address as `0x${string}`;
    const blockNumber = BigInt(block);
    const [chi, rho] = await Promise.all([
      client.readContract({ address, abi, functionName: "chi", blockNumber }),
      client.readContract({ address, abi, functionName: "rho", blockNumber }),
    ]);
    return { chi: chi.toString(), rho: Number(rho) };
  } catch {
    return null;
  }
}

/** The api's asOf with the drip state at its block. */
export async function withSkyDrip(asOf: SkyAsOf): Promise<SkyAsOf> {
  return { ...asOf, drip: await readSkyDrip(asOf.block) };
}
