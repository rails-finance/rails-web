// The asset explorer's protocol chips (rails-ops reference/asset-key-map.md,
// "The asset explorer"): for each (chain, token), the Rails explorers that
// list it, each with the link that reaches that explorer for the asset. Two
// sources, both read here and nowhere typed by hand:
//
//   roster    every protocol series in the price roster (GET /api/prices/assets)
//             names the protocol whose oracle prices the token, by its key;
//   catalog   each explorer's own asset list: its asset catalog, its branch or
//             pool table, Morpho Blue's market census, LlamaLend's factories
//             (read at head, cached six hours), the Yearn vault census.
//
// A chip appears only for an explorer in lib/shared/protocols.ts. Its link is
// the explorer's listing filtered to the asset where the listing has a facet
// that names it (`?supply=`, `?market=`, `?ilk=`, `?collateralTypes=`,
// `?branch=`, `?pool=`, `?coll=`), else the explorer's asset or market page,
// else the explorer.
//
// A hit from a list that names the token's symbol carries it: a token an
// explorer lists that the roster does not price gets a card without price
// figures by that symbol (Miles, 26 Oct 2026). Morpho Blue's censuses name no
// symbol, so a token only they list has no card.
//
// SERVER-ONLY: the Morpho censuses are about 1.4 MB of source.

import { unstable_cache } from "next/cache";
import { PROTOCOLS } from "@/lib/shared/protocols";
import { NATIVE } from "@/lib/shared/asset-roster";
import type { RosterAsset } from "@/lib/shared/asset-roster";
import type { AssetChip, ChipLink } from "@/lib/shared/asset-explorer";
import { AAVE_V3_CATALOG } from "@/lib/aave-v3/asset-catalog";
import { SPARK_CATALOG } from "@/lib/spark/asset-catalog";
import { COMPOUND_DEPLOYMENT } from "@/lib/compound/asset-catalog";
import { COMPOUND_BASE_DEPLOYMENT } from "@/lib/compound-base/asset-catalog";
import { COMPOUND_V2_MARKETS } from "@/lib/compound-v2/asset-catalog";
import { MOONWELL_MARKETS } from "@/lib/moonwell/asset-catalog";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { ASYMMETRY_BRANCHES, DEBT_ADDRESS as USDAF, DEBT_SYMBOL as USDAF_SYMBOL } from "@/lib/asymmetry/asset-catalog";
import { EBISU_BRANCHES, DEBT_ADDRESS as EBUSD, DEBT_SYMBOL as EBUSD_SYMBOL } from "@/lib/ebisu/asset-catalog";
import { BASEDOLLAR_BRANCHES, DEBT_ADDRESS as BD, DEBT_SYMBOL as BD_SYMBOL } from "@/lib/basedollar/asset-catalog";
import { LIQUITY_V1_ADDRESSES } from "@/lib/liquity-v1/asset-catalog";
import { FX_POOLS, FX_ADDRESSES, FXUSD_META } from "@/lib/fx/asset-catalog";
import { MAPLE_POOLS } from "@/lib/maple/asset-catalog";
import { FRANKENCOIN_ADDRESSES } from "@/lib/frankencoin/asset-catalog";
import { LLAMALEND_ADDRESSES } from "@/lib/llamalend/asset-catalog";
import { MORPHO_MARKETS as MORPHO_ETHEREUM_MARKETS } from "@/lib/morpho/market-catalog";
import { MORPHO_MARKETS as MORPHO_BASE_MARKETS } from "@/lib/morpho-base/market-catalog";
import { YEARN_VAULTS } from "@/lib/yearn/vault-catalog";
import { discoverLlamalendMarkets } from "@/lib/sources/chain/llamalend-markets";

const BOLD = "0x6440f144b7e50d6a8439336510312d2f54beb01d";
const ZERO = /^0x0{40}$/;

