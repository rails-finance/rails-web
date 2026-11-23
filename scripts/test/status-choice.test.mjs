// Status as Open / Closed / All (ui-jobs 805): the old `?status=` lists that
// links and saved listings carry map onto the choice and the "Closed by
// liquidation" switch, and the choice maps onto the buckets an API is asked for.

import test from "node:test";
import assert from "node:assert/strict";
import {
  everyStatusParam,
  readStatusParam,
  setStatusChoice,
  STATUS_CHOICE_OPTIONS,
  statusBuckets,
  statusNoun,
} from "../../lib/shared/status-choice.ts";

const read = (s) => readStatusParam(s.split(","));

test("the three values read as themselves", () => {
  assert.deepEqual(read("open"), { choice: "open", endedByLiquidation: false });
  assert.deepEqual(read("closed"), { choice: "closed", endedByLiquidation: false });
  assert.deepEqual(read("all"), { choice: "all", endedByLiquidation: false });
});

test("an old list naming every status is All", () => {
  assert.deepEqual(read("open,closed,liquidated"), { choice: "all", endedByLiquidation: false });
});

test("an old list on both sides of the lifecycle is All", () => {
  assert.equal(read("open,closed").choice, "all");
  assert.equal(read("open,liquidated").choice, "all");
});

test("the closed side of an old list is Closed", () => {
  assert.deepEqual(read("closed,liquidated"), { choice: "closed", endedByLiquidation: false });
});

test("liquidated alone is Closed with the switch on", () => {
  assert.deepEqual(read("liquidated"), { choice: "closed", endedByLiquidation: true });
});

test("an empty or unknown param leaves the listing on its resting choice", () => {
  assert.equal(readStatusParam([]).choice, null);
  assert.equal(read("zombie").choice, null);
});

test("the start page's every-status link reads as All", () => {
  assert.equal(read(everyStatusParam(["open", "closed", "all"])).choice, "all");
  assert.equal(everyStatusParam(["open", "closed", "all"]), "all");
  assert.equal(everyStatusParam(["open", "closed", "liquidated"]), "open,closed,liquidated");
});

test("Closed asks an API for both ways a position ended", () => {
  assert.deepEqual(statusBuckets("open", false), ["open"]);
  assert.deepEqual(statusBuckets("closed", false), ["closed", "liquidated"]);
  assert.deepEqual(statusBuckets("closed", true), ["liquidated"]);
  assert.equal(statusBuckets("all", false), undefined);
});

test("an old link shows at least the rows it showed", () => {
  for (const old of ["open", "closed", "liquidated", "open,closed", "closed,liquidated", "open,closed,liquidated"]) {
    const { choice, endedByLiquidation } = read(old);
    const now = statusBuckets(choice, endedByLiquidation) ?? ["open", "closed", "liquidated"];
    for (const bucket of old.split(",")) assert.ok(now.includes(bucket), `${old} keeps ${bucket}`);
  }
});

test("the count line names the choice", () => {
  assert.equal(statusNoun("open", "positions"), "open positions");
  assert.equal(statusNoun("closed", "positions"), "closed positions");
  assert.equal(statusNoun("all", "positions"), "positions");
});

test("All is the one segment marked every", () => {
  assert.deepEqual(
    STATUS_CHOICE_OPTIONS.filter((o) => o.every).map((o) => o.value),
    ["all"],
  );
});

test("setStatusChoice stores the resting choice as nothing", () => {
  assert.deepEqual(setStatusChoice(["open"], "open", []), { status: [], ended: [] });
  assert.deepEqual(setStatusChoice(["closed"], "open", []), { status: ["closed"], ended: [] });
  assert.deepEqual(setStatusChoice(["all"], "all", []), { status: [], ended: [] });
  assert.deepEqual(setStatusChoice(["open"], "all", []), { status: ["open"], ended: [] });
  // A param that names no status keeps the resting choice.
  assert.deepEqual(setStatusChoice(["nonsense"], "open", []), { status: [], ended: [] });
});

test("setStatusChoice keeps the switch only with the choice it narrows", () => {
  const on = ["liquidated"];
  assert.deepEqual(setStatusChoice(["closed"], "open", on), { status: ["closed"], ended: on });
  assert.deepEqual(setStatusChoice(["open"], "open", on), { status: [], ended: [] });
  assert.deepEqual(setStatusChoice(["all"], "open", on), { status: ["all"], ended: [] });
});

test("setStatusChoice turns the switch on for an old list naming liquidated alone", () => {
  assert.deepEqual(setStatusChoice(["liquidated"], "open", []), { status: ["closed"], ended: ["liquidated"] });
  assert.deepEqual(setStatusChoice(["closed", "liquidated"], "open", []), { status: ["closed"], ended: [] });
  assert.deepEqual(setStatusChoice(["open", "closed", "liquidated"], "open", ["liquidated"]), {
    status: ["all"],
    ended: [],
  });
});

test("setStatusChoice takes a family's own reading and switch", () => {
  // Frankencoin: Denied narrows Closed.
  const denied = { value: "denied", narrows: "closed" };
  assert.deepEqual(setStatusChoice({ choice: "closed", switchOn: true }, "open", [], denied), {
    status: ["closed"],
    ended: ["denied"],
  });
  // f(x): "Liquidated before" goes with All.
  const before = { value: "liquidated", narrows: "all" };
  assert.deepEqual(setStatusChoice({ choice: "all", switchOn: true }, "open", [], before), {
    status: ["all"],
    ended: ["liquidated"],
  });
  assert.deepEqual(setStatusChoice({ choice: "all", switchOn: false }, "all", ["liquidated"], before), {
    status: [],
    ended: ["liquidated"],
  });
  assert.deepEqual(setStatusChoice({ choice: "closed", switchOn: false }, "open", ["liquidated"], before), {
    status: ["closed"],
    ended: [],
  });
  assert.deepEqual(setStatusChoice({ choice: null, switchOn: false }, "all", [], before), { status: [], ended: [] });
});
