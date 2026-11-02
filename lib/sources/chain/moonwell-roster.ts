// Which markets a Moonwell deployment has, and what prices them — server-only.
// ----------------------------------------------------------------------------
// A Compound v2 fork cross-collateralises every market through one Comptroller,
// so reading an account means reading it against the WHOLE roster: a wallet's
// borrow in a market it never entered still counts against its collateral. The
// account reader therefore needs the roster before it can ask anything, and on
// Base the roster is not a thing anyone wrote down — it is `getAllMarkets()`,
// twenty-one entries and governance still adding.
//
// So this resolves it, and caches it briefly. The cache is not a performance
// trick so much as a shape one: a listing changes on governance time (weeks),
// an account changes on block time (seconds), and holding the two at the same
// freshness would make every position read pay for a roster that did not move.
// A market listed during the TTL is invisible for at most a minute, and a
// wallet cannot have a position in a market that did not exist when the page
// was requested.
//
// A deployment that writes its roster down (Ethereum — see
// MOONWELL_DEPLOYMENT) skips all of this and costs nothing.
//
// Without a `reader`, Base's roster is read at one block through rails-server's
// head routes and, when the latest read fails, its stored snapshot (surface
// `moonwell:base:roster`, lib/sources/api/head-snapshot.ts).
//
// SERVER-ONLY — imported from /api/chain/* route handlers only.

import { getAddress, parseAbi, type PublicClient } from "viem";
import { chainClient } from "./rpc";
import { withHeadSnapshot } from "@/lib/sources/api/head-snapshot";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import { resolveErc20Meta, assertDecimalsRead } from "./erc20-meta";
import type { MoonwellDeployment, MoonwellRosterMarket } from "@/lib/moonwell/asset-catalog";

const COMPTROLLER_ABI = parseAbi([
  "function getAllMarkets() view returns (address[])",
  "function oracle() view returns (address)",
]);
const MTOKEN_ABI = parseAbi(["function underlying() view returns (address)"]);

export interface MoonwellRoster {
  /** The oracle the Comptroller itself prices with — read from it, never
   *  assumed, so a governance oracle swap is picked up within the TTL. */
  oracle: string;
  markets: MoonwellRosterMarket[];
}

/** Governance time, not block time — see the header. */
const TTL_MS = 60_000;

const cache = new Map<string, { at: number; roster: MoonwellRoster }>();

/** The head-snapshot surface Base's roster reads are stored under. */
const ROSTER_SURFACE = "moonwell:base:roster";

/**
 * The deployment's markets and its oracle. Returns null when the chain read
 * fails — the caller must treat that as "could not read", never as an empty
 * protocol, because an empty roster would render a wallet's real position as
 * nothing held.
 */
export async function resolveMoonwellRoster(
  deployment: MoonwellDeployment,
  now: number = Date.now(),
  /** The client the roster is read through where none is cached (a replay of
   *  rails-server's answer, or one pinned to a block). */
  reader?: PublicClient,
): Promise<MoonwellRoster | null> {
  if (deployment.fixed) return deployment.fixed;

  const key = `${deployment.chainId}:${deployment.comptroller}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.roster;

  try {
    const roster =
      reader || deployment.chainId !== BASE_CHAIN_ID
        ? await readRoster(reader ?? chainClient(deployment.chainId), deployment, !reader)
        : (
            await withHeadSnapshot(
              { surface: ROSTER_SURFACE, chainId: BASE_CHAIN_ID },
              (client) => readRoster(client, deployment, true),
              (r) => r != null,
            )
          ).value;
    if (!roster) return null;
    cache.set(key, { at: now, roster });
    return roster;
  } catch (error) {
    console.error("Moonwell roster read failed:", error);
    // A stale roster still names the right markets — governance moves it on
    // the order of weeks — so an expired entry is a far better answer than
    // none when the chain is briefly unreachable.
    return hit?.roster ?? null;
  }
}

/** The roster through `client`; null where no market can be named. `pin`
 *  takes the block first and reads every call at it (left off for an injected
 *  reader, which names its own block). */
async function readRoster(
  client: PublicClient,
  deployment: MoonwellDeployment,
  pin: boolean,
): Promise<MoonwellRoster | null> {
  const atBlock = pin ? { blockNumber: await client.getBlockNumber() } : {};
  const comptroller = deployment.comptroller as `0x${string}`;
  const [mTokens, oracle] = await Promise.all([
    client.readContract({ address: comptroller, abi: COMPTROLLER_ABI, functionName: "getAllMarkets", ...atBlock }),
    client.readContract({ address: comptroller, abi: COMPTROLLER_ABI, functionName: "oracle", ...atBlock }),
  ]);

  // Every Moonwell market is an ERC-20 market on both chains — native ETH
  // goes through a WETH router rather than a cETH-style market — so each
  // mToken names an underlying and none of these reverts. A market that DID
  // revert is dropped rather than guessed at: a market whose underlying
  // cannot be named cannot be scaled, and an unscaled balance is a wrong
  // number rather than a missing one.
  const underlyings = (await client.multicall({
    allowFailure: true,
    ...atBlock,
    contracts: mTokens.map((m) => ({ address: m, abi: MTOKEN_ABI, functionName: "underlying" }) as const),
  })) as { status: string; result?: unknown }[];

  const pairs: { mtoken: string; underlying: string }[] = [];
  mTokens.forEach((m, i) => {
    const r = underlyings[i];
    if (r?.status !== "success" || r.result == null) return;
    pairs.push({ mtoken: getAddress(m).toLowerCase(), underlying: getAddress(r.result as string).toLowerCase() });
  });

  const meta = await resolveErc20Meta(
    pairs.map((p) => p.underlying),
    deployment.chainId,
  );

  // An underlying whose decimals did not load would scale every balance in
  // its market by the 18 stand-in, and the roster is cached: the read fails
  // instead, and the catch below keeps the last good roster.
  assertDecimalsRead(
    meta,
    pairs.map((p) => p.underlying),
  );

  const markets: MoonwellRosterMarket[] = pairs.flatMap((p) => {
    const m = meta.get(p.underlying);
    if (!m) return [];
    // The mToken address IS the key: two Base markets both answer
    // `symbol()` = "mUSDC" (bridged and native USDC), so a symbol does not
    // identify a market here.
    return [{ key: p.mtoken, symbol: m.symbol, mtoken: p.mtoken, underlying: p.underlying, decimals: m.decimals }];
  });

  if (markets.length === 0) return null;

  return { oracle: getAddress(oracle).toLowerCase(), markets };
}
