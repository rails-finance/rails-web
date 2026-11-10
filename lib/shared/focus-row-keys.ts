// The asset keys a listed object names, for Focus mode (ui-jobs 557), read
// from the row the page already holds: every token address in it (a field's
// value, or a record's key such as `priceByAddress`), and every symbol field
// resolved to the tokens of that symbol on the row's chain.
//
// An address that is not a token (an owner, a contract) can never match a
// focused asset, so taking every address is safe. Symbols are the fallback for
// rows that carry no address for a side (Fluid, Maker, the Liquity forks); the
// address tables are the rule (the server family map, item D, replaces them).

import { assetKey } from "@/lib/shared/asset-family";
import { SCOPE_SYMBOLS } from "@/lib/shared/asset-scope";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** Field names whose string value names a token by symbol. */
const SYMBOL_FIELD = /(symbol|^collateralType$|^assetType$|^asset$|^token$|^ilk$)/i;
/** Field names of tables keyed by what the market quotes. */
const QUOTE_TABLE = /(price|rate|apr|apy|oracle)/i;
const DEPTH = 4;
const ARRAY_CAP = 64;

const memo = new WeakMap<object, Map<number, string[]>>();

/** The `chain:address` keys a row names on `chain`. */
export function rowAssetKeys(row: unknown, chain: number): string[] {
  if (row == null || typeof row !== "object") return [];
  const byChain = memo.get(row) ?? new Map<number, string[]>();
  const hit = byChain.get(chain);
  if (hit) return hit;
  const keys = new Set<string>();
  const symbols = new Set<string>();
  const walk = (v: unknown, field: string, depth: number) => {
    if (typeof v === "string") {
      if (ADDRESS.test(v)) keys.add(assetKey(chain, v));
      else if (SYMBOL_FIELD.test(field) && v.length > 0 && v.length <= 24) symbols.add(v.toLowerCase());
      return;
    }
    if (v == null || typeof v !== "object" || depth > DEPTH) return;
    if (Array.isArray(v)) {
      for (const x of v.slice(0, ARRAY_CAP)) walk(x, field, depth + 1);
      return;
    }
    // A price or rate table is keyed by every reserve the market quotes, not
    // by what this position holds: neither its keys nor its values count.
    if (QUOTE_TABLE.test(field)) return;
    for (const [k, x] of Object.entries(v)) {
      if (ADDRESS.test(k)) keys.add(assetKey(chain, k));
      walk(x, k, depth + 1);
    }
  };
  walk(row, "", 0);
  for (const s of symbols)
    for (const t of SCOPE_SYMBOLS.get(s) ?? []) if (t.chain === chain) keys.add(assetKey(t.chain, t.token));
  const out = [...keys];
  byChain.set(chain, out);
  memo.set(row, byChain);
  return out;
}
