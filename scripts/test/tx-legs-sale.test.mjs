// Miles's 2 Nov 2026 rulings in the sale reading (lib/shared/tx-legs.ts;
// rails-ops TO-DO-ui-jobs 438), against synthetic receipts: several legs back
// in one token and across tokens, a fee leg under 1%, a partial fill.
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { needsLegPrices, saleReading } from "../../lib/shared/tx-legs.ts";

const ROUTER = "0xd7f1dd5d49206349cae8b585fcb0ce3d96f1696f";
const A_USDC = "0x4e65fe4dba92790696d040ac24aa414708f5c0ab";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const PIZZA = "0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07";

const sentLeg = (raw, token = A_USDC) => ({
  token,
  symbol: token,
  decimals: 18,
  raw,
  counterparty: ROUTER,
  source: "log",
  logIndex: 1,
});
const eth = (raw, usd) => ({
  token: null,
  symbol: "ETH",
  decimals: 18,
  raw,
  counterparty: ROUTER,
  source: "asset-transfers",
  ...(usd != null ? { usd } : {}),
});
const erc20 = (token, symbol, decimals, raw, usd, logIndex = 2) => ({
  token,
  symbol,
  decimals,
  raw,
  counterparty: ROUTER,
  source: "log",
  logIndex,
  ...(usd != null ? { usd } : {}),
});

test("one leg back reads as a sale of it", () => {
  const r = saleReading({ sent: [sentLeg("6252153")], back: [eth("1992476694556228")] }, ROUTER);
  assert.equal(r.sold, true);
  assert.equal(r.leg.raw, "1992476694556228");
  assert.equal(r.legsBack, 1);
  assert.equal(r.feeLegs, 0);
  assert.equal(r.partial, undefined);
});

test("nothing back stays Transferred", () => {
  assert.deepEqual(saleReading({ sent: [sentLeg("7285932")], back: [] }), { sold: false, why: "no-leg-back" });
});

test("several legs back in one token: the largest, by amount", () => {
  const back = [eth("400000000000000"), eth("1600000000000000"), eth("900000000000000")];
  assert.equal(needsLegPrices({ sent: [sentLeg("6000000")], back }), false);
  const r = saleReading({ sent: [sentLeg("6000000")], back }, ROUTER);
  assert.equal(r.sold, true);
  assert.equal(r.leg.raw, "1600000000000000");
  assert.equal(r.legsBack, 3);
});

test("several legs back across tokens: the largest, by USD at the block", () => {
  // 0.002 ETH at $3,000 = $6; 3 USDC at $1 = $3: ETH is the larger.
  const back = [erc20(USDC, "USDC", 6, "3000000", 1), eth("2000000000000000", 3000)];
  assert.equal(needsLegPrices({ sent: [sentLeg("9000000")], back }), true);
  const r = saleReading({ sent: [sentLeg("9000000")], back }, ROUTER);
  assert.equal(r.sold, true);
  assert.equal(r.leg.symbol, "ETH");
  assert.equal(r.legsBack, 2);
  // At $1,000 the ETH is $2 and the USDC the larger.
  const cheap = [erc20(USDC, "USDC", 6, "3000000", 1), eth("2000000000000000", 1000)];
  const r2 = saleReading({ sent: [sentLeg("9000000")], back: cheap }, ROUTER);
  assert.equal(r2.sold && r2.leg.symbol, "USDC");
});

test("across tokens with a price missing, the legs are not ranked: Transferred", () => {
  const back = [erc20(PIZZA, "Pizza", 18, "1001404741585039830518985"), eth("2000000000000000", 3000)];
  assert.deepEqual(saleReading({ sent: [sentLeg("1162329")], back }, ROUTER), { sold: false, why: "several-legs" });
});

test("a fee leg under 1% of the largest is left out", () => {
  // $6 of ETH back and $0.05 of USDC (0.8%): one leg, the fee set aside.
  const back = [eth("2000000000000000", 3000), erc20(USDC, "USDC", 6, "50000", 1)];
  const r = saleReading({ sent: [sentLeg("6000000")], back }, ROUTER);
  assert.equal(r.sold, true);
  assert.equal(r.leg.symbol, "ETH");
  assert.equal(r.legsBack, 1);
  assert.equal(r.feeLegs, 1);
  // $0.07 is over 1% of $6: both kept, the largest named.
  const kept = [eth("2000000000000000", 3000), erc20(USDC, "USDC", 6, "70000", 1)];
  const r2 = saleReading({ sent: [sentLeg("6000000")], back: kept }, ROUTER);
  assert.equal(r2.sold && r2.legsBack, 2);
  assert.equal(r2.sold && r2.feeLegs, 0);
});

test("a fee leg in the same token is compared by amount", () => {
  const back = [eth("2000000000000000"), eth("19999999999999")];
  const r = saleReading({ sent: [sentLeg("6000000")], back }, ROUTER);
  assert.equal(r.sold && r.feeLegs, 1);
  assert.equal(r.sold && r.leg.raw, "2000000000000000");
  const edge = [eth("2000000000000000"), eth("20000000000000")];
  assert.equal(saleReading({ sent: [sentLeg("6000000")], back: edge }, ROUTER).feeLegs, 0);
});

test("a partial fill reads as a sale of what went", () => {
  // 10 aUSDC sent, 2.5 came back unsold, 0.0025 ETH paid.
  const back = [erc20(A_USDC, "aBasUSDC", 6, "2500000", undefined, 3), eth("2500000000000000")];
  const r = saleReading({ sent: [sentLeg("10000000")], back }, ROUTER);
  assert.equal(r.sold, true);
  assert.equal(r.leg.symbol, "ETH");
  assert.deepEqual(r.partial, { sentRaw: "10000000", returnedRaw: "2500000", soldRaw: "7500000", decimals: 6 });
});

test("all of the sent token back is no sale", () => {
  const back = [erc20(A_USDC, "aBasUSDC", 6, "10000000", undefined, 3), eth("2500000000000000")];
  assert.deepEqual(saleReading({ sent: [sentLeg("10000000")], back }, ROUTER), { sold: false, why: "partial-fill" });
});

test("a leg back in another token the wallet sent is a batched transaction: Transferred", () => {
  // Withdrew USDC (aUSDC burned), sold aUSDC to the router, USDC came back.
  const sent = [{ ...sentLeg("2000000000", USDC), counterparty: A_USDC }, sentLeg("1999999999")];
  const back = [erc20(USDC, "USDC", 6, "2000000000"), eth("1000000000000000")];
  assert.deepEqual(saleReading({ sent, back }, ROUTER), { sold: false, why: "batched" });
});
