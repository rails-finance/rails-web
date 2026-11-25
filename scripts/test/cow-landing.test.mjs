// lib/cow/landing.ts: the CoW wallet page's `?at=` landing. The trades route's
// `before` is exclusive, so the cursor starts just past the target; a value the
// cursor cannot carry as digits lands nowhere. Order UID and block from the
// withdraw and swap in tx 0x3782…20b3 (block 25,824,606, trade 25824606-306-3).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const { parseCowLanding, isCowLandingTrade, aaveSwapCowTradeHref } = await import("../../lib/cow/landing.ts");

const WALLET = "0xe7fe4bfaee36c2acf138b585f347771871bd9c0a";
const UID =
  "0xe09b28bcd30d2fa04b436705d1cdd4073073322c14e21ab3a098c1a14f94a8d5e7fe4bfaee36c2acf138b585f347771871bd9c0a6a8c26d3";
const TRADE = { id: "25824606-306-3", blockNumber: 25824606, orderUid: UID };

test("a trade id starts the read one log past it", () => {
  const l = parseCowLanding("25824606-306-3");
  assert.deepEqual(l, { cursor: "25824606-306-4", match: { id: "25824606-306-3" } });
  assert.ok(isCowLandingTrade(l, TRADE));
});

test("a block and order UID start the read at the next block", () => {
  const l = parseCowLanding(`25824606-${UID.toUpperCase()}`);
  assert.equal(l?.cursor, "25824607-0-0");
  assert.ok(isCowLandingTrade(l, TRADE));
  assert.ok(!isCowLandingTrade(l, { ...TRADE, blockNumber: 25824605 }));
});

test("a value the cursor cannot carry lands nowhere", () => {
  assert.equal(parseCowLanding("99999999999999999999999-0-0"), null);
  assert.equal(parseCowLanding(`99999999999999999999999-${UID}`), null);
  assert.equal(parseCowLanding("25824606-306"), null);
  assert.equal(parseCowLanding(""), null);
  assert.equal(parseCowLanding(null), null);
});

test("only an order the wallet owns, on Ethereum, links to its trade", () => {
  const swap = { kind: "withdraw_and_swap", route: "cow_permit", orderUid: UID, tradeOwner: WALLET };
  assert.equal(aaveSwapCowTradeHref(swap, WALLET, 25824606, 1), `/ethereum/cow/${WALLET}?at=25824606-${UID}`);
  assert.equal(aaveSwapCowTradeHref({ ...swap, kind: "collateral_swap" }, WALLET, 25824606, 1), undefined);
  assert.equal(aaveSwapCowTradeHref({ ...swap, route: "paraswap" }, WALLET, 25824606, 1), undefined);
  assert.equal(aaveSwapCowTradeHref({ ...swap, tradeOwner: "0x01" }, WALLET, 25824606, 1), undefined);
  assert.equal(aaveSwapCowTradeHref(swap, WALLET, 25824606, 8453), undefined);
});
