// A deployment's Morpho Blue roster, brought up to the index — server-only.
// ----------------------------------------------------------------------------
// The roster ships as a census baked at one block (morpho-deployments.ts), and
// a market created after that block is invisible to the markets view and the
// wallet sweep until the census is re-run. The Base roster once went 26 days
// and missed all five tokenised-stock markets (2026-09-19).
//
// Rails' own index already holds every CreateMarket log: rails-server serves
// the ones after a given block at /api/<morpho|morpho-base>/markets/created.
// This module asks for the tail past the census block and appends it, so the
// roster is current to the index without a re-census.
//
// Nothing from the index is trusted as it arrives. A market id IS the keccak
// of its params, so each tail row is re-derived here exactly as the census
// script re-derives the baked rows, and a row that does not reproduce is
// dropped. A failed or slow index read returns the baked roster unchanged: the
// census stays a complete answer as of its own block, which is the block the
// response then states.
//
// SERVER-ONLY.

import { encodeAbiParameters, keccak256 } from "viem";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { BASE_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { MorphoMarketCatalogEntry } from "@/lib/morpho/market-catalog";
import type { MorphoDeployment } from "./morpho-deployments";

const RAILS_API_URL = process.env.RAILS_API_URL;

/** How long one index read serves. A market is created a few times a day on
 *  Base; five minutes keeps a new one near-live without a request per page. */
const TTL_MS = 5 * 60_000;

/** The index read must not hold a page: past this the census answers alone. */
const TIMEOUT_MS = 4_000;

const MARKET_PARAMS = [
  {
    type: "tuple",
    components: [
      { name: "loanToken", type: "address" },
      { name: "collateralToken", type: "address" },
      { name: "oracle", type: "address" },
      { name: "irm", type: "address" },
      { name: "lltv", type: "uint256" },
    ],
  },
] as const;

/** Sieve's text rendering of CreateMarket's tuple. */
const PARAMS_RE =
  /^Tuple\(\[Address\((0x[0-9a-fA-F]{40})\), Address\((0x[0-9a-fA-F]{40})\), Address\((0x[0-9a-fA-F]{40})\), Address\((0x[0-9a-fA-F]{40})\), Uint\((\d+), 256\)\]\)$/;

interface CreatedResponse {
  markets: { id: string; marketParams: string; createdBlock: number }[];
  /** The block the index is complete to, or null when the api cannot say. */
  indexedTo: number | null;
}

function route(chainId: ChainId): string {
  return chainId === BASE_CHAIN_ID ? "/api/morpho-base/markets/created" : "/api/morpho/markets/created";
}

/** One tail row as a catalog entry, or null when its id does not reproduce. */
function verified(row: CreatedResponse["markets"][number]): MorphoMarketCatalogEntry | null {
  const m = PARAMS_RE.exec(row.marketParams);
  if (!m) return null;
  const [, loanToken, collateralToken, oracle, irm, lltv] = m;
  const id = `0x${row.id.replace(/^0x/, "").toLowerCase()}`;
  const derived = keccak256(
    encodeAbiParameters(MARKET_PARAMS, [
      {
        loanToken: loanToken as `0x${string}`,
        collateralToken: collateralToken as `0x${string}`,
        oracle: oracle as `0x${string}`,
        irm: irm as `0x${string}`,
        lltv: BigInt(lltv),
      },
    ]),
  );
  if (derived.toLowerCase() !== id) return null;
  return {
    id,
    loanToken: loanToken.toLowerCase(),
    collateralToken: collateralToken.toLowerCase(),
    oracle: oracle.toLowerCase(),
    irm: irm.toLowerCase(),
    lltv,
    createdBlock: row.createdBlock,
  };
}

async function readIndexed(deployment: MorphoDeployment): Promise<MorphoDeployment> {
  if (!RAILS_API_URL) return deployment;
  const url = `${RAILS_API_URL}${route(deployment.chainId)}?after=${deployment.censusBlock}`;
  const res = await fetch(url, createAuthFetchOptions({ cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) }));
  if (!res.ok) throw new Error(`${route(deployment.chainId)} answered ${res.status}`);
  const body = (await res.json()) as CreatedResponse;

  const known = new Set(deployment.markets.map((m) => m.id.toLowerCase()));
  const tail: MorphoMarketCatalogEntry[] = [];
  let refused = 0;
  for (const row of body.markets) {
    const entry = verified(row);
    if (!entry) refused++;
    else if (!known.has(entry.id)) tail.push(entry);
  }
  if (refused > 0) console.error(`morpho roster: ${refused} indexed market(s) did not reproduce their id — left out`);

  return {
    ...deployment,
    markets: tail.length > 0 ? [...deployment.markets, ...tail] : deployment.markets,
    // Complete as of the index's checkpoint where the api states one; the
    // mainnet api cannot, so there the census block still bounds the claim
    // (the tail only adds to a roster already complete to it).
    censusBlock:
      body.indexedTo != null && body.indexedTo > deployment.censusBlock ? body.indexedTo : deployment.censusBlock,
  };
}

/** A failed read is retried after this, not on every request behind it. */
const FAILED_TTL_MS = 60_000;

const cache = new Map<ChainId, { until: number; value: Promise<MorphoDeployment> }>();

/** The deployment with its roster brought up to the index. Never throws. */
export function withIndexedRoster(deployment: MorphoDeployment): Promise<MorphoDeployment> {
  const hit = cache.get(deployment.chainId);
  if (hit && Date.now() < hit.until) return hit.value;
  const entry = { until: Date.now() + TTL_MS, value: Promise.resolve(deployment) };
  entry.value = readIndexed(deployment).catch((err: unknown) => {
    console.error("morpho roster: index read failed, serving the census alone:", err);
    entry.until = Date.now() + FAILED_TTL_MS;
    return deployment;
  });
  cache.set(deployment.chainId, entry);
  return entry.value;
}
