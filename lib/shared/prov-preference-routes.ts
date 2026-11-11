// The routes the standing provenance inspector arms on arrival (rails-ops
// decision 0062 point 6, ui-jobs 571). A route joins once the dev coverage
// tripwire sweeps it clean: no `data-prov-uncovered`, no unscoped `<Prov>`
// warning. Any other route behaves as before the preference: armed by hand.
//
// Entries are App Router templates without route groups. A `[param]` segment
// matches only where the route served that param (`useParams()`), so a static
// sibling such as `/base/morpho/vaults/info` never matches `[vault]`.
//
// Pure: no imports (scripts/test/prov-preference-routes.test.mjs runs it
// directly and checks every entry against app/).

export const PROV_PREFERENCE_ROUTES: readonly string[] = [
  "/",
  "/vaults",
  "/arbitrum/aave-v3/[wallet]",
  "/arbitrum/aave-v3/markets",
  "/arbitrum/aave-v3/markets/[asset]",
  "/arbitrum/compound-v3/[market]/[wallet]",
  "/arbitrum/compound-v3/markets",
  "/arbitrum/compound-v3/markets/[comet]",
  "/arbitrum/euler-v2/[wallet]",
  "/arbitrum/euler-v2/position/[account]/[vault]",
  "/arbitrum/morpho/[wallet]/[market]",
  "/arbitrum/morpho/markets",
  "/arbitrum/morpho/markets/[loanToken]/[marketId]",
  "/arbitrum/pancakeswap-v3/position/[id]",
  "/arbitrum/uniswap-v3/position/[id]",
  "/arbitrum/uniswap-v4/position/[id]",
  "/base/aave-v3/[wallet]",
  "/base/aave-v3/markets",
  "/base/aave-v3/markets/[asset]",
  "/base/aave-v4/hubs",
  "/base/aave-v4/markets",
  "/base/aave-v4/markets/[spoke]/[asset]",
  "/base/aave-v4/spoke/[spoke]/[wallet]",
  "/base/aerodrome/position/[deployment]/[id]",
  "/base/alchemix/[lineKey]/[tokenId]",
  "/base/basedollar/[collateralType]/[troveId]",
  "/base/basedollar/branches",
  "/base/compound-v3/[market]/[wallet]",
  "/base/compound-v3/markets",
  "/base/compound-v3/markets/[comet]",
  "/base/euler-v2/[wallet]",
  "/base/euler-v2/position/[account]/[vault]",
  "/base/moonwell/[wallet]",
  "/base/moonwell/markets",
  "/base/moonwell/markets/[asset]",
  "/base/morpho/[wallet]/[market]",
  "/base/morpho/markets",
  "/base/morpho/markets/[loanToken]",
  "/base/morpho/markets/[loanToken]/[marketId]",
  "/base/morpho/vaults",
  "/base/morpho/vaults/[vault]",
  "/base/morpho/vaults/[vault]/[holder]",
  "/base/pancakeswap-v3/position/[id]",
  "/base/seamless/[wallet]",
  "/base/seamless/markets",
  "/base/uniswap-v3/position/[id]",
  "/ethereum/aave",
  "/ethereum/aave-v3/[wallet]",
  "/ethereum/aave-v3/markets",
  "/ethereum/aave-v3/markets/[asset]",
  "/ethereum/aave-v4/hubs",
  "/ethereum/aave-v4/markets",
  "/ethereum/aave-v4/markets/[spoke]/[asset]",
  "/ethereum/aave/vaults",
  "/ethereum/aave/vaults/[vault]",
  "/ethereum/aave/vaults/[vault]/[holder]",
  "/ethereum/alchemix/[lineKey]/[tokenId]",
  "/ethereum/alchemix/transmuter/[lineKey]/[nftId]",
  "/ethereum/alchemix/v2/[lineKey]/[account]",
  "/ethereum/asymmetry/[collateralType]/[troveId]",
  "/ethereum/asymmetry/branches",
  "/ethereum/compound-v2/[wallet]",
  "/ethereum/compound-v2/markets",
  "/ethereum/compound-v2/markets/[asset]",
  "/ethereum/compound-v3/[market]/[wallet]",
  "/ethereum/compound-v3/markets",
  "/ethereum/compound-v3/markets/[comet]",
  "/ethereum/dolomite/[owner]/[accountNumber]",
  "/ethereum/dolomite/markets",
  "/ethereum/ebisu/[collateralType]/[troveId]",
  "/ethereum/ebisu/branches",
  "/ethereum/fluid/[nft]",
  "/ethereum/fluid/vaults",
  "/ethereum/fluid/vaults/[vault]",
  "/ethereum/frankencoin/[position]",
  "/ethereum/frankencoin/system",
  "/ethereum/fx/[position]",
  "/ethereum/fx/pools",
  "/ethereum/fx/pools/[pool]",
  "/ethereum/lido",
  "/ethereum/lido/[wallet]",
  "/ethereum/liquity-v1/[wallet]",
  "/ethereum/liquity-v1/system",
  "/ethereum/liquity-v2/branches",
  "/ethereum/liquity-v2/trove/[collateralType]/[troveId]",
  "/ethereum/llamalend/[controller]/[user]",
  "/ethereum/llamalend/markets",
  "/ethereum/llamalend/markets/[controller]",
  "/ethereum/makerdao/[vault]",
  "/ethereum/makerdao/system",
  "/ethereum/maple",
  "/ethereum/maple/[wallet]",
  "/ethereum/maple/pools",
  "/ethereum/maple/pools/[pool]",
  "/ethereum/moonwell/[wallet]",
  "/ethereum/moonwell/markets",
  "/ethereum/moonwell/markets/[asset]",
  "/ethereum/morpho/[positionId]",
  "/ethereum/morpho/markets",
  "/ethereum/morpho/markets/[loanToken]",
  "/ethereum/morpho/markets/[loanToken]/[marketId]",
  "/ethereum/morpho/vaults",
  "/ethereum/morpho/vaults/[vault]",
  "/ethereum/pendle/[wallet]/[market]",
  "/ethereum/pendle/markets",
  "/ethereum/pwn/[wallet]",
  "/ethereum/pwn/book",
  "/ethereum/sky-savings/[holder]",
  "/ethereum/sky-savings/rates",
  "/ethereum/spark/[wallet]",
  "/ethereum/spark/markets",
  "/ethereum/spark/markets/[asset]",
  "/ethereum/uniswap-v3/position/[id]",
  "/ethereum/uniswap-v4/position/[id]",
  "/ethereum/yearn",
  "/ethereum/yearn/vaults",
  "/ethereum/yearn/vaults/[vault]",
  "/ethereum/yearn/vaults/[vault]/[holder]",
  "/sepolia/polaris/[market]/[id]",
  "/sepolia/polaris/markets",
];

