// The tokens the asset preference's chooser offers (ui-jobs 557): the address
// tables, then the family table's own tokens (the PTs, yBOLD, the sentinels).
// A plain module so the server's explorer index (lib/api/explorer-asset-index.ts)
// ships the same universe the browser tests against.

import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { BASE_TOKEN_ADDRESSES } from "@/lib/shared/token-addresses.base";
import { assetKey, FAMILY_SYMBOLS } from "@/lib/shared/asset-family";

export const SCOPE_TOKENS: { chain: number; token: string; symbol: string }[] = (() => {
  const out = new Map<string, { chain: number; token: string; symbol: string }>();
  const put = (chain: number, token: string, symbol: string) => {
    const key = assetKey(chain, token);
    if (!out.has(key)) out.set(key, { chain, token: token.toLowerCase(), symbol });
  };
  for (const [s, a] of Object.entries(TOKEN_ADDRESSES)) put(1, a, s);
  for (const [s, a] of Object.entries(BASE_TOKEN_ADDRESSES)) put(8453, a, s);
  for (const [key, s] of Object.entries(FAMILY_SYMBOLS)) {
    const [chain, token] = key.split(":");
    put(Number(chain), token, s);
  }
  return [...out.values()];
})();

/** Every `chain:token` the chooser offers. */
export const SCOPE_KEYS: ReadonlySet<string> = new Set(SCOPE_TOKENS.map((t) => assetKey(t.chain, t.token)));
