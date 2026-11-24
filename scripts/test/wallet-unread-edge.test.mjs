// lib/wallet/unread-edge.ts: the wallet card drops its lifecycle pill for an open
// position stamped "Not read", and only for one (ui-jobs 832).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { unreadEdge } from "../../lib/wallet/unread-edge.ts";

test("an open, unread position: one mark, the stamp, and no pill", () => {
  assert.deepEqual(unreadEdge({ notRead: true, status: "open" }), { unread: true });
});

test("a position that is not open keeps its pill, notRead or not", () => {
  for (const status of ["closed", "liquidated", "unread", "unknown"]) {
    assert.deepEqual(unreadEdge({ notRead: true, status }), {}, status);
  }
});

test("a read position keeps its pill", () => {
  assert.deepEqual(unreadEdge({ status: "open" }), {});
  assert.deepEqual(unreadEdge({ notRead: false, status: "open" }), {});
});