type Params = Record<string, string | string[] | undefined> | null | undefined;

const segments = (p: string) => p.split("/").filter(Boolean);

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

const same = (seg: string, value: string) => seg === value || decode(seg) === decode(value);

/** Whether `template` is the route that served `pathname`, given the params
 *  it served (`useParams()`). */
export function routeMatches(template: string, pathname: string, params: Params): boolean {
  const t = segments(template);
  const p = segments(pathname);
  for (let i = 0; i < t.length; i++) {
    const seg = t[i];
    const catchAll = /^\[\[?\.\.\.(.+?)\]\]?$/.exec(seg);
    if (catchAll) {
      const v = params?.[catchAll[1]];
      const rest = p.slice(i);
      const vs = v == null ? [] : Array.isArray(v) ? v : [v];
      if (rest.length === 0) return seg.startsWith("[[") && vs.length === 0;
      return vs.length === rest.length && rest.every((s, j) => same(s, vs[j]));
    }
    if (i >= p.length) return false;
    const dyn = /^\[(.+)\]$/.exec(seg);
    if (dyn) {
      const v = params?.[dyn[1]];
      if (typeof v !== "string" || !same(p[i], v)) return false;
    } else if (p[i] !== seg) return false;
  }
  return t.length === p.length;
}

/** Whether the standing preference arms the route that served `pathname`. */
export function provPreferenceAllows(pathname: string | null, params: Params): boolean {
  if (pathname == null) return false;
  return PROV_PREFERENCE_ROUTES.some((t) => routeMatches(t, pathname, params));
}
