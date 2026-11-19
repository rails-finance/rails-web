// IPOR Fusion's market table and substrate decoders (lib/ipor-fusion/markets.ts;
// rails-ops TO-DO-ipor-scoping §6.3 phase B). Each decoder runs on a substrate
// `getMarketSubstrates(id)` answered on Ethereum at block 26,449,921, and each
// test names its vault and market id.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const { decodeSubstrate, marketInfo, substrateAddresses, ZERO_BALANCE_MARKET } = await import(
  "../../lib/ipor-fusion/markets.ts"
);

const BLOCK = 26449921;

test(`market 1 AAVE_V3, vault 0x888e…eb10 at block ${BLOCK}: token addresses`, () => {
  assert.deepEqual(marketInfo("1"), {
    constant: "AAVE_V3",
    venue: "Aave V3",
    kind: "tokens",
    covered: { 1: "aave-v3" },
  });
  assert.deepEqual(decodeSubstrate("tokens", "0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"), {
    kind: "address",
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  });
});

test(`market 14 MORPHO, vault 0xc825…1d39 at block ${BLOCK}: a market id`, () => {
  const id = "0xe3df58f9d3011b7481ff36b939fa5f8da642f34ea5792d25d3958dbf1efa26d7";
  assert.deepEqual(decodeSubstrate(marketInfo("14").kind, id), { kind: "morpho-market", id });
});

test(`market 29 LIQUITY_V2, vault 0xb9e8…663c at block ${BLOCK}: a tagged address registry`, () => {
  assert.deepEqual(
    decodeSubstrate(marketInfo("29").kind, "0x00000000000000000000000220f7c9ad66983f6523a0881d0f82406541417526"),
    { kind: "typed", type: "tag 2", address: "0x20f7c9ad66983f6523a0881d0f82406541417526" },
  );
});

test(`market 49 AAVE_V4, vault 0x2775…f0ed at block ${BLOCK}: spoke, reserve and flags`, () => {
  const kind = marketInfo("49").kind;
  assert.deepEqual(decodeSubstrate(kind, "0x0194e7a5dcbe816e498b89ab752661904e2f56c4850000000201000000000000"), {
    kind: "aave-v4-reserve",
    spoke: "0x94e7a5dcbe816e498b89ab752661904e2f56c485",
    reserveId: 2,
    isCollateral: true,
    canBorrow: false,
  });
  assert.deepEqual(decodeSubstrate(kind, "0x01bf10bdfe177de0336afd7fccf80a904e153862190000000102000000000000"), {
    kind: "aave-v4-reserve",
    spoke: "0xbf10bdfe177de0336afd7fccf80a904e15386219",
    reserveId: 1,
    isCollateral: false,
    canBorrow: true,
  });
});

test(`market 11 EULER_V2, vault 0x2775…f0ed at block ${BLOCK}: vault, flags, sub-account`, () => {
  const kind = marketInfo("11").kind;
  assert.deepEqual(decodeSubstrate(kind, "0xe846ca062ab869b66ae8dcd811973f628ba82eaf010001000000000000000000"), {
    kind: "euler-vault",
    vault: "0xe846ca062ab869b66ae8dcd811973f628ba82eaf",
    isCollateral: true,
    canBorrow: false,
    subAccount: 1,
  });
  assert.deepEqual(decodeSubstrate(kind, "0xd8b27cf359b7d15710a5be299af6e7bf904984c2000101000000000000000000"), {
    kind: "euler-vault",
    vault: "0xd8b27cf359b7d15710a5be299af6e7bf904984c2",
    isCollateral: false,
    canBorrow: true,
    subAccount: 1,
  });
});

test(`market 45 MIDAS, vault 0x0b45…aaf3 at block ${BLOCK}: type and address`, () => {
  const kind = marketInfo("45").kind;
  assert.deepEqual(decodeSubstrate(kind, "0x0000000000000000000000036be2f55816efd0d91f52720f096006d63c366e98"), {
    kind: "typed",
    type: "redemption vault",
    address: "0x6be2f55816efd0d91f52720f096006d63c366e98",
  });
  assert.deepEqual(decodeSubstrate(kind, "0x000000000000000000000005a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"), {
    kind: "typed",
    type: "asset",
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  });
});

test(`market 50 EXTERNAL_STATE, vault 0xd3c4…4cc8 at block ${BLOCK}: asset, balance account, target`, () => {
  const kind = marketInfo("50").kind;
  assert.deepEqual(decodeSubstrate(kind, "0x010000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"), {
    kind: "typed",
    type: "asset",
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  });
  assert.deepEqual(decodeSubstrate(kind, "0x040000000000000000000000b28bbbb7a08c701ec2a580d5f6a497a485a472e5"), {
    kind: "typed",
    type: "balance account",
    address: "0xb28bbbb7a08c701ec2a580d5f6a497a485a472e5",
  });
  assert.deepEqual(decodeSubstrate(kind, "0x0200000000000000095ea7b3a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"), {
    kind: "target",
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    selector: "0x095ea7b3",
  });
});

