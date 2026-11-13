// The asset family map: each token names what it is built on and how it stands
// to it (ui-jobs 557, the asset preference). An asset is (chain, address
// lowercased), the key everywhere (rails-ops reference/asset-key-map.md).
//
// MOCK SEED TABLE. The rows below are hand-copied for the localhost mock: the
// server roster's `wraps`/`rate` links (rails-server services/asset-roster.ts
// UNDERLYING), a few `rate` tokens it does not link yet, and the worked case
// (WETH, BOLD, sBOLD, yBOLD, ysyBOLD and their Pendle and Spectra tokens). The
// real map is a server-generated table (vault `asset()`, PT `SY.yieldToken()`,
// the Pendle roster) that the web caches; this file is its stand-in and is not
// meant to grow by hand.
//
// `familyOf` is the downward closure: from each chosen asset, every token built
// on it, through every kind but `debt` (BOLD is minted against WETH, which does
// not make BOLD a form of WETH). A native coin and its canonical wrapper are
// one node whichever is chosen (ETH and WETH); every other `wraps` edge is
// walked down only.
//
// Pure: no `@/` imports (scripts/test/asset-family.test.mjs runs it directly).

export type FamilyKind = "wraps" | "rate" | "vault" | "pt" | "yt" | "lp" | "debt";

export interface FamilyRow {
  /** `chain:address`, the derived token. */
  token: string;
  /** `chain:address`, one of what it is built on (an LP has a row per leg). */
  underlying: string;
  kind: FamilyKind;
  /** The token's symbol, for the mock's names. */
  symbol: string;
}

export interface FamilyPick {
  chain: number;
  token: string;
  /** "And what's built on it": walk down the family from this asset. */
  builtOn: boolean;
  /** The symbol, for a token outside the chooser's tables (one added from /assets). */
  symbol?: string;
  /** The same asset's address on other chains (one asset record, from the
   *  roster), which chain focus picks from. Matching is by address alone. */
  also?: { chain: number; token: string }[];
}

export const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
export const BTC = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

export const assetKey = (chain: number, address: string) => `${chain}:${address.toLowerCase()}`;

const k1 = (a: string) => assetKey(1, a);
const kb = (a: string) => assetKey(8453, a);

const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const BOLD = "0x6440f144b7e50d6a8439336510312d2f54beb01d";
const SBOLD = "0x50bd66d59911f5e086ec87ae43c811e0d059dd11";
const YBOLD = "0x9f4330700a36b29952869fac9b33f45eedd8a3d8";
const YSYBOLD = "0x23346b04a7f55b8760e5860aa5a77383d63491cd";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const WETH_BASE = "0x4200000000000000000000000000000000000006";
const WSTETH = "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0";
const RETH = "0xae78736cd615f374d3085123a210448e74fc6393";

/** The sentinels' names: native ETH and BTC have no token address. */
export const SENTINEL_SYMBOLS: Record<string, string> = { [NATIVE]: "ETH", [BTC]: "BTC" };

const row = (token: string, underlying: string, kind: FamilyKind, symbol: string): FamilyRow => ({
  token,
  underlying,
  kind,
  symbol,
});

/** A Pendle market's three tokens over one yield token. */
const pendle = (yieldToken: string, name: string, pt: string, yt: string, lp: string): FamilyRow[] => [
  row(k1(pt), k1(yieldToken), "pt", `PT-${name}`),
  row(k1(yt), k1(yieldToken), "yt", `YT-${name}`),
  row(k1(lp), k1(yieldToken), "lp", `LP-${name}`),
];