/** One explorer listing one token: a facet value, or a page, or neither. */
interface Hit {
  explorer: string;
  chain: number;
  token: string;
  from: "roster" | "catalog";
  facet?: { param: string; value: string };
  page?: string;
  /** The symbol, where the list names it. */
  symbol?: string;
}

const lc = (s: string) => s.toLowerCase();
const byExplorer = new Map(PROTOCOLS.filter((p) => !p.unlaunched).map((p) => [p.id, p]));
const sparkSymbol = new Map(SPARK_CATALOG.map((a) => [a.address, a]));
const cometKey = (chain: number) =>
  new Map((chain === 1 ? COMPOUND_DEPLOYMENT : COMPOUND_BASE_DEPLOYMENT).markets.map((m) => [lc(m.comet), m.key]));
const COMETS = { 1: cometKey(1), 8453: cometKey(8453) } as Record<number, Map<string, string>>;
const cv2ByCtoken = new Map(COMPOUND_V2_MARKETS.map((m) => [m.ctoken, m]));
const moonwellByMtoken = new Map(MOONWELL_MARKETS.map((m) => [m.mtoken, m]));

/** Spark's listing facet for a reserve: supplying where it can be collateral, else borrowing. */
function sparkFacet(token: string): Hit["facet"] | undefined {
  const a = sparkSymbol.get(token);
  if (!a) return undefined;
  return { param: a.lt != null && a.lt > 0.001 ? "supply" : "borrow", value: a.symbol };
}

/** The explorer a roster series key belongs to, with its facet. */
function rosterHit(asset: RosterAsset, key: string): Hit | null {
  const [family, a, b] = key.split(":");
  const chain = asset.chain;
  const base = { chain, token: asset.token, from: "roster" as const };
  if (chain === 1) {
    switch (family) {
      case "aave-v3":
        return { ...base, explorer: "aave-v3", page: "/market" };
      case "spark":
        return { ...base, explorer: "spark", facet: sparkFacet(a) };
      case "aave-v4":
        return { ...base, explorer: "aave-v4", facet: { param: "supplyAssets", value: asset.symbol } };
      case "liquity-v2":
        return { ...base, explorer: "liquity", facet: { param: "collateralTypes", value: a } };
      case "cv3": {
        const k = COMETS[1].get(a);
        return { ...base, explorer: "compound", ...(k ? { facet: { param: "market", value: k } } : {}) };
      }
      case "cv2": {
        const m = cv2ByCtoken.get(a);
        return { ...base, explorer: "compound-v2", ...(m ? { facet: { param: "supply", value: m.symbol } } : {}) };
      }
      case "moonwell": {
        const m = moonwellByMtoken.get(a);
        return { ...base, explorer: "moonwell", ...(m ? { facet: { param: "supply", value: m.symbol } } : {}) };
      }
      case "maker":
        return { ...base, explorer: "makerdao", facet: { param: "ilk", value: a } };
      case "dolomite":
        return { ...base, explorer: "dolomite", page: "/markets" };
    }
  }
  if (chain === 8453) {
    switch (family) {
      case "aave-v3-base":
        return { ...base, explorer: "aave-v3-base", page: "/market" };
      case "seamless":
        return { ...base, explorer: "seamless", page: "/market" };
      case "cv3": {
        const k = COMETS[8453].get(a);
        return { ...base, explorer: "compound-base", ...(k ? { facet: { param: "market", value: k } } : {}) };
      }
      case "moonwell":
        return { ...base, explorer: "moonwell-base", facet: { param: "supply", value: a } };
    }
  }
  void b;
  return null;
}

