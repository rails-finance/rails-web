// lib/liquity-v2/redeemer-routes.ts: the redeemer page's path, and when a
// deposit card's sender opens it. The rows are 751's route answer for tx
// 0x1948…b33a (kings-cross, 18 Nov 2026), trimmed to the fields read.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIQUITY_V2_REDEEMER_PATH,
  liquityV2RedeemerHref,
  normalizeRedeemer,
  sentRedemption,
  troveEventHref,
  troveEventId,
} from "../../lib/liquity-v2/redeemer-routes.ts";

const FROM = "0x0000000000c5da59ee1b2d2ef258a3290a916012";
const ROWS = [
  { operation: "openTrove", transaction_from: FROM },
  { operation: "closeTrove", transaction_from: FROM },
  { operation: "redeemCollateral", transaction_from: FROM },
];

test("the redeemer page sits under the Liquity V2 explorer, the address lowercased", () => {
  assert.equal(LIQUITY_V2_REDEEMER_PATH, "/ethereum/liquity-v2/redeemer");
  assert.equal(liquityV2RedeemerHref(FROM.toUpperCase().replace("0X", "0x")), `/ethereum/liquity-v2/redeemer/${FROM}`);
});

test("normalizeRedeemer takes an address in any case and nothing else", () => {
  assert.equal(normalizeRedeemer(` ${FROM.replace("c5da", "C5DA")} `), FROM);
  for (const bad of [null, undefined, "", "0x1234", `${FROM}00`, FROM.slice(2), "alice.eth"]) {
    assert.equal(normalizeRedeemer(bad), null, String(bad));
  }
});

test("sentRedemption: a redeemCollateral row in a transaction the sender sent", () => {
  assert.equal(sentRedemption(ROWS, FROM), true);
  assert.equal(sentRedemption(ROWS, FROM.replace("c5da", "C5DA")), true);
  assert.equal(sentRedemption(ROWS.slice(0, 2), FROM), false, "no redemption in the transaction");
  assert.equal(sentRedemption(ROWS, `0x${"ab".repeat(20)}`), false, "another address sent it");
  assert.equal(sentRedemption([], FROM), false);
});

test("a redemption row opens the Trove's event page, under the id the Trove's timeline gives it", () => {
  // The Trove timeline's id for tx 0x1948…b33a on WETH Trove 6675…4739 (the
  // timeline route's answer, 19 Nov 2026): the TroveOperation log's index.
  const tx = "0x1948935cba9c243bd7fa1112bc7b5110a6020cb70f156844c3111c22ad4fb33a";
  const id = troveEventId(tx, 687);
  assert.equal(id, `${tx}_687`);
  assert.equal(troveEventHref("WETH", "667514", id), `/ethereum/liquity-v2/trove/WETH/667514/event/${tx}_687`);
});
