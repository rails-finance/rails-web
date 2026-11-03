// The event panels' at-block reads, asked of rails-server first.
// ----------------------------------------------------------------------------
// rails-server's `/api/at-block/compound/{factors,rates}`, `/tx/user-op` and
// `/dolomite/liquidation` read what the web's event-panel routes read
// (app/api/chain/compound/{absorb-factors,rates,tx-sender},
// app/api/chain/dolomite/liq-price) through its at-block store, keyless
// gateways first (rails-ops decisions/0056); `/api/compound/prices-at` answers
// Comet prices it stored at every event block (mig 372). Each answers the
// body of the web route it replaces.
//
// Null when the route cannot answer: no RAILS_API_URL, a refused connection, a
// non-2xx answer or 3 s without one; after a failure the chain is read for 30 s
// without asking (route-gate.ts). The caller then reads the chain as before.
//
// SERVER-ONLY.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { routeGate } from "./route-gate";

const gate = routeGate();

function ask<T>(key: string, path: string, params: Record<string, string>, readerIp?: string): Promise<T | null> {
  const qs = new URLSearchParams(params);
  return gate.json<T>(
    key,
    `${process.env.RAILS_API_URL}${path}?${qs.toString()}`,
    createAuthFetchOptions(undefined, readerIp),
  );
}

const isObject = (v: unknown): v is Record<string, unknown> => v != null && typeof v === "object";

export type CometFactor = { borrow: number; liquidate: number; liquidation: number };

/** Each asset's factors at the end of `block`; null where the route cannot answer. */
export async function serverCometFactors(
  chainId: number,
  comet: string,
  block: number,
  assets: readonly string[],
  readerIp?: string,
): Promise<Record<string, CometFactor> | null> {
  const body = await ask<{ block?: unknown; factors?: unknown }>(
    "compound",
    "/api/at-block/compound/factors",
    { chain: String(chainId), comet: comet.toLowerCase(), block: String(block), assets: assets.join(",") },
    readerIp,
  );
  if (!body || body.block !== block || !isObject(body.factors)) return null;
  const out: Record<string, CometFactor> = {};
  for (const [a, f] of Object.entries(body.factors)) {
    if (!isObject(f)) return null;
    const { borrow, liquidate, liquidation } = f;
    if (typeof borrow !== "number" || typeof liquidate !== "number" || typeof liquidation !== "number") return null;
    out[a] = { borrow, liquidate, liquidation };
  }
  return out;
}

export type CometRate = { utilization: number; supply: number; borrow: number };

/** A Comet's rates at up to four blocks; a block whose read failed is absent.
 *  Null where the route cannot answer (none of the blocks read). */
export async function serverCometRates(
  chainId: number,
  comet: string,
  blocks: readonly number[],
  readerIp?: string,
): Promise<Record<string, CometRate> | null> {
  const body = await ask<{ rates?: unknown }>(
    "compound",
    "/api/at-block/compound/rates",
    { chain: String(chainId), comet: comet.toLowerCase(), blocks: blocks.join(",") },
    readerIp,
  );
  if (!body || !isObject(body.rates)) return null;
  const out: Record<string, CometRate> = {};
  for (const [b, r] of Object.entries(body.rates)) {
    if (!isObject(r)) return null;
    const { utilization, supply, borrow } = r;
    if (typeof utilization !== "number" || typeof supply !== "number" || typeof borrow !== "number") return null;
    out[b] = { utilization, supply, borrow };
  }
  return out;
}

/** The Comet's stored getPrice answers at each block (raw, 8 decimals in the
 *  Comet's unit, keyed by token, the base token among them); a block the
 *  server has not stored is absent. Null where the route cannot answer.
 *  Ethereum and Base only. */
export async function serverCometPricesAt(
  chainId: number,
  comet: string,
  blocks: readonly number[],
  readerIp?: string,
): Promise<Record<string, Record<string, string>> | null> {
  const body = await ask<{ blocks?: unknown }>(
    "compound-prices",
    "/api/compound/prices-at",
    { chain: String(chainId), comet: comet.toLowerCase(), blocks: blocks.join(",") },
    readerIp,
  );
  if (!body || !isObject(body.blocks)) return null;
  const out: Record<string, Record<string, string>> = {};
  for (const [b, row] of Object.entries(body.blocks)) {
    if (!isObject(row) || !isObject(row.prices)) return null;
    out[b] = Object.fromEntries(
      Object.entries(row.prices).filter((e): e is [string, string] => typeof e[1] === "string"),
    );
  }
  return out;
}