/** Every explorer's own asset list that needs no read, as hits. */
function staticCatalogHits(): Hit[] {
  const out: Hit[] = [];
  const hit = (h: Omit<Hit, "from">) => out.push({ ...h, token: lc(h.token), from: "catalog" });
  for (const a of AAVE_V3_CATALOG)
    hit({ explorer: "aave-v3", chain: 1, token: a.address, page: "/market", symbol: a.symbol });
  for (const a of SPARK_CATALOG)
    hit({ explorer: "spark", chain: 1, token: a.address, facet: sparkFacet(a.address), symbol: a.symbol });
  for (const [explorer, d] of [
    ["compound", COMPOUND_DEPLOYMENT],
    ["compound-base", COMPOUND_BASE_DEPLOYMENT],
  ] as const)
    for (const m of d.markets)
      hit({ explorer, chain: d.chainId, token: m.baseToken, facet: { param: "market", value: m.key } });
  for (const m of COMPOUND_V2_MARKETS)
    hit({
      explorer: "compound-v2",
      chain: 1,
      token: m.underlying ?? NATIVE,
      facet: { param: "supply", value: m.symbol },
    });
  for (const m of MOONWELL_MARKETS)
    hit({
      explorer: "moonwell",
      chain: 1,
      token: m.underlying,
      facet: { param: "supply", value: m.symbol },
      symbol: m.symbol,
    });
  for (const b of Object.values(LIQUITY_V2_BRANCHES))
    hit({
      explorer: "liquity",
      chain: 1,
      token: b.collateralAddr,
      facet: { param: "collateralTypes", value: b.symbol },
      symbol: b.symbol,
    });
  hit({ explorer: "liquity", chain: 1, token: BOLD, symbol: "BOLD" });
  for (const [explorer, chain, branches, debt, debtSymbol] of [
    ["asymmetry", 1, ASYMMETRY_BRANCHES, USDAF, USDAF_SYMBOL],
    ["ebisu", 1, EBISU_BRANCHES, EBUSD, EBUSD_SYMBOL],
    ["basedollar", 8453, BASEDOLLAR_BRANCHES, BD, BD_SYMBOL],
  ] as const) {
    for (const b of Object.values(branches as Record<string, { symbol: string; collateralAddr: string }>))
      hit({
        explorer,
        chain,
        token: b.collateralAddr,
        facet: { param: "branch", value: b.symbol },
        symbol: b.symbol,
      });
    hit({ explorer, chain, token: debt, symbol: debtSymbol });
  }
  hit({ explorer: "liquity-v1", chain: 1, token: NATIVE, symbol: "ETH" });
  hit({ explorer: "liquity-v1", chain: 1, token: LIQUITY_V1_ADDRESSES.LUSD, symbol: "LUSD" });
  for (const p of Object.values(FX_POOLS))
    hit({ explorer: "fx", chain: 1, token: p.tokenAddress, facet: { param: "pool", value: p.key } });
  hit({ explorer: "fx", chain: 1, token: FX_ADDRESSES.FXUSD, symbol: FXUSD_META.symbol });
  for (const p of MAPLE_POOLS)
    hit({ explorer: "maple", chain: 1, token: p.asset, facet: { param: "pool", value: p.symbol } });
  hit({ explorer: "frankencoin", chain: 1, token: FRANKENCOIN_ADDRESSES.ZCHF, symbol: "ZCHF" });
  hit({ explorer: "llamalend", chain: 1, token: LLAMALEND_ADDRESSES.CRVUSD, page: "/markets", symbol: "crvUSD" });
  for (const [explorer, chain, markets] of [
    ["morpho", 1, MORPHO_ETHEREUM_MARKETS],
    ["morpho-base", 8453, MORPHO_BASE_MARKETS],
  ] as const) {
    const loans = new Set<string>();
    const colls = new Set<string>();
    for (const m of markets) {
      loans.add(lc(m.loanToken));
      if (!ZERO.test(m.collateralToken)) colls.add(lc(m.collateralToken));
    }
    // A loan token has a page of its markets; a token only ever collateral
    // reaches the listing by the collateral facet (symbols on Ethereum, which
    // the page fills in below; addresses on Base).
    for (const t of loans) hit({ explorer, chain, token: t, page: `/markets/${t}` });
    for (const t of colls)
      if (!loans.has(t)) hit({ explorer, chain, token: t, facet: { param: "coll", value: chain === 1 ? "" : t } });
  }
  for (const v of YEARN_VAULTS)
    hit({ explorer: "yearn", chain: 1, token: v.asset.address, page: "/vaults", symbol: v.asset.symbol ?? undefined });
  return out;
}

