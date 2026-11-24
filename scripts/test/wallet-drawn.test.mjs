// lib/wallet/families/module.ts drawn: a module's positions past its drawLimit
// are counted and not drawn, the open ones with the most dollars kept first
// (the vault shares, ui-jobs 783). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { drawn } from "../../lib/wallet/families/module.ts";

const p = (status, usd) => ({ status, collateralUsd: usd, positionId: `${status}-${usd}` });

test("under the limit every position is drawn", () => {
  const all = [p("open", 1), p("closed", undefined)];
  assert.deepEqual(drawn({ summaryFamily: "vaults", drawLimit: 2 }, all), { drawn: all });
  assert.deepEqual(drawn({ summaryFamily: "maple" }, all), { drawn: all });
});

test("past the limit the largest open ones stay, then the closed, the rest counted", () => {
  const all = [p("closed", undefined), p("open", 5), p("open", undefined), p("open", 50), p("closed", undefined)];
  const r = drawn({ summaryFamily: "vaults", drawLimit: 3 }, all);
  assert.deepEqual(
    r.drawn.map((x) => x.positionId),
    ["open-50", "open-5", "open-undefined"],
  );
  assert.deepEqual(r.undrawn, { family: "vaults", open: 0, closed: 2 });
  const two = drawn({ summaryFamily: "vaults", drawLimit: 1 }, all);
  assert.deepEqual(two.undrawn, { family: "vaults", open: 2, closed: 2 });
});
