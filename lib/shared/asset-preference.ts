// Focus mode (ui-jobs 557): the shapes, the `?assets=` / `?chains=` formats
// a focus link carries, and the script that marks the page before first paint.
// The saved views live under FOCUS_VIEWS_KEY (lib/shared/focus-views.ts).
//
// `?assets=` is a comma list. An entry is `chain:address`; where a symbol is
// plain (letters, digits, dots, dashes) and names one token on its chain,
// `chain:symbol` (`1:weth`); a bare symbol (`bold`) stands for that symbol on
// every chain the address tables know. A trailing `+` is "and what's built on
// it". A query string reads `+` as a space, so a trailing space counts as `+` too.
//
// Pure: type imports only (scripts/test/asset-family.test.mjs runs it
// directly); the symbol tables arrive as arguments.

import type { FamilyPick } from "@/lib/shared/asset-family";

/** The saved focus views and the one in use (lib/shared/focus-views.ts). */
export const FOCUS_VIEWS_KEY = "rails-focus-views";
/** The one saved view the profile menu (H20) offers, by id (ui-jobs 582). */
export const FOCUS_MENU_KEY = "rails-focus-menu-view";
export const ASSETS_PARAM = "assets";
export const CHAINS_PARAM = "chains";

export type AssetPick = FamilyPick;

export interface Focus {
  assets: AssetPick[];
  /** Chain ids; [] is every chain. */
  chains: number[];
}

export const NO_FOCUS: Focus = { assets: [], chains: [] };

/** Reads `?chains=`: chain slugs (`ethereum,base`) or ids; null when absent. */
export function parseChainsParam(raw: string | null, slugs: Record<string, number>): number[] | null {
  if (raw == null) return null;
  const ids = new Set(Object.values(slugs));
  const out: number[] = [];
  for (const part of raw.split(",")) {
    const v = part.trim().toLowerCase();
    const id = /^\d+$/.test(v) ? Number(v) : slugs[v];
    if (id != null && ids.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

export function formatChainsParam(chains: readonly number[], slugOf: (id: number) => string | undefined): string {
  return chains.map((c) => slugOf(c) ?? String(c)).join(",");
}

/** symbol (lowercased) → the tokens of that symbol, per chain. */
export type SymbolIndex = Map<string, { chain: number; token: string }[]>;

const isAddress = (s: string) => /^0x[0-9a-f]{40}$/.test(s);
/** A symbol a link can carry as written: anything else goes as its address. */
const PLAIN = /^[a-z0-9][a-z0-9.\-]*$/i;

/** Reads `?assets=`; null when absent, [] when present but naming nothing known. */
export function parseAssetsParam(raw: string | null, symbols: SymbolIndex): AssetPick[] | null {
  if (raw == null) return null;
  const out: AssetPick[] = [];
  const seen = new Set<string>();
  const add = (chain: number, token: string, builtOn: boolean) => {
    const key = `${chain}:${token}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ chain, token, builtOn });
  };
  for (const part of raw.split(",")) {
    const m = part.match(/^\s*(?:(\d+):)?([^\s+]+)[+ ]*$/);
    if (!m) continue;
    const builtOn = /[+ ]$/.test(part);
    const chain = m[1] ? Number(m[1]) : null;
    const id = m[2].toLowerCase();
    if (chain != null && isAddress(id)) {
      add(chain, id, builtOn);
      continue;
    }
    for (const t of symbols.get(id) ?? []) if (chain == null || t.chain === chain) add(t.chain, t.token, builtOn);
  }
  return out;
}

/** Writes the shortest form: a bare symbol where the picks cover that symbol
 *  on every chain alike, `chain:symbol` where the symbol is one token on its
 *  chain, else `chain:address`. */
export function formatAssetsParam(
  picks: readonly AssetPick[],
  symbolOf: (chain: number, token: string) => string | null,
  symbols: SymbolIndex,
): string {
  const parts: string[] = [];
  const done = new Set<string>();
  for (const p of picks) {
    const key = `${p.chain}:${p.token}`;
    if (done.has(key)) continue;
    const plus = p.builtOn ? "+" : "";
    const sym = symbolOf(p.chain, p.token);
    const all = sym ? (symbols.get(sym.toLowerCase()) ?? []) : [];
    const covers =
      all.length > 1 &&
      all.every((t) => picks.some((q) => q.chain === t.chain && q.token === t.token && q.builtOn === p.builtOn));
    if (sym && covers && PLAIN.test(sym)) {
      for (const t of all) done.add(`${t.chain}:${t.token}`);
      parts.push(`${sym.toLowerCase()}${plus}`);
      continue;
    }
    done.add(key);
    const unique = all.filter((t) => t.chain === p.chain).length === 1;
    parts.push(`${p.chain}:${sym && unique && PLAIN.test(sym) ? sym.toLowerCase() : p.token}${plus}`);
  }
  return parts.join(",");
}

/** The script app/layout.tsx runs before first paint: marks the page when a
 *  saved view is in use (`data-asset-scope`), and when it holds chains
 *  (`data-chain-focus`, which holds a chain's pages until the gate has run).
 *  A link's focus is only proposed, so the URL plays no part. */
export const ASSET_SCOPE_SCRIPT = `(function(){try{var d=document.documentElement.dataset,s=JSON.parse(localStorage.getItem('${FOCUS_VIEWS_KEY}')||'null'),v=null,i;if(s&&s.views&&s.active)for(i=0;i<s.views.length;i++)if(s.views[i]&&s.views[i].id===s.active)v=s.views[i];if(!v)return;var c=v.chains&&v.chains.length,a=v.assets&&v.assets.length;if(a||c)d.assetScope='1';if(c)d.chainFocus='1'}catch(e){}})()`;