export const FAMILY_ROWS: FamilyRow[] = [
  // The server roster's UNDERLYING rows (services/asset-roster.ts).
  row(k1(WETH), k1(NATIVE), "wraps", "WETH"),
  row(kb(WETH_BASE), kb(NATIVE), "wraps", "WETH"),
  row(k1("0x2260fac5e5542a773aa44fbcfedf7c193bc2c599"), k1(BTC), "wraps", "WBTC"),
  row(k1("0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf"), k1(BTC), "wraps", "cbBTC"),
  row(kb("0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf"), kb(BTC), "wraps", "cbBTC"),
  row(k1("0x18084fba666a33d37592fa2633fd49a74dd93a88"), k1(BTC), "wraps", "tBTC"),
  row(kb("0x236aa50979d5f3de3bd1eeb40e81137f22ab794b"), kb(BTC), "wraps", "tBTC"),
  row(k1("0xc96de26018a54d51c097160568752c4e3bd6c364"), k1(BTC), "wraps", "FBTC"),
  row(k1("0xb0f70c0bd6fd87dbeb7c10dc692a2a6106817072"), k1(BTC), "wraps", "BTC.b"),
  row(k1(WSTETH), k1(NATIVE), "rate", "wstETH"),
  row(kb("0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452"), kb(NATIVE), "rate", "wstETH"),
  row(kb("0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca"), kb(USDC_BASE), "wraps", "USDbC"),

  // Rate tokens over ETH the roster does not link yet (token-addresses.ts).
  row(k1(RETH), k1(NATIVE), "rate", "rETH"),
  row(k1("0xbe9895146f7af43049ca1c1ae358b0541ea49704"), k1(NATIVE), "rate", "cbETH"),
  row(k1("0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee"), k1(NATIVE), "rate", "weETH"),
  row(kb("0xb6fe221fe9eef5aba221c348ba20a1bf5e73624c"), kb(NATIVE), "rate", "rETH"),
  row(kb("0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22"), kb(NATIVE), "rate", "cbETH"),
  row(kb("0x04c0599ae5a44757c0af6f9ec3b93da8976c150a"), kb(NATIVE), "rate", "weETH"),

  // Vaults over WETH named in token-addresses.ts (the vault index tests each
  // vault's asset() itself, so the census's 72 need no row here).
  row(k1("0x29bcfed246ce37319d94eba107db90c453d4c43d"), k1(WETH), "vault", "mixWETH"),

  // The BOLD tower: sBOLD and yBOLD over BOLD, ysyBOLD over yBOLD (each read
  // from asset() on chain).
  row(k1(SBOLD), k1(BOLD), "vault", "sBOLD"),
  row(k1(YBOLD), k1(BOLD), "vault", "yBOLD"),
  row(k1(YSYBOLD), k1(YBOLD), "vault", "ysyBOLD"),
  row(k1("0xfbc84dbfaa2196853fdb6cae52ef8f56dd76770a"), k1(BOLD), "vault", "BOLDCS"),

  // Pendle on sBOLD and ysyBOLD (Pendle's API, 9 Nov 2026); matured ones kept.
  ...pendle(
    SBOLD,
    "sBOLD-4FEB2027",
    "0x2a21f68b60156860615bd27ac958df817df45aa3",
    "0xc802c127ac01e06610a6a5c12ce5b70ce93924e4",
    "0xeb603c5a42d49d3b2e078191c23bf3f5d25bc219",
  ),
  ...pendle(
    SBOLD,
    "sBOLD-25JUN2026",
    "0xd7baa983d2a44409b4b8f23fc1152368bc5f10ad",
    "0xdb36f6a79e74777726e244f433ed53cb7d4da2f3",
    "0x926fac5b12544c2e7bfa8ce3dd83a4c8ed988da8",
  ),
  ...pendle(
    SBOLD,
    "sBOLD-27NOV2025",
    "0x66526197a4baf496d97e1004e43c2c374fb7d2e7",
    "0x2d2d86af3eae41a3741151d5a5d5221e98dd1e07",
    "0xe467c5c54748f0125d729280f90ded77c4e720a4",
  ),
  ...pendle(
    YSYBOLD,
    "ysyBOLD-28MAY2026",
    "0x33e9a43b411000dd49c5ba66463f7dffaefa3fa6",
    "0xa815a7cfa337d81e5d86286df9431488ec230abf",
    "0x83b2c0b470ff5f2a60d2bf2ae109766e8bb3e862",
  ),
  ...pendle(
    YSYBOLD,
    "ysyBOLD-27NOV2025",
    "0x3566069b5bef9fbc1ab97bfb951909d4c6f9d8c7",
    "0x21a69c55fae5be461f7b0da635537dfe3fc84d26",
    "0x1bd78377dfbca2043e38b692d2e0b32396b4772d",
  ),
  // Spectra's PT on sBOLD (pt-underlying.ts), matured 10 Dec 2025.
  row(k1("0x1ff893c9071d04f8a965a90fcb0de22406a3eeaa"), k1(SBOLD), "pt", "PT-sBOLD"),

  // Debt edges: stored, never walked by default.
  row(k1(BOLD), k1(WETH), "debt", "BOLD"),
  row(k1(BOLD), k1(WSTETH), "debt", "BOLD"),
  row(k1(BOLD), k1(RETH), "debt", "BOLD"),
  row(k1("0x9cf12ccd6020b6888e4d4c4e4c7aca33c1eb91f8"), k1(YSYBOLD), "debt", "USDaf"),
];

