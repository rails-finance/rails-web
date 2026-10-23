// The timeline bar's entry facts (lib/shared/tx-entry.ts; anatomy P3.1.1,
// P3.1.2): what a served row carries, and the "not yours" test against the
// cases read on 23 Oct 2026 (a Safe sent through by its owner, a 7702 account,
// a 4337 bundle the wallet's own user operation rode, a liquidation).
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { entryAddress, notTheirs, txEntryOf } from "../../lib/shared/tx-entry.ts";

const SAFE = "0x564296e0bae529e11029f9078742815720b8773a";
const OWNER = "0x233a7314333248741134ffc390f9cf4d3f0d3d4d";
const WALLET = "0xe908c2d5613d24d49e376f19715c795db8e04f81";

test("a served row's fields, and the address the bar names", () => {
  assert.equal(txEntryOf({ tx_to: null }), undefined);
  const e = txEntryOf({
    tx_to: SAFE,
    entry_contract: "0xBC3FC959FEF3F12A41738F406C02198CDEE7481F",
    entry_account: SAFE,
    tx_from: OWNER,
  });
  assert.equal(entryAddress(e), "0xbc3fc959fef3f12a41738f406c02198cdee7481f");
  assert.equal(
    entryAddress(txEntryOf({ tx_to: "0xD7F1DD5D49206349CAE8B585FCB0CE3D96F1696F" })),
    "0xd7f1dd5d49206349cae8b585fcb0ce3d96f1696f",
  );
});

test("a Safe's owner sending through the Safe is the person's", () => {
  const e = txEntryOf({ tx_to: SAFE, entry_contract: "0xbc3f", entry_account: SAFE, tx_from: OWNER });
  assert.equal(notTheirs(e, SAFE, { list: [OWNER], isContract: true }), false);
  // Owners not read yet: a contract account marks nothing.
  assert.equal(notTheirs({ to: "0xaaaa", from: "0xbbbb" }, SAFE, { list: null, isContract: true }), false);
  // A bot that is not an owner, through a product's executor.
  assert.equal(notTheirs({ to: "0xexec", from: "0xbot" }, SAFE, { list: [OWNER], isContract: true }), true);
});

test("a bundler relaying the wallet's own user operation is the person's; a liquidator is not", () => {
  const op = { to: "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789", contract: "0x0000", account: WALLET, from: "0x54e2" };
  assert.equal(notTheirs(op, WALLET, { list: null, isContract: false }), false);
  const liq = { to: "0x3e9f", from: "0xef13" };
  assert.equal(notTheirs(liq, WALLET, { list: null, isContract: false }), true);
  assert.equal(notTheirs({ to: "0xa238", from: WALLET }, WALLET, { list: null, isContract: false }), false);
  assert.equal(notTheirs({ to: "0xa238" }, WALLET, { list: null, isContract: false }), false);
});
