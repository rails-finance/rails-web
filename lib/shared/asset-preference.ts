// Focus mode (ui-jobs 557): the assets and the chains a reader limits Rails
// to, kept in this browser, and `?assets=` / `?chains=` that override it for
// one view (a link carrying either replaces the whole stored focus).
//
// Stored under its own key, `rails-focus-v2`, as `{ assets: [{ chain, token,
// builtOn }], chains: [chainId] }`. `rails-assets-v1` (the assets alone) is
// read once into it.
// Its own key, rather than a field of `defi-explorer-preferences`
// (preferences.ts), so the script in app/layout.tsx can read it before first
// paint without parsing the whole preference object, and so a reset of the
// display preferences leaves the reader's assets alone.
//
// `?assets=` is a comma list. An entry is `chain:symbol` (`1:weth`) where the
// symbol names one token on that chain, else `chain:address`; a bare symbol
// (`bold`) stands for that symbol on every chain the address tables know. A
// trailing `+` is "and what's built on it". A query string reads `+` as a
// space, so a trailing space counts as `+` too.
//
// Pure: type imports only (scripts/test/asset-family.test.mjs runs it
// directly); the symbol tables arrive as arguments.

import type { FamilyPick } from "@/lib/shared/asset-family";

export const FOCUS_KEY = "rails-focus-v2";
/** The assets-only store before chain focus; migrated into FOCUS_KEY. */
export const ASSET_PREFERENCE_KEY = "rails-assets-v1";
export const ASSETS_PARAM = "assets";
export const CHAINS_PARAM = "chains";

export type AssetPick = FamilyPick;

export interface Focus {
  assets: AssetPick[];
  /** Chain ids; [] is every chain. */
  chains: number[];
}

export const NO_FOCUS: Focus = { assets: [], chains: [] };

export function isFocus(v: unknown): v is Focus {
  return (
    !!v &&
    typeof v === "object" &&
    isPickList((v as Focus).assets) &&
    Array.isArray((v as Focus).chains) &&
    (v as Focus).chains.every((c) => typeof c === "number")
  );
}

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

export function isPickList(v: unknown): v is AssetPick[] {
  return (
    Array.isArray(v) &&
    v.every(
      (p) =>
        p &&
        typeof p === "object" &&
        typeof p.chain === "number" &&
        typeof p.token === "string" &&
        typeof p.builtOn === "boolean",
    )
  );
}

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
    if (sym && covers) {
      for (const t of all) done.add(`${t.chain}:${t.token}`);
      parts.push(`${sym.toLowerCase()}${plus}`);
      continue;
    }
    done.add(key);
    const unique = all.filter((t) => t.chain === p.chain).length === 1;
    parts.push(`${p.chain}:${sym && unique ? sym.toLowerCase() : p.token}${plus}`);
  }
  return parts.join(",");
}

/** The script app/layout.tsx runs before first paint: marks the page when a
 *  focus is stored or linked (`data-asset-scope`), and when it holds chains
 *  (`data-chain-focus`, which holds a chain's pages until the gate has run). */
export const ASSET_SCOPE_SCRIPT = `(function(){try{var d=document.documentElement.dataset,q=location.search,f=localStorage.getItem('${FOCUS_KEY}'),s=localStorage.getItem('${ASSET_PREFERENCE_KEY}'),on=false,ch=false;if(f){f=JSON.parse(f);ch=!!(f&&f.chains&&f.chains.length);on=ch||!!(f&&f.assets&&f.assets.length)}else on=!!(s&&s!=='[]');var la=/[?&]${ASSETS_PARAM}=[^&]/.test(q),lc=/[?&]${CHAINS_PARAM}=[^&]/.test(q);if(la||lc)ch=lc;if(on||la||lc)d.assetScope='1';if(ch)d.chainFocus='1'}catch(e){}})()`;