/** Whether one of the transaction's user operations was the account's:
 *  `userOpSender` is the account then, else null. Undefined where the route
 *  cannot answer. */
export async function serverUserOpSender(
  chainId: number,
  tx: string,
  account: string,
  readerIp?: string,
): Promise<{ userOpSender: string | null } | undefined> {
  const body = await ask<{ userOpSender?: unknown }>(
    "tx",
    "/api/at-block/tx/user-op",
    { chain: String(chainId), tx, account },
    readerIp,
  );
  if (!body || !(body.userOpSender === null || typeof body.userOpSender === "string")) return undefined;
  return { userOpSender: body.userOpSender };
}

/** Where a liquidation's two prices came from: the core's LogOraclePrice in
 *  the liquidation's transaction, getMarketPrice at the block, or one of each. */
export type DolomitePriceSource = "transaction" | "chain" | "mixed";

export interface DolomiteLiquidationAnswer {
  blockNumber: number;
  heldMarketId: number;
  owedMarketId: number;
  heldPriceRaw: string;
  owedPriceRaw: string;
  priceSource: DolomitePriceSource;
  /** Each leg's source, where the answer names it. */
  heldPriceSource?: "transaction" | "chain";
  owedPriceSource?: "transaction" | "chain";
  spreadRaw: string | null;
  spreadBasis: "account-aware" | "pair";
  baseSpreadRaw: string | null;
  heldSpreadPremiumRaw: string | null;
  owedSpreadPremiumRaw: string | null;
  overrideSpreadRaw: string | null;
  healthBefore: number | null;
}

const strOrNull = (v: unknown) => v === null || typeof v === "string";
const legSource = (v: unknown) => (v === "transaction" || v === "chain" ? v : undefined);

/** A Dolomite liquidation's prices, spread and health; null where the route cannot answer. */
export async function serverDolomiteLiquidation(
  q: { block: number; held: number; owed: number; owner?: string; account?: string },
  readerIp?: string,
): Promise<DolomiteLiquidationAnswer | null> {
  const params: Record<string, string> = { block: String(q.block), held: String(q.held), owed: String(q.owed) };
  if (q.owner && q.account) Object.assign(params, { owner: q.owner, account: q.account });
  const b = await ask<Record<string, unknown>>("dolomite", "/api/at-block/dolomite/liquidation", params, readerIp);
  if (
    !b ||
    b.blockNumber !== q.block ||
    b.heldMarketId !== q.held ||
    b.owedMarketId !== q.owed ||
    typeof b.heldPriceRaw !== "string" ||
    typeof b.owedPriceRaw !== "string" ||
    !(b.priceSource === "transaction" || b.priceSource === "chain" || b.priceSource === "mixed") ||
    !(b.spreadBasis === "account-aware" || b.spreadBasis === "pair") ||
    !strOrNull(b.spreadRaw) ||
    !strOrNull(b.baseSpreadRaw) ||
    !strOrNull(b.heldSpreadPremiumRaw) ||
    !strOrNull(b.owedSpreadPremiumRaw) ||
    !strOrNull(b.overrideSpreadRaw) ||
    !(b.healthBefore === null || typeof b.healthBefore === "number")
  )
    return null;
  const heldPriceSource = legSource(b.heldPriceSource);
  const owedPriceSource = legSource(b.owedPriceSource);
  return {
    blockNumber: q.block,
    heldMarketId: q.held,
    owedMarketId: q.owed,
    heldPriceRaw: b.heldPriceRaw,
    owedPriceRaw: b.owedPriceRaw,
    priceSource: b.priceSource,
    ...(heldPriceSource ? { heldPriceSource } : {}),
    ...(owedPriceSource ? { owedPriceSource } : {}),
    spreadRaw: b.spreadRaw as string | null,
    spreadBasis: b.spreadBasis,
    baseSpreadRaw: b.baseSpreadRaw as string | null,
    heldSpreadPremiumRaw: b.heldSpreadPremiumRaw as string | null,
    owedSpreadPremiumRaw: b.owedSpreadPremiumRaw as string | null,
    overrideSpreadRaw: b.overrideSpreadRaw as string | null,
    healthBefore: b.healthBefore as number | null,
  };
}
