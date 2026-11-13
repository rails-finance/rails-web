// The asset family map's closure (lib/shared/asset-family.ts) and the
// `?assets=` format (lib/shared/asset-preference.ts); ui-jobs 557.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  assetKey,
  builtOnSymbols,
  FAMILY_ROWS,
  FAMILY_SYMBOLS,
  familyDisplaySymbol,
  familyOf,
  NATIVE,
} from "../../lib/shared/asset-family.ts";
import {
  formatAssetsParam,
  formatChainsParam,
  parseAssetsParam,
  parseChainsParam,
} from "../../lib/shared/asset-preference.ts";

const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const WETH_BASE = "0x4200000000000000000000000000000000000006";
const BOLD = "0x6440f144b7e50d6a8439336510312d2f54beb01d";
const SBOLD = "0x50bd66d59911f5e086ec87ae43c811e0d059dd11";
const YBOLD = "0x9f4330700a36b29952869fac9b33f45eedd8a3d8";
const YSYBOLD = "0x23346b04a7f55b8760e5860aa5a77383d63491cd";
const WSTETH = "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0";
const PT_YSYBOLD = "0x33e9a43b411000dd49c5ba66463f7dffaefa3fa6";
const USDAF = "0x9cf12ccd6020b6888e4d4c4e4c7aca33c1eb91f8";
const k = (a, c = 1) => assetKey(c, a);

test("WETH alone is WETH and ETH, one node", () => {
  const s = familyOf([{ chain: 1, token: WETH, builtOn: false }]);
  assert.deepEqual([...s].sort(), [k(NATIVE), k(WETH)].sort());
});

test("ETH chosen reaches WETH through wraps", () => {
  assert.ok(familyOf([{ chain: 1, token: NATIVE, builtOn: false }]).has(k(WETH)));
});

test("other wrappers are walked down only: cbBTC is not WBTC, USDbC is not USDC", () => {
  const CBBTC = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";
  const WBTC = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599";
  const cb = familyOf([{ chain: 1, token: CBBTC, builtOn: true }]);
  assert.ok(!cb.has(k(WBTC)));
  assert.ok(!cb.has(k("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")));
  const USDBC = "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca";
  const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  assert.ok(!familyOf([{ chain: 8453, token: USDBC, builtOn: true }]).has(k(USDC_BASE, 8453)));
  assert.ok(familyOf([{ chain: 8453, token: USDC_BASE, builtOn: true }]).has(k(USDBC, 8453)));
  assert.ok(!familyOf([{ chain: 8453, token: USDC_BASE, builtOn: false }]).has(k(USDBC, 8453)));
});

test("WETH built on adds the rate tokens, on its own chain only", () => {
  const s = familyOf([{ chain: 1, token: WETH, builtOn: true }]);
  assert.ok(s.has(k(WSTETH)));
  assert.ok(!s.has(k(WETH_BASE, 8453)));
});

test("BOLD built on walks the tower and the Pendle tokens, not the debt edges", () => {
  const s = familyOf([{ chain: 1, token: BOLD, builtOn: true }]);
  for (const a of [BOLD, SBOLD, YBOLD, YSYBOLD, PT_YSYBOLD]) assert.ok(s.has(k(a)), a);
  assert.ok(!s.has(k(USDAF)), "USDaf is debt against ysyBOLD");
  assert.ok(!s.has(k(WETH)), "BOLD is debt against WETH");
});

test("BOLD without built on is BOLD alone", () => {
  assert.deepEqual([...familyOf([{ chain: 1, token: BOLD, builtOn: false }])], [k(BOLD)]);
});

test("builtOnSymbols names what the switch adds", () => {
  const adds = builtOnSymbols({ chain: 1, token: BOLD });
  assert.ok(adds.includes("sBOLD") && adds.includes("ysyBOLD"));
  assert.ok(!adds.includes("BOLD"));
});

const symbols = new Map([
  [
    "weth",
    [
      { chain: 1, token: WETH },
      { chain: 8453, token: WETH_BASE },
    ],
  ],
  ["bold", [{ chain: 1, token: BOLD }]],
]);
const symbolOf = (c, t) => (t === WETH || t === WETH_BASE ? "WETH" : t === BOLD ? "BOLD" : null);

