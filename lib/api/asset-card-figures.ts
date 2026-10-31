// The figure a card without a price carries (rails-ops reference/asset-key-map.md,
// "The asset explorer"; Miles, 26 Oct 2026): each Liquity V2-family
// stablecoin's trove debt, the open troves' debt across its branches as Rails
// stores them (the explorer's trove listing); every other token rails-server's
// supply roster lists, its supply from Sieve (GET /api/prices/supply, its
// Transfer mints less burns, stamped with Sieve's checkpoint); ZCHF's supply
// read at head, as the Frankencoin system page reads it, until the stored one
// answers. Every other card without a price has none. A read that fails leaves
// its card blank.
//
// SERVER-ONLY: the ZCHF read goes through lib/sources/chain/rpc.

import "server-only";
import { unstable_cache } from "next/cache";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { loadFrankencoinSystemFromChain } from "@/lib/sources/chain/frankencoin-system";
import { FRANKENCOIN_ADDRESSES } from "@/lib/frankencoin/asset-catalog";
import { DEBT_ADDRESS as USDAF, DEBT_SYMBOL as USDAF_SYMBOL } from "@/lib/asymmetry/asset-catalog";
import { DEBT_ADDRESS as EBUSD, DEBT_SYMBOL as EBUSD_SYMBOL } from "@/lib/ebisu/asset-catalog";
import { DEBT_ADDRESS as BD, DEBT_SYMBOL as BD_SYMBOL } from "@/lib/basedollar/asset-catalog";
import type { CardFigure } from "@/lib/shared/asset-explorer";

const BOLD = "0x6440f144b7e50d6a8439336510312d2f54beb01d";
/** The chains rails-server's supply roster (sieve/token-supply.json) lists tokens on. */
const SUPPLY_CHAINS = [1, 8453] as const;

interface SupplyWire {
  symbol: string;
  decimals: number;
  supply: string;
  asOf: { block: number; ts: number | null };
}

/** Every stored supply the roster answers on a chain, by token; an unsettled token is left out. */
async function storedSupply(chain: number): Promise<[string, SupplyWire][]> {
  const api = process.env.RAILS_API_URL;
  if (!api) throw new Error("RAILS_API_URL environment variable is not set");
  const res = await fetch(
    `${api}/api/prices/supply?chain=${chain}`,
    createAuthFetchOptions({ cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) }),
  );
  if (!res.ok) throw new Error(`/api/prices/supply failed: ${res.status}`);
  const json = (await res.json()) as { tokens?: Record<string, SupplyWire | { unsettled: string }> };
  return Object.entries(json.tokens ?? {}).filter((e): e is [string, SupplyWire] => "supply" in e[1]);
}

/** A raw amount at `decimals` as a number of tokens. */
const units = (raw: string, decimals: number) =>
  Number(BigInt(raw) / BigInt(10) ** BigInt(Math.max(0, decimals - 6))) / 10 ** Math.min(6, decimals);
const TIMEOUT_MS = 8000;
const PAGE = 1000;

/** The Liquity V2 family's debt tokens and the trove listing that holds each one's troves. */
const TROVE_DEBT: { chain: number; token: string; symbol: string; explorer: string; path: string }[] = [
  { chain: 1, token: BOLD, symbol: "BOLD", explorer: "Liquity V2", path: "/api/troves" },
  { chain: 1, token: USDAF, symbol: USDAF_SYMBOL, explorer: "Asymmetry", path: "/api/asymmetry/troves" },
  { chain: 1, token: EBUSD, symbol: EBUSD_SYMBOL, explorer: "Ebisu", path: "/api/ebisu/troves" },
  { chain: 8453, token: BD, symbol: BD_SYMBOL, explorer: "Basedollar", path: "/api/basedollar/troves" },
];

interface TroveRow {
  collateralType: string;
  debt: { current: number };
}

/** The open troves' debt in one listing, every page of it, and their branches. */
async function troveDebt(path: string): Promise<{ debt: number; troves: number; branches: string[] }> {
  const api = process.env.RAILS_API_URL;
  if (!api) throw new Error("RAILS_API_URL environment variable is not set");
  let debt = 0;
  let troves = 0;
  const branches = new Set<string>();
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(
      `${api}${path}?status=open&limit=${PAGE}&offset=${offset}`,
      createAuthFetchOptions({ cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) }),
    );
    if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
    const json = (await res.json()) as { data?: TroveRow[]; pagination?: { total: number } };
    const rows = json.data ?? [];
    for (const r of rows) {
      debt += r.debt.current;
      troves += 1;
      branches.add(r.collateralType);
    }
    if (rows.length < PAGE || offset + PAGE >= (json.pagination?.total ?? 0)) break;
  }
  return { debt, troves, branches: [...branches].sort() };
}

const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** The figures by `chain:token`, cached ten minutes (the Frankencoin system
 *  page's revalidate). */
export const assetCardFigures = unstable_cache(
  async (): Promise<[string, CardFigure][]> => {
    const out: [string, CardFigure][] = [];
    const [stored, zchf, ...debts] = await Promise.all([
      Promise.all(
        SUPPLY_CHAINS.map((c) =>
          storedSupply(c)
            .then((xs) => xs.map(([t, w]): [string, SupplyWire] => [`${c}:${t}`, w]))
            .catch(() => []),
        ),
      ).then((xs) => new Map<string, SupplyWire>(xs.flat())),
      loadFrankencoinSystemFromChain().catch(() => null),
      ...TROVE_DEBT.map((t) => troveDebt(t.path).catch(() => null)),
    ]);
    const troveKeys = new Set(TROVE_DEBT.map((t) => `${t.chain}:${t.token.toLowerCase()}`));
    for (const [key, w] of stored) {
      // A Liquity V2-family stablecoin's card keeps its trove debt (Miles, 26 Oct 2026).
      if (troveKeys.has(key)) continue;
      out.push([
        key,
        {
          label: "Supply",
          amount: units(w.supply, w.decimals),
          unit: w.symbol,
          asOf: w.asOf.ts == null ? null : { block: w.asOf.block, ts: w.asOf.ts },
          title: `Every ${w.symbol} on ${key.startsWith("1:") ? "Ethereum" : "Base"}: its mints less its burns, as Rails's Sieve stores its transfers`,
        },
      ]);
    }
    const zchfKey = `1:${FRANKENCOIN_ADDRESSES.ZCHF.toLowerCase()}`;
    if (zchf && !zchf.chainStale && !stored.has(zchfKey)) {
      const asOf = { block: zchf.blockNumber, ts: Math.floor(Date.now() / 1000) };
      out.push([
        zchfKey,
        {
          label: "Supply",
          amount: zchf.zchfSupply,
          unit: "ZCHF",
          asOf,
          title:
            "Every ZCHF on Ethereum: the token's totalSupply(), read at head as the Frankencoin system page reads it",
        },
      ]);
    }
    TROVE_DEBT.forEach((t, i) => {
      const d = debts[i];
      if (!d || d.troves === 0) return;
      out.push([
        `${t.chain}:${t.token.toLowerCase()}`,
        {
          label: "Trove debt",
          amount: d.debt,
          unit: t.symbol,
          asOf: null,
          title: `The debt of ${t.explorer}'s ${d.troves.toLocaleString("en-US")} open troves across the ${list(d.branches)} branches, as Rails stores them`,
        },
      ]);
    });
    return out;
  },
  ["asset-card-figures-v2"],
  { revalidate: 600 },
);
