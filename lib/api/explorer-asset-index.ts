// Which explorers list which assets (ui-jobs 557, the asset preference): the
// inverse of the /assets cards' chips (lib/api/asset-explorer-chips.ts), by
// explorer id, for the explorer chooser, the home tiles, /start's picker and
// an explorer's own pages to test against the reader's assets in the browser.
//
// Two sources the chips do not carry are added here: Pendle (each PT the PT
// table names, its yield token, and the family table's PT, YT and LP tokens)
// and Sky Savings (USDS and sUSDS). A launched explorer with no source at all
// (rails-ops reference/asset-key-map.md, "No chip source") is in `unknown`:
// Rails cannot say whether it touches an asset.
//
// Only the tokens the preference's chooser offers are shipped
// (lib/shared/asset-scope-tokens.ts; the Morpho censuses alone name some 3,900
// tokens): the browser counts a pick outside them as one it cannot judge.
//
// SERVER-ONLY: the chips read the Morpho censuses.

import "server-only";
import { LAUNCHED_PROTOCOLS } from "@/lib/shared/protocols";
import { assetChips } from "@/lib/api/asset-explorer-chips";
import { fetchAssetRosterServer } from "@/lib/api/fetch-asset-prices-server";
import { PT_UNDERLYING_MAINNET } from "@/lib/shared/pt-underlying";
import { FAMILY_ROWS } from "@/lib/shared/asset-family";
import { SUSDS, USDS } from "@/lib/sky-savings/constants";
import { SCOPE_KEYS } from "@/lib/shared/asset-scope-tokens";

export interface ExplorerAssetIndex {
  /** Every `chain:token` some explorer lists, once. */
  tokens: string[];
  /** Explorer id → indexes into `tokens`. */
  lists: Record<string, number[]>;
  /** Launched explorers Rails has no asset list for. */
  unknown: string[];
}

export async function explorerAssetIndex(): Promise<ExplorerAssetIndex> {
  const roster = await fetchAssetRosterServer().catch(() => null);
  const { chips } = await assetChips(roster?.assets ?? []);
  const byExplorer = new Map<string, Set<string>>();
  const listed = new Set<string>();
  const put = (explorer: string, key: string) => {
    const k = key.toLowerCase();
    listed.add(explorer);
    if (SCOPE_KEYS.has(k)) byExplorer.set(explorer, (byExplorer.get(explorer) ?? new Set()).add(k));
  };

  for (const [key, list] of chips) for (const c of list) put(c.explorer, key);
  for (const [pt, [underlying]] of Object.entries(PT_UNDERLYING_MAINNET)) {
    put("pendle", `1:${pt}`);
    put("pendle", `1:${underlying}`);
  }
  for (const r of FAMILY_ROWS)
    if (r.kind === "pt" || r.kind === "yt" || r.kind === "lp") {
      put("pendle", r.token);
      put("pendle", r.underlying);
    }
  put("sky-savings", `1:${USDS.address}`);
  put("sky-savings", `1:${SUSDS.address}`);

  const tokens: string[] = [];
  const at = new Map<string, number>();
  const lists: Record<string, number[]> = {};
  const unknown: string[] = [];
  for (const p of LAUNCHED_PROTOCOLS) {
    if (!listed.has(p.id)) {
      unknown.push(p.id);
      continue;
    }
    lists[p.id] = [...(byExplorer.get(p.id) ?? [])].sort().map((k) => {
      let i = at.get(k);
      if (i == null) {
        i = tokens.length;
        tokens.push(k);
        at.set(k, i);
      }
      return i;
    });
  }
  return { tokens, lists, unknown };
}
