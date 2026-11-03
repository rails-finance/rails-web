// The search index (rails-ops ui-jobs 482): every launched explorer, every
// vault the vault index's rosters list, and their tokens, built from stored
// data only. SERVER-ONLY: reads RAILS_API_URL and the bearer token.
//
// - Explorers: the protocol registry (lib/shared/protocols.ts).
// - Morpho on Base and Yearn V3 on Ethereum: the rosters the box writes, over
//   the baked catalogues (lib/morpho-base/vault-roster.ts, lib/yearn/vault-roster.ts).
// - Aave's vaults on Ethereum: the box's vault census (sGHO, the stata tokens,
//   the Umbrella stake tokens), with the five the address book names as the
//   floor when the census does not answer.
// - Maple: the two syrup pools in lib/maple/asset-catalog.ts.
//
// The vaults go out in the order of their total assets at the census block,
// in USD at the census's oracle price, where the census holds them (Morpho and
// Aave); the rest follow. That order is the matcher's tie-break and nothing
// else, so no figure is sent. No chain read: every figure is the census's.

import "server-only";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { LAUNCHED_PROTOCOLS } from "@/lib/shared/protocols";
import { BASE_CHAIN_ID, CHAINS, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { loadMorphoBaseVaultRoster } from "@/lib/morpho-base/vault-roster";
import { loadYearnVaultRoster } from "@/lib/yearn/vault-roster";
import { AAVE_ETHEREUM_BOOK_VAULTS } from "@/lib/aave-vaults/vault-catalog";
import { MAPLE_POOLS } from "@/lib/maple/asset-catalog";
import {
  baseVaultRosterHref,
  ethereumVaultRosterHref,
  maplePoolsHref,
  yearnVaultRosterHref,
} from "@/lib/vaults/routes";
import type { SearchIndexWire, WireRoster, WireVault } from "@/lib/search/suggest";

const chainName = (id: number) => CHAINS[id as ChainId]?.name ?? String(id);

interface CensusRow {
  vault: string;
  family: string;
  symbol: string | null;
  shareDecimals: number | null;
  totalSupply: string | null;
  assetSymbol: string | null;
  assetDecimals: number | null;
  shareUnitAssets: string | null;
  underlyingUnitAssets: string | null;
  underlyingDecimals: number | null;
  oraclePriceE8: string | null;
}

/** One chain's census header from the box, or [] when it does not answer. */
async function loadCensus(chainId: number): Promise<CensusRow[]> {
  const base = process.env.RAILS_API_URL;
  if (!base) return [];
  try {
    const res = await fetch(
      `${base}/api/vaults/positions?chain=${chainId}&limit=1`,
      createAuthFetchOptions({ next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) }),
    );
    if (!res.ok) return [];
    const j = (await res.json()) as { census?: CensusRow[] };
    return Array.isArray(j.census) ? j.census : [];
  } catch (error) {
    console.error(`The vault census did not answer for the search index (chain ${chainId}):`, error);
    return [];
  }
}

const num = (raw: string | null, decimals: number | null) =>
  raw == null || decimals == null ? 0 : Number(raw) / Math.pow(10, decimals);

/** A census row's total assets in USD at the census block; -1 when it holds
 *  no shares, 0 where a part is
 *  missing. Used to order rows, never shown. */
function censusSize(c: CensusRow | undefined): number {
  if (c?.totalSupply === "0") return -1;
  if (!c) return 0;
  const shares = num(c.totalSupply, c.shareDecimals);
  let assets = shares * num(c.shareUnitAssets, c.assetDecimals);
  if (c.underlyingUnitAssets != null) assets *= num(c.underlyingUnitAssets, c.underlyingDecimals);
  const price = c.oraclePriceE8 == null ? 0 : Number(c.oraclePriceE8) / 1e8;
  const usd = assets * price;
  return Number.isFinite(usd) ? usd : 0;
}

export async function buildSearchIndex(): Promise<SearchIndexWire> {
  const [morpho, yearn, baseCensus, ethCensus] = await Promise.all([
    loadMorphoBaseVaultRoster(),
    loadYearnVaultRoster(),
    loadCensus(BASE_CHAIN_ID),
    loadCensus(MAINNET_CHAIN_ID),
  ]);
  const base = chainName(BASE_CHAIN_ID);
  const eth = chainName(MAINNET_CHAIN_ID);
  // The rosters, by the index a vault row names.
  const rosters: WireRoster[] = [
    ["Morpho", base, `${baseVaultRosterHref()}/`, 1],
    ["Aave", eth, `${ethereumVaultRosterHref()}/`, 1],
    ["Yearn", eth, `${yearnVaultRosterHref()}/`, 1],
    ["Maple", eth, maplePoolsHref(), 0],
  ];
  const [MORPHO, AAVE, YEARN, MAPLE] = [0, 1, 2, 3];
  const row = (name: string, symbol: string, asset: string, roster: number, address: string): WireVault => [
    name,
    symbol === name ? "" : symbol,
    asset,
    roster,
    address.toLowerCase(),
  ];

  const baseByVault = new Map(baseCensus.map((c) => [c.vault.toLowerCase(), c]));
  const sized: { row: WireVault; size: number }[] = [];

  for (const v of morpho.vaults) {
    const c = baseByVault.get(v.address);
    sized.push({ row: row(v.name, v.symbol, c?.assetSymbol ?? "", MORPHO, v.address), size: censusSize(c) });
  }

  const aaveSeen = new Set<string>();
  for (const c of ethCensus) {
    if (c.family !== "stata" && c.family !== "umbrella-stake" && c.family !== "sgho") continue;
    aaveSeen.add(c.vault.toLowerCase());
    sized.push({ row: row(c.symbol ?? "", c.symbol ?? "", c.assetSymbol ?? "", AAVE, c.vault), size: censusSize(c) });
  }
  // The census did not answer: the address book's five stand, unnamed.
  for (const b of AAVE_ETHEREUM_BOOK_VAULTS)
    if (!aaveSeen.has(b.address)) sized.push({ row: row("", "", "", AAVE, b.address), size: 0 });

  for (const v of yearn.vaults)
    sized.push({ row: row(v.name, v.symbol, v.asset.symbol ?? "", YEARN, v.address), size: 0 });

  for (const p of MAPLE_POOLS) sized.push({ row: row(p.symbol, p.symbol, p.assetSymbol, MAPLE, p.pool), size: 0 });

  // A stable sort: the unsized keep their roster order behind the sized, and
  // the vaults the census shows empty (size -1) go last.
  sized.sort((a, b) => b.size - a.size);
  const vaults = sized.map((s) => s.row);
  const emptyAt = sized.findIndex((s) => s.size < 0);

  const tokenCounts = new Map<string, number>();
  for (const v of vaults) if (v[2]) tokenCounts.set(v[2], (tokenCounts.get(v[2]) ?? 0) + 1);

  return {
    v: 2,
    at: new Date().toISOString(),
    explorers: LAUNCHED_PROTOCOLS.map((p) => [p.label, chainName(p.chainId), p.href]),
    rosters,
    emptyFrom: emptyAt < 0 ? vaults.length : emptyAt,
    vaults,
    tokens: [...tokenCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en-US")),
  };
}
