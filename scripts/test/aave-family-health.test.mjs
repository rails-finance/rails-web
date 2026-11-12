// A health factor reads "Below 1" only under 1, as the Pool liquidates (ui-jobs 611).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { isBelowOne } from "../../lib/aave-family/health.ts";

test("exactly 1 is not below 1", () => assert.equal(isBelowOne(1), false));
test("just below 1 is", () => assert.equal(isBelowOne(0.9999999), true));
test("just above 1 is not", () => assert.equal(isBelowOne(1.0000001), false));
