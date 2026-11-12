// lib/shared/read-ceiling.ts: the predicate every client uses to recognise the daily read
// ceiling's answer from rails-server's "Read on visit" routes (rails-ops decisions/0061),
// and the line drawn in its place.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const { isReadCeiling, READ_CEILING_LINE, READ_CEILING_CODE } = await import("../../lib/shared/read-ceiling.ts");

const ceiling = {
  error: "read_ceiling",
  message: "Rails could not read the chain until the next UTC day.",
  until: "2026-11-13T00:00:00.000Z",
};

test("the ceiling's answer: 503 with error read_ceiling", () => {
  assert.equal(READ_CEILING_CODE, "read_ceiling");
  assert.equal(isReadCeiling(503, ceiling), true);
  assert.equal(isReadCeiling(503, { error: "read_ceiling" }), true);
});

test("any other answer is not the ceiling", () => {
  assert.equal(isReadCeiling(502, ceiling), false);
  assert.equal(isReadCeiling(429, ceiling), false);
  assert.equal(isReadCeiling(200, ceiling), false);
  assert.equal(isReadCeiling(503, { error: "read_failed" }), false);
  assert.equal(isReadCeiling(503, { error: "index_unavailable" }), false);
  assert.equal(isReadCeiling(503, { error: "index_behind" }), false);
  assert.equal(isReadCeiling(503, null), false);
  assert.equal(isReadCeiling(503, "read_ceiling"), false);
  assert.equal(isReadCeiling(503, {}), false);
});

test("the line is the approved wording", () => {
  assert.equal(
    READ_CEILING_LINE,
    "Rails has reached its daily limit for reading the chain. Pages read again from midnight UTC.",
  );
});
