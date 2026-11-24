// The house table's lead column name for a screen reader
// (lib/shared/data-table-words.ts; ui-jobs 818). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { leadHeaderName } from "../../lib/shared/data-table-words.ts";

test("the lead header names the chain only where the cells draw one", () => {
  assert.equal(leadHeaderName(), "Protocol and chain");
  assert.equal(leadHeaderName(false), "Protocol and chain");
  assert.equal(leadHeaderName(true), "Protocol");
});