test("?assets= reads symbols, chain:symbol, addresses and + (or the space a query makes of it)", () => {
  assert.deepEqual(parseAssetsParam("weth+,1:bold", symbols), [
    { chain: 1, token: WETH, builtOn: true },
    { chain: 8453, token: WETH_BASE, builtOn: true },
    { chain: 1, token: BOLD, builtOn: false },
  ]);
  assert.deepEqual(parseAssetsParam(`1:${SBOLD} `, symbols), [{ chain: 1, token: SBOLD, builtOn: true }]);
  assert.deepEqual(parseAssetsParam("nope", symbols), []);
  assert.deepEqual(parseAssetsParam("", symbols), []);
  assert.equal(parseAssetsParam(null, symbols), null);
});

test("?assets= writes the shortest form and reads back", () => {
  const picks = [
    { chain: 1, token: WETH, builtOn: true },
    { chain: 8453, token: WETH_BASE, builtOn: true },
    { chain: 1, token: BOLD, builtOn: true },
    { chain: 1, token: SBOLD, builtOn: false },
  ];
  const v = formatAssetsParam(picks, symbolOf, symbols);
  assert.equal(v, `weth+,1:bold+,1:${SBOLD}`);
  assert.deepEqual(parseAssetsParam(v, symbols), picks);
  assert.equal(formatAssetsParam([{ chain: 1, token: WETH, builtOn: false }], symbolOf, symbols), "1:weth");
});

test("?assets= carries a symbol that would not read back as its address", () => {
  const WUSD = "0x1111111111111111111111111111111111111111";
  const odd = new Map([["wusd+", [{ chain: 8453, token: WUSD }]]]);
  const v = formatAssetsParam([{ chain: 8453, token: WUSD, builtOn: true }], () => "wUSD+", odd);
  assert.equal(v, `8453:${WUSD}+`);
  assert.deepEqual(parseAssetsParam(v, odd), [{ chain: 8453, token: WUSD, builtOn: true }]);
  const spaced = formatAssetsParam([{ chain: 1, token: WUSD, builtOn: false }], () => "RST0001 BY DANUBE", odd);
  assert.equal(spaced, `1:${WUSD}`);
});

test("?assets= round-trips a Pendle LP by its stored symbol, and shows it as LP <market>", () => {
  const lp = FAMILY_ROWS.find((r) => r.kind === "lp");
  const [chain, token] = lp.token.split(":");
  const index = new Map();
  for (const [key, sym] of Object.entries(FAMILY_SYMBOLS)) {
    const [c, t] = key.split(":");
    const s = sym.toLowerCase();
    index.set(s, [...(index.get(s) ?? []), { chain: Number(c), token: t }]);
  }
  const symOf = (c, t) => FAMILY_SYMBOLS[assetKey(c, t)] ?? null;
  const pick = { chain: Number(chain), token, builtOn: false };
  const v = formatAssetsParam([pick], symOf, index);
  assert.equal(v, `${chain}:${lp.symbol.toLowerCase()}`);
  assert.deepEqual(parseAssetsParam(v, index), [pick]);
  // A link written before ui-jobs 654 carries the same hyphenated key.
  assert.deepEqual(parseAssetsParam(`1:${lp.symbol.toLowerCase()}+`, index), [{ ...pick, builtOn: true }]);
  assert.match(lp.symbol, /^LP-/);
  assert.equal(familyDisplaySymbol(lp.symbol), `LP ${lp.symbol.slice(3)}`);
  assert.equal(familyDisplaySymbol("WETH"), "WETH");
});

test("?chains= reads slugs and ids, and writes slugs", () => {
  const slugs = { ethereum: 1, base: 8453, arbitrum: 42161 };
  assert.deepEqual(parseChainsParam("base,ethereum", slugs), [8453, 1]);
  assert.deepEqual(parseChainsParam("42161, base ,base", slugs), [42161, 8453]);
  assert.deepEqual(parseChainsParam("nope,10", slugs), []);
  assert.equal(parseChainsParam(null, slugs), null);
  const slugOf = (id) => Object.entries(slugs).find(([, v]) => v === id)?.[0];
  assert.equal(formatChainsParam([1, 8453], slugOf), "ethereum,base");
});
