// The gate's map from a page to what it diffs, one entry per page family.
//
// An `export` entry renders the page's "Copy for LLM" Markdown with the app's
// own serializer over the data routes the page reads (approach 1). A `routes`
// entry diffs the normalised JSON of the data routes themselves (approach 2):
// the fallback for a family no export adapter covers yet, and the only shape
// for a page with no export (the vault holder pages). A page that matches
// neither is reported as an ERROR naming the missing entry.
//
// To add a family: an export adapter beside these (load / head / render), or
// one line in ROUTES naming the page pattern and the routes its loader reads.
// The `match` is tested against the page's path without its query; the
// query is handed to `load` / `routes`.

import liquityV2 from "./liquity-v2.mjs";
import aaveV3 from "./aave-v3.mjs";
import aaveV3Pool from "./aave-v3-pool.mjs";

export const EXPORT_ADAPTERS = [liquityV2, aaveV3, aaveV3Pool];

/** Approach 2: page pattern → the routes its loader reads. */
export const ROUTES = [
  {
    // app/(app)/ethereum/aave/vaults/[vault]/[holder]/page.tsx reads the
    // vault, the holder and the holder's whole history in one route.
    id: "aave-vaults",
    match: /^\/ethereum\/aave\/vaults\/(0x[0-9a-fA-F]{40})\/(0x[0-9a-fA-F]{40})\/?$/,
    routes: ([, vault, holder]) => [`/api/chain/aave-vaults/vault?vault=${vault}&holder=${holder}`],
  },
  {
    // components/vaults: the Base Morpho vault holder page, the same shape on
    // its own route.
    id: "morpho-base-vaults",
    match: /^\/base\/morpho\/vaults\/(0x[0-9a-fA-F]{40})\/(0x[0-9a-fA-F]{40})\/?$/,
    routes: ([, vault, holder]) => [`/api/chain/morpho-base/vault?vault=${vault}&holder=${holder}`],
  },
];

/** What the gate does with `path`: an export adapter, a route list, or null. */
export function planFor(path) {
  for (const a of EXPORT_ADAPTERS) {
    const m = path.match(a.match);
    if (m) return { kind: "export", adapter: a, match: m };
  }
  for (const r of ROUTES) {
    const m = path.match(r.match);
    if (m) return { kind: "routes", id: r.id, routes: r.routes(m) };
  }
  return null;
}