test(`market 53 UNISWAP_V4, vault 0xb9e8…663c at block ${BLOCK}: pool id, then tokens`, () => {
  const kind = marketInfo("53").kind;
  assert.deepEqual(decodeSubstrate(kind, "0x5d0ed52610c76d7bf729130ce7ddc0488b2f4bd0a0db1f12adbe6a32deaff893"), {
    kind: "pool-id",
    id: "0x5d0ed52610c76d7bf729130ce7ddc0488b2f4bd0a0db1f12adbe6a32deaff893",
  });
  assert.deepEqual(decodeSubstrate(kind, "0x0000000000000000000000006440f144b7e50d6a8439336510312d2f54beb01d"), {
    kind: "address",
    address: "0x6440f144b7e50d6a8439336510312d2f54beb01d",
  });
});

test(`market 100001 ERC4626_0001, vault 0x7d67…3152 at block ${BLOCK}: a child vault`, () => {
  assert.deepEqual(marketInfo("100001"), { constant: "ERC4626_0001", venue: "ERC-4626 vault", kind: "child" });
  assert.deepEqual(decodeSubstrate("child", "0x00000000000000000000000008efcc2f3e61185d0ea7f8830b3fec9bfa2ee313"), {
    kind: "address",
    address: "0x08efcc2f3e61185d0ea7f8830b3fec9bfa2ee313",
  });
});

test(`market 16 CURVE_POOL, vault 0xb9e8…663c at block ${BLOCK}: a pool, not covered`, () => {
  const info = marketInfo("16");
  assert.equal(info.covered, undefined);
  assert.deepEqual(decodeSubstrate(info.kind, "0x000000000000000000000000efc6516323fbd28e80b85a497b65a86243a54b3e"), {
    kind: "address",
    address: "0xefc6516323fbd28e80b85a497b65a86243a54b3e",
  });
});

test(`market 12 UNIVERSAL_TOKEN_SWAPPER, vault 0xbbee…66ad at block ${BLOCK}: a route`, () => {
  assert.equal(marketInfo("12").kind, "route");
  assert.equal(marketInfo(ZERO_BALANCE_MARKET).kind, "route");
});

test("a market id IPOR does not list is raw, and a misfit substrate stays raw", () => {
  assert.deepEqual(marketInfo("4242424242"), { constant: null, venue: "Market 4242424242", kind: "raw" });
  const hex = "0xe846ca062ab869b66ae8dcd811973f628ba82eaf010001000000000000000000";
  assert.deepEqual(decodeSubstrate("tokens", hex), { kind: "raw", hex });
});

test("the addresses a market's substrates name", () => {
  const subs = [
    decodeSubstrate("external", "0x0200000000000000095ea7b3a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"),
    decodeSubstrate("euler", "0xe846ca062ab869b66ae8dcd811973f628ba82eaf010001000000000000000000"),
    decodeSubstrate("morpho", "0xe3df58f9d3011b7481ff36b939fa5f8da642f34ea5792d25d3958dbf1efa26d7"),
  ];
  assert.deepEqual(substrateAddresses(subs), [
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    "0xe846ca062ab869b66ae8dcd811973f628ba82eaf",
  ]);
});

const { substrateWords, substratesLine, lltvText } = await import("../../lib/ipor-fusion/market-words.ts");

const NAMES = {
  names: {
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { symbol: "USDC", named: true },
    "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0": { symbol: "wstETH", named: true },
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": { symbol: "WETH", named: true },
  },
  childAssets: {},
  registries: { "0x20f7c9ad66983f6523a0881d0f82406541417526": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" },
  morpho: {
    "0xe3df58f9d3011b7481ff36b939fa5f8da642f34ea5792d25d3958dbf1efa26d7": {
      loanToken: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      collateralToken: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
      lltv: "945000000000000000",
    },
    "0xeb17955ea422baeddbfb0b8d8c9086c5be7a9cfdefb292119a102e981a30062e": null,
  },
};

test("an LLTV in WAD as a percentage", () => {
  assert.equal(lltvText("945000000000000000"), "94.5%");
  assert.equal(lltvText("860000000000000000"), "86%");
});

test(`market 14 MORPHO words, vault 0xc825…1d39 at block ${BLOCK}: pair and LLTV, or the catalog miss`, () => {
  assert.equal(
    substrateWords(
      { kind: "morpho-market", id: "0xe3df58f9d3011b7481ff36b939fa5f8da642f34ea5792d25d3958dbf1efa26d7" },
      NAMES,
    ),
    "wstETH / WETH 94.5%",
  );
  assert.equal(
    substrateWords(
      { kind: "morpho-market", id: "0xeb17955ea422baeddbfb0b8d8c9086c5be7a9cfdefb292119a102e981a30062e" },
      NAMES,
    ),
    "0xeb17…062e, not in Rails' catalog",
  );
});

test(`market 29 LIQUITY_V2 words, vault 0xb9e8…663c at block ${BLOCK}: the branch by its collateral`, () => {
  const s = decodeSubstrate("liquity", "0x00000000000000000000000220f7c9ad66983f6523a0881d0f82406541417526");
  assert.equal(substrateWords(s, NAMES), "WETH branch (tag 2)");
});

test("a long grant list stops at four and counts the rest", () => {
  const subs = Array.from({ length: 6 }, () => ({
    kind: "address",
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  }));
  assert.equal(substratesLine(subs, NAMES), "USDC, USDC, USDC, USDC +2 more");
});
