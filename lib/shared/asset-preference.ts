// The asset preference (ui-jobs 557): the assets a reader limits Rails to,
// kept in this browser, and `?assets=` that overrides it for one view.
//
// Stored under its own key, `rails-assets-v1`, as `[{ chain, token, builtOn }]`.
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

export const ASSET_PREFERENCE_KEY = "rails-assets-v1";
export const ASSETS_PARAM = "assets";

export type AssetPick = FamilyPick;

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

/** The script app/layout.tsx runs before first paint. */
export const ASSET_SCOPE_SCRIPT = `(function(){try{var s=localStorage.getItem('${ASSET_PREFERENCE_KEY}');if((s&&s!=='[]')||/[?&]${ASSETS_PARAM}=[^&]/.test(location.search))document.documentElement.dataset.assetScope='1'}catch(e){}})()`;
