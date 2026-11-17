// lib/shared/position-name.ts (rails-ops ui-jobs 703): one name for a position,
// "<market> · <Noun> <id>", on every surface that names it.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const { shortPositionId, listingTagId, marketPair, spacePair, positionName, positionTitle } = await import(
  "../../lib/shared/position-name.ts"
);

test("a decimal id of up to six digits reads #n", () => {
  assert.equal(shortPositionId("31245"), "#31245");
  assert.equal(shortPositionId(7), "#7");
  assert.equal(shortPositionId("999999"), "#999999");
  assert.equal(shortPositionId("#1234"), "#1234");
});

test("a decimal id above six digits keeps its first six and last four", () => {
  assert.equal(shortPositionId("1000000"), "100000…0000");
  assert.equal(shortPositionId("16571820918265732190897651302456713289076543216784323211234566943"), "165718…6943");
  assert.equal(shortPositionId(BigInt("12345678901")), "123456…8901");
});

test("an address falls back to 6…4", () => {
  assert.equal(shortPositionId("0x3df8a1b2c3d4e5f60718293a4b5c6d7e8f9067da"), "0x3df8…67da");
  // A hex id longer than an address (a Morpho market id) cuts the same way.
  assert.equal(shortPositionId(`0x${"ab".repeat(32)}`), "0xabab…abab");
});

test("anything else passes through", () => {
  assert.equal(shortPositionId("vitalik.eth"), "vitalik.eth");
  assert.equal(shortPositionId("0x3df8…67da"), "0x3df8…67da");
});

test("the listing tag drops the # its icon stands for", () => {
  assert.equal(listingTagId("1234"), "1234");
  assert.equal(listingTagId("0x3df8a1b2c3d4e5f60718293a4b5c6d7e8f9067da"), "0x3df8…67da");
});

test("a pair is spaced A / B", () => {
  assert.equal(marketPair("wstETH", "USDC"), "wstETH / USDC");
  assert.equal(spacePair("ETH/BOLD"), "ETH / BOLD");
  assert.equal(spacePair("WETH·USDC"), "WETH / USDC");
  assert.equal(spacePair("wstETH / USDC"), "wstETH / USDC");
  assert.equal(spacePair("ETH-A"), "ETH-A");
});

test("the joined name", () => {
  assert.deepEqual(positionName({ market: "ETH-A", noun: "Vault", id: "31245" }), {
    market: "ETH-A",
    noun: "Vault",
    id: "#31245",
    text: "ETH-A · Vault #31245",
  });
  assert.equal(
    positionName({ market: "Core", noun: "Position", id: "0x3df8a1b2c3d4e5f60718293a4b5c6d7e8f9067da" }).text,
    "Core · Position 0x3df8…67da",
  );
  assert.equal(
    positionName({ market: "wstETH/USDC", noun: "Position", id: 1234 }).text,
    "wstETH / USDC · Position #1234",
  );
  assert.equal(
    positionName({ noun: "Position", id: "0x3df8a1b2c3d4e5f60718293a4b5c6d7e8f9067da" }).text,
    "Position 0x3df8…67da",
  );
  assert.equal(positionName({ market: "", noun: "Account", id: "5" }).market, undefined);
});

test("the tab title is the explorer, then the name", () => {
  const t1 = positionTitle("MakerDAO", { market: "LRC-A", noun: "Vault", id: "21264" });
  const t2 = positionTitle("Compound V3", {
    market: "cUSDCv3",
    noun: "Account",
    id: "0xd51c5283b8727206bf9be2b2db4e5673efaf519c",
  });
  const t3 = positionTitle("Aave V3 on Arbitrum", {
    noun: "Position",
    id: "0x2012395e71a4af2e621d522b175f6c29232398db",
  });
  console.log(`# titles: ${t1} | ${t2} | ${t3}`);
  assert.equal(t1, "MakerDAO · LRC-A · Vault #21264");
  assert.equal(t2, "Compound V3 · cUSDCv3 · Account 0xd51c…519c");
  // No market, no empty piece.
  assert.equal(t3, "Aave V3 on Arbitrum · Position 0x2012…98db");
  assert.equal(positionTitle("Fluid", { market: "", noun: "Position", id: 7682 }), "Fluid · Position #7682");
});
