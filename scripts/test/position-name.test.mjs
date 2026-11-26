// lib/shared/position-name.ts (rails-ops ui-jobs 703): one name for a position,
// "<market> · <Noun> <id>", on every surface that names it.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const {
  shortPositionId,
  listingTagId,
  marketPair,
  spacePair,
  positionName,
  positionTitle,
  positionCrumb,
  summaryPositionCrumb,
} = await import("../../lib/shared/position-name.ts");

test("a decimal id of up to ten digits reads #n", () => {
  assert.equal(shortPositionId("31245"), "#31245");
  assert.equal(shortPositionId(7), "#7");
  assert.equal(shortPositionId("999999"), "#999999");
  // A Uniswap V3 NFT id: cutting it 6…4 would make it longer.
  assert.equal(shortPositionId("1052345"), "#1052345");
  assert.equal(shortPositionId("9999999999"), "#9999999999");
  assert.equal(shortPositionId("#1234"), "#1234");
});

test("a decimal id above ten digits keeps its first six and last four", () => {
  assert.equal(shortPositionId("10000000000"), "100000…0000");
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

test("the trail's crumb leaves out an id that is the wallet", () => {
  const w = "0x3dF83ec9d2b62bb9bb83eba1218a202564bb67da";
  assert.equal(positionCrumb(positionName({ market: "Core", noun: "Position", id: w.toLowerCase() }), w), "Core");
  assert.equal(positionCrumb(positionName({ noun: "Position", id: w }), w), "Position");
  assert.equal(positionCrumb(positionName({ market: "WETH", noun: "Trove", id: "31245" }), w), "WETH · #31245");
  assert.equal(
    positionCrumb(
      positionName({
        market: "WETH",
        noun: "Trove",
        id: "89803332797170445130216482989432392196488317904030593713996450941537748664337",
      }),
      w,
    ),
    "WETH · 898033…4337",
  );
  assert.equal(positionCrumb(positionName({ market: "ETH-A", noun: "Vault", id: "31951" }), w), "ETH-A · Vault #31951");
});

test("a lending account with no market takes its chain's name; any other noun stands", () => {
  const w = "0x3dF83ec9d2b62bb9bb83eba1218a202564bb67da";
  assert.equal(positionCrumb(positionName({ noun: "Position", id: w }), w, "Arbitrum"), "Arbitrum");
  assert.equal(positionCrumb(positionName({ market: "Core", noun: "Position", id: w }), w, "Ethereum"), "Core");
  assert.equal(positionCrumb(positionName({ noun: "Trove", id: w }), w, "Ethereum"), "Trove");
  assert.equal(positionCrumb(positionName({ noun: "Deposit", id: w }), w, "Ethereum"), "Deposit");
});

// The protocol menu's rows from the wallet summary (H13.5; ui-jobs 856).
test("a wallet's Morpho Blue markets read apart, by pair or by market id", () => {
  const w = "0x3df83ec9d2b62bb9bb83eba1218a202564bb67da";
  const m1 = "b323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc";
  const m2 = "c54d7acf14de29e0e5527cabd7a576506870346a78a11a6762e2cca66322ec41";
  const row = (market, mkt) => ({ positionId: `${market}-${w}`, market: mkt, noun: "Position", chainName: "Ethereum" });
  // The summary row's loan and collateral name the market.
  assert.equal(summaryPositionCrumb(row(m1, "USDC / wstETH"), w), "USDC / wstETH");
  // With no pair, each market's id: two markets, two names.
  const a = summaryPositionCrumb(row(m1), w);
  const b = summaryPositionCrumb(row(m2), w);
  assert.equal(a, "0xb323…86cc");
  assert.equal(b, "0xc54d…ec41");
  assert.notEqual(a, "Ethereum");
});

test("a Compound V3 account names its Comet", () => {
  const w = "0x3df83ec9d2b62bb9bb83eba1218a202564bb67da";
  const comet = "0xc3d688b66703497daa19211eedff47f25384cdc3";
  const acct = (positionId, market) => ({ positionId, market, noun: "Account", chainName: "Ethereum" });
  assert.equal(summaryPositionCrumb(acct(`${comet}:${w}`, "cUSDCv3"), w), "cUSDCv3");
  assert.equal(summaryPositionCrumb(acct(`usdc:${w}`, "cUSDCv3"), w), "cUSDCv3");
  // A Comet address with no label: its address names it.
  assert.equal(summaryPositionCrumb(acct(`${comet}:${w}`), w), "0xc3d6…cdc3");
  assert.notEqual(summaryPositionCrumb(acct(`${comet}:${w}`), w), "Account");
});

test("a summary row keeps its market and id where it states them", () => {
  const w = "0x3df83ec9d2b62bb9bb83eba1218a202564bb67da";
  assert.equal(
    summaryPositionCrumb({ positionId: `${w}:core`, market: "Core", noun: "Position", chainName: "Ethereum" }, w),
    "Core",
  );
  // A lending account keyed by the wallet alone takes its chain's name.
  assert.equal(summaryPositionCrumb({ positionId: w, noun: "Position", chainName: "Arbitrum" }, w), "Arbitrum");
  assert.equal(summaryPositionCrumb({ positionId: "31245", market: "WETH", noun: "Trove" }, w), "WETH · #31245");
});
