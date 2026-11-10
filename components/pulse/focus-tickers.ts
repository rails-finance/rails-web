// The assets a Pulse post names, for Focus (ui-jobs 557): its `$TICKER`s,
// resolved through the chooser's symbol table on every chain. ETH is read as
// WETH, the key the focus holds for it.

import { assetKey } from "@/lib/shared/asset-family";
import { SCOPE_SYMBOLS } from "@/lib/shared/asset-scope";

const TICKER = /\$([A-Za-z][A-Za-z0-9.]{1,11})\b/g;
const ALIAS: Record<string, string> = { eth: "weth" };

export function tickerKeys(text: string): string[] {
  const out = new Set<string>();
  for (const [, raw] of text.matchAll(TICKER)) {
    const s = raw.toLowerCase();
    for (const t of SCOPE_SYMBOLS.get(ALIAS[s] ?? s) ?? []) out.add(assetKey(t.chain, t.token));
  }
  return [...out];
}
