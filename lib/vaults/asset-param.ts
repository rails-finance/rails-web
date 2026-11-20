// `?asset=` on the /vaults overview and the family rosters (rails-ops ui-jobs
// 482, 488, 776): one symbol or a comma list, matched without case, an
// unnamed asset by its address; a keyword (`stablecoins`) stands for its
// category's symbols. The start page, the asset step and the search link
// /vaults with it, and the overview passes it on to each roster.

import { ASSET_KEYWORDS, symbolsOfKeyword } from "@/lib/shared/asset-categories";

type WithAsset = { asset: { address: string; symbol: string; named: boolean } };

const parts = (param: string) =>
  param
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);

/** The names `?asset=` asks for, lower-cased; empty where none. */
export function assetParamNames(param: string | null | undefined): Set<string> {
  if (!param) return new Set();
  return new Set(parts(param).flatMap((a) => [a, ...symbolsOfKeyword(a).map((s) => s.toLowerCase())]));
}

/** The vault's asset is one the param names. */
export const vaultHasAsset = (v: WithAsset, names: Set<string>): boolean =>
  names.has(v.asset.address.toLowerCase()) || (v.asset.named && names.has(v.asset.symbol.toLowerCase()));

/** The param in words: each symbol as the vaults write it, a keyword as
 *  written ("stablecoins", or "stablecoin" before a noun), joined with "or":
 *  "USDC or USDT". */
export function assetParamLabel(param: string, vaults: readonly WithAsset[], beforeNoun = false): string {
  const words = parts(param).map((a) =>
    a in ASSET_KEYWORDS
      ? beforeNoun
        ? a.replace(/s$/, "")
        : a
      : (vaults.find((v) => v.asset.named && v.asset.symbol.toLowerCase() === a)?.asset.symbol ?? a.toUpperCase()),
  );
  return [...new Set(words)].join(" or ");
}