const STATIC_HITS = staticCatalogHits();

/** LlamaLend's markets at head: identity only, cached six hours (markets are
 *  listed rarely; the factories' counters are the source). */
const llamalendTokens = unstable_cache(
  async (): Promise<[string, string][]> => {
    const map = await discoverLlamalendMarkets();
    const s = new Map<string, string>();
    for (const m of map.values()) {
      s.set(lc(m.collateralToken), m.collateralSymbol);
      s.set(lc(m.borrowedToken), m.borrowedSymbol);
    }
    return [...s];
  },
  ["asset-explorer-llamalend-tokens-v2"],
  { revalidate: 6 * 3600 },
);

/** A token an explorer lists by symbol. */
export interface ListedToken {
  chain: number;
  token: string;
  symbol: string;
}

/** The chips for each `chain:token`, from the roster and the explorers' lists,
 *  and the tokens the lists name by symbol. */
export async function assetChips(
  assets: RosterAsset[],
): Promise<{ chips: Map<string, AssetChip[]>; listed: ListedToken[] }> {
  const hits: Hit[] = [...STATIC_HITS];
  for (const a of assets)
    for (const l of a.lines)
      for (const s of l.series) {
        const h = rosterHit(a, s.key);
        if (h) hits.push(h);
      }
  const llama = await llamalendTokens().catch(() => [] as [string, string][]);
  for (const [t, symbol] of llama)
    hits.push({ explorer: "llamalend", chain: 1, token: t, from: "catalog", page: "/markets", symbol });

  const symbolOf = new Map(assets.map((a) => [`${a.chain}:${a.token}`, a.symbol]));
  const grouped = new Map<string, Map<string, Hit[]>>();
  for (const h of hits) {
    const id = `${h.chain}:${h.token}`;
    const g = grouped.get(id) ?? new Map<string, Hit[]>();
    g.set(h.explorer, [...(g.get(h.explorer) ?? []), h]);
    grouped.set(id, g);
  }
  const out = new Map<string, AssetChip[]>();
  for (const [id, g] of grouped) {
    const chips: AssetChip[] = [];
    for (const [explorer, hs] of g) {
      const p = byExplorer.get(explorer);
      if (!p) continue;
      const facets = hs
        .map((h) => h.facet)
        .filter((f): f is NonNullable<Hit["facet"]> => f != null)
        .map((f) => (f.param === "coll" && f.value === "" ? { ...f, value: symbolOf.get(id) ?? "" } : f))
        .filter((f) => f.value !== "");
      const page = hs.find((h) => h.page)?.page;
      let href = p.href;
      let link: ChipLink = "explorer";
      if (facets.length) {
        // One param per link: the first facet's, every value under it.
        const param = facets[0].param;
        const values = [...new Set(facets.filter((f) => f.param === param).map((f) => f.value))];
        href = `${p.href}?${param}=${values.map(encodeURIComponent).join(",")}`;
        link = "filtered";
      } else if (page) {
        href = `${p.href}${page}`;
        link = "page";
      }
      chips.push({
        explorer,
        label: p.label,
        chain: p.chainId,
        href,
        link,
        from: [...new Set(hs.map((h) => h.from))].sort(),
      });
    }
    chips.sort((x, y) => x.chain - y.chain || x.label.localeCompare(y.label));
    out.set(id, chips);
  }
  const listed = new Map<string, ListedToken>();
  for (const h of hits)
    if (h.symbol && byExplorer.has(h.explorer) && !listed.has(`${h.chain}:${h.token}`))
      listed.set(`${h.chain}:${h.token}`, { chain: h.chain, token: h.token, symbol: h.symbol });
  return { chips: out, listed: [...listed.values()] };
}