/** A Pendle LP's stored symbol, `LP-<market>`, is a `?assets=` key (a link
 *  symbol takes no space); Rails shows it as "LP <market>" (rails-ops ui-jobs
 *  654, P9). Every other symbol shows as stored. */
const LP_SYMBOLS = new Set(FAMILY_ROWS.filter((r) => r.kind === "lp").map((r) => r.symbol));
export const familyDisplaySymbol = (symbol: string): string =>
  LP_SYMBOLS.has(symbol) ? `LP ${symbol.slice(3)}` : symbol;

/** Every symbol the seed table names, by key. */
export const FAMILY_SYMBOLS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const r of FAMILY_ROWS) out[r.token] = r.symbol;
  for (const chain of [1, 8453]) for (const [a, s] of Object.entries(SENTINEL_SYMBOLS)) out[assetKey(chain, a)] = s;
  return out;
})();

const DOWN = new Map<string, FamilyRow[]>();
const UP = new Map<string, FamilyRow[]>();
for (const r of FAMILY_ROWS) {
  if (r.kind === "debt") continue;
  DOWN.set(r.underlying, [...(DOWN.get(r.underlying) ?? []), r]);
  UP.set(r.token, [...(UP.get(r.token) ?? []), r]);
}

/** Wrapped one for one by a native coin's canonical wrapper: one asset either
 *  way (Miles, 10 Nov 2026). Every other `wraps` edge is walked down only, so
 *  cbBTC reaches what is built on cbBTC, not WBTC or tBTC, and USDbC does not
 *  reach USDC. */
const CANONICAL: ReadonlySet<string> = new Set([k1(WETH), kb(WETH_BASE)]);
const NATIVES: ReadonlySet<string> = new Set([k1(NATIVE), kb(NATIVE)]);

/** One wraps-node: the asset, and for a native coin or its canonical wrapper
 *  the other of the pair (ETH ↔ WETH). */
function wrapsNode(key: string): string[] {
  const out = [key];
  if (CANONICAL.has(key)) for (const r of UP.get(key) ?? []) if (r.kind === "wraps") out.push(r.underlying);
  if (NATIVES.has(key))
    for (const r of DOWN.get(key) ?? []) if (r.kind === "wraps" && CANONICAL.has(r.token)) out.push(r.token);
  return out;
}

/** The keys a selection reaches: each chosen asset's wraps-node, and with
 *  `builtOn` everything below it through every kind but `debt`. */
export function familyOf(picks: readonly FamilyPick[]): Set<string> {
  const out = new Set<string>();
  for (const p of picks) {
    const node = wrapsNode(assetKey(p.chain, p.token));
    for (const n of node) out.add(n);
    if (!p.builtOn) continue;
    const todo = [...node];
    while (todo.length) {
      const at = todo.shift()!;
      for (const r of DOWN.get(at) ?? [])
        if (!out.has(r.token)) {
          out.add(r.token);
          todo.push(r.token);
        }
    }
  }
  return out;
}

/** What `builtOn` adds to one pick beyond its wraps-node: the derived
 *  tokens' symbols, for the panel's "Adds sBOLD, yBOLD…" line. */
export function builtOnSymbols(pick: Omit<FamilyPick, "builtOn">): string[] {
  const base = familyOf([{ ...pick, builtOn: false }]);
  const all = familyOf([{ ...pick, builtOn: true }]);
  return [...new Set([...all].filter((k) => !base.has(k)).map((k) => FAMILY_SYMBOLS[k] ?? k))];
}

/** A Liquity-fork branch's keys for the preference: its collateral and the
 *  fork's stablecoin, by branch key. */
export function branchScopeKeys(
  chain: number,
  branches: Record<string, { key: string; collateralAddr: string }>,
  debtAddress: string,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.values(branches).map((b) => [b.key, [assetKey(chain, b.collateralAddr), assetKey(chain, debtAddress)]]),
  );
}
