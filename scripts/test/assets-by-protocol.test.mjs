// A protocol's Assets (decision 0069, ui-jobs 786): the explorer's lines on its
// chain, what each asset is in the protocol, the other explorers' pages for it,
// and the one canonical page of a token.

import test from "node:test";
import assert from "node:assert/strict";
import {
  assetMarkets,
  canonicalExplorer,
  protocolAssetLines,
  protocolAssetsHref,
} from "../../lib/shared/assets-by-protocol.ts";

const chip = (explorer, chain, extra = {}) => ({
  explorer,
  label: explorer,
  chain,
  href: `/x/${explorer}`,
  link: "explorer",
  from: ["catalog"],
  ...extra,
});
const card = (symbol, chains, chips) => ({
  id: `${chains[0][0]}:${chains[0][1]}`,
  symbol,
  short: null,
  chains: chains.map(([chain, token]) => ({ chain, token, href: `/assets/${chain}/${token}` })),
  chips,
});
const linesOf = (c) =>
  c.chains.map((x) => ({
    chain: x.chain,
    token: x.token,
    href: x.href,
    chips: c.chips.filter((ch) => ch.chain === x.chain),
  }));
const HREF = { "aave-v3": "/ethereum/aave-v3", morpho: "/ethereum/morpho", "aave-v3-base": "/base/aave-v3" };
const hrefOf = (id) => HREF[id] ?? null;

const USDC = card(
  "USDC",
  [
    [1, "0xa0b8"],
    [8453, "0x8335"],
  ],
  [
    chip("aave-v3", 1),
    chip("morpho", 1),
    chip("sbold", 1, { token: { symbol: "sBOLD", address: "0x50" } }),
    chip("aave-v3-base", 8453),
  ],
);
const WETH = card("WETH", [[1, "0xc02a"]], [chip("morpho", 1)]);
const AAVE = { id: "aave-v3", label: "Aave V3", href: "/ethereum/aave-v3" };

test("an explorer's Assets page and its page for a token", () => {
  assert.equal(protocolAssetsHref("/ethereum/aave-v3"), "/ethereum/aave-v3/assets");
  assert.equal(protocolAssetsHref("/ethereum/aave-v3", "0xA0B8"), "/ethereum/aave-v3/assets/0xa0b8");
});

test("the explorer's lines sit on its chain and link under it", () => {
  const out = protocolAssetLines([USDC, WETH], AAVE, linesOf, hrefOf);
  assert.equal(out.length, 1);
  assert.equal(out[0].line.chain, 1);
  assert.equal(out[0].line.href, "/ethereum/aave-v3/assets/0xa0b8");
});

test("Also used in: the same chain only, each opening the other explorer's page for the token", () => {
  const [usdc] = protocolAssetLines([USDC], AAVE, linesOf, hrefOf);
  assert.deepEqual(
    usdc.also.map((c) => [c.explorer, c.href]),
    [
      ["morpho", "/ethereum/morpho/assets/0xa0b8"],
      // A vault no explorer deploys keeps its own page.
      ["sbold", "/x/sbold"],
    ],
  );
});

test("what the asset is in the protocol", () => {
  assert.deepEqual(assetMarkets(AAVE, chip("aave-v3", 1), "USDC", "0xA0B8"), [
    { label: "Reserve", href: "/ethereum/aave-v3/markets/0xa0b8" },
  ]);
  const liquity = { id: "liquity", label: "Liquity V2", href: "/ethereum/liquity-v2" };
  const coll = chip("liquity", 1, { link: "filtered", href: "/ethereum/liquity-v2?collateralTypes=WETH" });
  assert.deepEqual(
    assetMarkets(liquity, coll, "WETH", "0xc02a").map((m) => m.href),
    ["/ethereum/liquity-v2/branches", "/ethereum/liquity-v2?collateralTypes=WETH"],
  );
  const uses = [{ label: "Stability Pools", href: "/ethereum/liquity-v2/stability-pool" }];
  assert.deepEqual(assetMarkets(liquity, chip("liquity", 1, { uses }), "BOLD", "0x6440"), uses);
  assert.deepEqual(assetMarkets({ id: "x", label: "X", href: "/x" }, chip("x", 1), "T", "0x1"), []);
});

test("the canonical page is the first explorer by the roster's order on that chain", () => {
  assert.equal(canonicalExplorer(USDC.chips, 1, ["aave-v3-base", "morpho", "aave-v3"]), "morpho");
  assert.equal(canonicalExplorer(USDC.chips, 8453, ["aave-v3", "aave-v3-base"]), "aave-v3-base");
  assert.equal(canonicalExplorer(USDC.chips, 10, ["aave-v3"]), null);
});
