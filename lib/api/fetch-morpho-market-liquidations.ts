import "server-only";

// Client for rails-server's per-market Morpho Blue liquidations (S1, rails-ops
// ui-jobs 554): GET /api/morpho/markets/:marketId/liquidations on Ethereum,
// /api/morpho-base/markets/:marketId/liquidations on Base. Raw integer strings
// and unix-second timestamps; `?badDebtOnly=1` narrows the list, the totals
// cover every liquidation. Base answers 503 `{ unavailable: true }` where its
// index is not configured. Cached as the route caches, a minute.
//
// STOPGAP until S1 is on main: with NODE_ENV development and RAILS_S1_FIXTURE=1
// the answer comes from data/s1-fixtures/morpho-liquidations-<chainId>.json, a
// read-only dump of the production tables (morpho_liquidation,
// morpho_liquidation_base) in the route's shape. Remove the fixture branch and
// the files once S1 is deployed.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";

export type MorphoLiquidationsChainId = 1 | 8453;

export interface MorphoMarketLiquidation {
  block: number;
  /** Unix seconds; null where the row has no block time. */
  timestamp: number | null;
  txHash: string;
  txIndex: number | null;
  /** Transaction-local on Ethereum, block-wide on Base. */
  logIndex: number;
  borrower: string | null;
  liquidator: string | null;
  repaidAssets: string;
  repaidShares: string;
  seizedAssets: string;
  badDebtAssets: string;
  badDebtShares: string;
}

export interface MorphoMarketLiquidations {
  chainId: number;
  /** 64 hex, no 0x, lowercased. */
  marketId: string;
  loanToken: string | null;
  collateralToken: string | null;
  totals: {
    count: number;
    repaidAssets: string;
    seizedAssets: string;
    badDebtAssets: string;
    badDebtShares: string;
    withBadDebt: number;
  };
  badDebtOnly: boolean;
  liquidations: MorphoMarketLiquidation[];
  tokens: Record<string, { symbol: string; decimals: number }>;
}

/** `unavailable`: Base's index is not configured (503). `error`: any other failure. */
export type MorphoLiquidationsAnswer =
  | { kind: "ok"; data: MorphoMarketLiquidations }
  | { kind: "unavailable" }
  | { kind: "error" };

const ROUTE: Record<MorphoLiquidationsChainId, string> = { 1: "morpho", 8453: "morpho-base" };

const fixtureOn = () => process.env.NODE_ENV === "development" && process.env.RAILS_S1_FIXTURE === "1";

interface FixtureFile {
  chainId: number;
  tokens: Record<string, { symbol: string; decimals: number }>;
  markets: Record<
    string,
    Pick<MorphoMarketLiquidations, "loanToken" | "collateralToken" | "totals"> & {
      liquidations?: MorphoMarketLiquidation[];
    }
  >;
}

const fixtures = new Map<number, Promise<FixtureFile>>();

function fixtureFile(chainId: MorphoLiquidationsChainId): Promise<FixtureFile> {
  let f = fixtures.get(chainId);
  if (!f) {
    const file = path.join(process.cwd(), "data", "s1-fixtures", `morpho-liquidations-${chainId}.json`);
    f = readFile(file, "utf8").then((s) => JSON.parse(s) as FixtureFile);
    fixtures.set(chainId, f);
  }
  return f;
}

/** The fixture's answer: the dump lists bad-debt rows only, and holds no
 *  market without a liquidation, which S1 answers with zero totals. */
async function fromFixture(
  chainId: MorphoLiquidationsChainId,
  id: string,
  badDebtOnly: boolean,
): Promise<MorphoLiquidationsAnswer> {
  if (!badDebtOnly) return { kind: "error" };
  try {
    const f = await fixtureFile(chainId);
    const m = f.markets[id];
    const tokens: MorphoMarketLiquidations["tokens"] = {};
    for (const a of [m?.loanToken, m?.collateralToken]) if (a && f.tokens[a]) tokens[a] = f.tokens[a];
    return {
      kind: "ok",
      data: {
        chainId,
        marketId: id,
        loanToken: m?.loanToken ?? null,
        collateralToken: m?.collateralToken ?? null,
        totals: m?.totals ?? {
          count: 0,
          repaidAssets: "0",
          seizedAssets: "0",
          badDebtAssets: "0",
          badDebtShares: "0",
          withBadDebt: 0,
        },
        badDebtOnly,
        liquidations: m?.liquidations ?? [],
        tokens,
      },
    };
  } catch (error) {
    console.error("morpho liquidations: the S1 fixture did not read", error);
    return { kind: "error" };
  }
}

/** GET /api/<morpho|morpho-base>/markets/:marketId/liquidations */
export async function fetchMorphoMarketLiquidations(
  chainId: MorphoLiquidationsChainId,
  marketId: string,
  badDebtOnly = false,
): Promise<MorphoLiquidationsAnswer> {
  const id = marketId.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(id)) return { kind: "error" };
  if (fixtureOn()) return fromFixture(chainId, id, badDebtOnly);
  const base = process.env.RAILS_API_URL;
  if (!base) return { kind: "error" };
  const p = `/api/${ROUTE[chainId]}/markets/${id}/liquidations${badDebtOnly ? "?badDebtOnly=1" : ""}`;
  try {
    const res = await fetch(`${base}${p}`, createAuthFetchOptions({ next: { revalidate: 60 } }));
    if (res.status === 503) return { kind: "unavailable" };
    if (!res.ok) {
      console.error(`morpho liquidations: ${p} answered ${res.status}`);
      return { kind: "error" };
    }
    const data = (await res.json()) as MorphoMarketLiquidations & { unavailable?: boolean };
    if (data.unavailable) return { kind: "unavailable" };
    return { kind: "ok", data };
  } catch (error) {
    console.error(`morpho liquidations: ${p} did not answer`, error);
    return { kind: "error" };
  }
}
