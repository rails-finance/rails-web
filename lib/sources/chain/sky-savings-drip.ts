// sUSDS drip state at the page's sealed block: the stored chi and rho the
// share price grows from (convertToAssets = rpow(ssr, t − rho) × chi ÷ 10^27,
// SUsds.sol). The share price's receipt names them as its inputs.
//
// Asked of rails-server first: `/api/at-block/sky-savings/drip` reads the two
// calls once through its at-block store, keyless leg first, and keeps them
// once the block is finalized (rails-ops decisions/0056 step 2, census W-SK1).
// Where the route cannot answer (no RAILS_API_URL, a refused connection, a
// 5xx or 429, 3 s without an answer; after a failure for 30 s, route-gate.ts)
// the contract is read at the block as before.
//
// SERVER-ONLY (reads ALCHEMY_URL via lib/sources/chain/rpc). A failed read
// returns null and the receipt states the share price without its inputs.

import { parseAbi } from "viem";
import { alchemyClient } from "./rpc";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { routeGate } from "@/lib/sources/api/route-gate";
import { SUSDS } from "@/lib/sky-savings/constants";
import type { SkyAsOf, SkyDrip } from "@/lib/sky-savings/types";

const abi = parseAbi(["function chi() view returns (uint192)", "function rho() view returns (uint64)"]);

const gate = routeGate();

/** rails-server's chi and rho at the block; null where the route cannot answer. */
async function serverSkyDrip(block: number): Promise<SkyDrip | null> {
  const body = await gate.json<{ block?: unknown; chi?: unknown; rho?: unknown }>(
    "sky-savings",
    `${process.env.RAILS_API_URL}/api/at-block/sky-savings/drip?block=${block}`,
    createAuthFetchOptions(),
  );
  if (
    !body ||
    body.block !== block ||
    typeof body.chi !== "string" ||
    !/^\d+$/.test(body.chi) ||
    typeof body.rho !== "number" ||
    !Number.isSafeInteger(body.rho)
  )
    return null;
  return { chi: body.chi, rho: body.rho, readBy: "rails-server" };
}

export async function readSkyDrip(block: number): Promise<SkyDrip | null> {
  const served = await serverSkyDrip(block);
  if (served) return served;
  try {
    const client = alchemyClient();
    const address = SUSDS.address as `0x${string}`;
    const blockNumber = BigInt(block);
    const [chi, rho] = await Promise.all([
      client.readContract({ address, abi, functionName: "chi", blockNumber }),
      client.readContract({ address, abi, functionName: "rho", blockNumber }),
    ]);
    return { chi: chi.toString(), rho: Number(rho), readBy: "chain" };
  } catch {
    return null;
  }
}

/** The api's asOf with the drip state at its block. */
export async function withSkyDrip(asOf: SkyAsOf): Promise<SkyAsOf> {
  return { ...asOf, drip: await readSkyDrip(asOf.block) };
}
