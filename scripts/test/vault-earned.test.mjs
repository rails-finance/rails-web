// lib/vaults/earned.ts against hand-made rows (rails-ops decision 0048).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { vaultEarned } from "../../lib/vaults/earned.ts";

const row = (n, kind, sharesDelta, { assets = null, price = "1100000" } = {}) => ({
  id: `r${n}`,
  blockNumber: 100 + n,
  logIndex: 0,
  txHash: `0x${n}`,
  timestamp: 1_700_000_000 + n,
  kind,
  sharesDelta,
  assets,
  sharePriceAtBlock: price,
});
const opts = { shareDecimals: 6, claimRaw: "2300000", blockNumber: 200, replayed: true };

test("stated legs: claim + out − in", () => {
  const e = vaultEarned(
    [row(1, "deposit", "3000000", { assets: "3000000" }), row(2, "withdrawal", "-1000000", { assets: "1050000" })],
    opts,
  );
  assert.equal(e.status, "ok");
  assert.equal(e.earnedRaw, String(2300000 + 1050000 - 3000000));
  assert.deepEqual(
    e.legs.map((l) => l.basis),
    ["stated", "stated"],
  );
});

test("a transfer is its shares at the share price read at its block", () => {
  const e = vaultEarned([row(1, "transfer-in", "2000000", { price: "1100000" })], opts);
  assert.equal(e.inRaw, "2200000");
  assert.equal(e.earnedRaw, "100000");
  assert.equal(e.legs[0].basis, "read");
});

test("a negative figure stays negative", () => {
  const e = vaultEarned([row(1, "deposit", "3000000", { assets: "3000000" })], opts);
  assert.equal(e.earnedRaw, "-700000");
});

test("a transfer whose share price did not answer leaves no figure, naming the block", () => {
  const e = vaultEarned(
    [row(1, "deposit", "1000000", { assets: "1000000" }), row(7, "transfer-in", "1000000", { price: null })],
    opts,
  );
  assert.deepEqual(e, { status: "carried", block: 107 });
});

test("no figure where the replay missed balanceOf, or the claim did not answer", () => {
  const rows = [row(1, "deposit", "1000000", { assets: "1000000" })];
  assert.equal(vaultEarned(rows, { ...opts, replayed: false }).status, "unreplayed");
  assert.equal(vaultEarned(rows, { ...opts, claimRaw: null }).status, "unread");
});

test("self-transfers and cooldown rows are not legs", () => {
  const e = vaultEarned(
    [row(1, "deposit", "1000000", { assets: "1000000" }), row(2, "transfer-self", "0"), row(3, "cooldown", "0")],
    opts,
  );
  assert.equal(e.legs.length, 1);
});
