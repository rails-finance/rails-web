// Liquity V2's Status as Open / Closed / All (lib/liquity-v2/listing-visibility.ts,
// ui-jobs 805), with the Dormant switch beside Open and Closed by liquidation
// beside Closed: the contextual default, old `?status=` lists read as the choice
// and the switches, the buckets each choice asks the troves route for, and the
// in-memory predicate the forks (Asymmetry, Ebisu, Basedollar) filter with.
// Run: npm test
//
// The module imports its siblings by extensionless relative specifier, so this
// file registers a resolver that adds the `.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL) {
    const url = new URL(specifier + ".ts", context.parentURL).href;
    if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const {
  defaultStatusChoice,
  statusChoice,
  dormantOnly,
  endedByLiquidation,
  readTroveStatusParam,
  setTroveDormant,
  setTroveStatus,
  troveStatusBuckets,
  troveStatusValue,
  troveDimensionAdmits,
  troveCountLine,
} = await import("../../lib/liquity-v2/listing-visibility.ts");

const HOLDER = "0x" + "ab".repeat(20);
const BARE = { q: "", status: [], dormant: [], ended: [] };

/** The filters an old link's `?status=` decodes to on the bare listing. */
const fromLink = (status, base = BARE) => setTroveStatus(base, status.split(","));

test("the bare listing rests on Open and asks for the open troves, dormant included", () => {
  assert.equal(defaultStatusChoice(BARE), "open");
  assert.equal(statusChoice(BARE), "open");
  assert.deepEqual(troveStatusBuckets(BARE), ["open"]);
  assert.deepEqual(troveCountLine(BARE), { noun: "open Troves" });
});

test("a search naming a wallet, an ENS name or a trove id rests on All, which sends no status", () => {
  for (const q of [HOLDER, "alice.eth", "12345"]) {
    const f = { ...BARE, q };
    assert.equal(statusChoice(f), "all", q);
    assert.equal(troveStatusBuckets(f), undefined, q);
    assert.deepEqual(troveCountLine(f), { noun: "Troves" });
  }
  // Free text names no identity.
  assert.equal(statusChoice({ ...BARE, q: "weth" }), "open");
});

test("the buckets each choice and switch sends", () => {
  assert.deepEqual(troveStatusBuckets({ ...BARE, dormant: ["dormant"] }), ["zombie"]);
  assert.deepEqual(troveStatusBuckets({ ...BARE, status: ["closed"] }), ["closed", "liquidated"]);
  assert.deepEqual(troveStatusBuckets({ ...BARE, status: ["closed"], ended: ["liquidated"] }), ["liquidated"]);
  assert.equal(troveStatusBuckets({ ...BARE, status: ["all"] }), undefined);
});

test("each switch counts only beside its own choice", () => {
  assert.equal(dormantOnly({ ...BARE, status: ["closed"], dormant: ["dormant"] }), false);
  assert.equal(endedByLiquidation({ ...BARE, ended: ["liquidated"] }), false);
  assert.deepEqual(
    troveStatusBuckets({ ...BARE, status: ["all"], dormant: ["dormant"], ended: ["liquidated"] }),
    undefined,
  );
});

test("old links map onto the choice and the switches", () => {
  const read = (s) => readTroveStatusParam(s.split(","));
  const none = { endedByLiquidation: false, dormantOnly: false, activeOnly: false };
  assert.deepEqual(read("active,zombie"), { ...none, choice: "open" });
  assert.deepEqual(read("open"), { ...none, choice: "open" });
  assert.deepEqual(read("zombie"), { ...none, choice: "open", dormantOnly: true });
  assert.deepEqual(read("active"), { ...none, choice: "open", activeOnly: true });
  assert.deepEqual(read("liquidated"), { ...none, choice: "closed", endedByLiquidation: true });
  assert.deepEqual(read("closed"), { ...none, choice: "closed" });
  assert.deepEqual(read("closed,liquidated"), { ...none, choice: "closed" });
  for (const s of ["active,closed", "zombie,liquidated", "open,closed", "active,zombie,closed,liquidated", "all"]) {
    assert.deepEqual(read(s), { ...none, choice: "all" }, s);
  }
});

test("the queue link's status=active is Open with Dormant left out", () => {
  const active = fromLink("active");
  assert.deepEqual(active, { ...BARE, status: ["active"] });
  assert.equal(statusChoice(active), "open");
  assert.equal(troveStatusValue(active), "active");
  assert.deepEqual(troveStatusBuckets(active), ["active"]);
  // The forks' filter drops the dormant troves.
  const lifecycles = ["open", "zombie", "closed", "liquidated"];
  assert.deepEqual(
    lifecycles.filter((l) => troveDimensionAdmits("status", [troveStatusValue(active)], l)),
    ["open"],
  );
  // Plain status=open still takes in Dormant.
  const open = fromLink("open");
  assert.deepEqual(open, BARE);
  assert.deepEqual(troveStatusBuckets(open), ["open"]);
  assert.deepEqual(
    lifecycles.filter((l) => troveDimensionAdmits("status", [troveStatusValue(open)], l)),
    ["open", "zombie"],
  );
  // On a holder search it is still Open without Dormant.
  const held = fromLink("active", { ...BARE, q: HOLDER });
  assert.deepEqual(troveStatusBuckets(held), ["active"]);
});

test("picking a Status choice or the Dormant switch drops status=active", () => {
  const active = fromLink("active");
  assert.deepEqual(setTroveStatus(active, ["open"]), BARE);
  assert.deepEqual(setTroveStatus(active, ["closed"]), { ...BARE, status: ["closed"] });
  assert.deepEqual(setTroveStatus(active, ["all"]), { ...BARE, status: ["all"] });
  const dormant = setTroveDormant(active, ["dormant"]);
  assert.deepEqual(dormant, { ...BARE, dormant: ["dormant"] });
  assert.deepEqual(troveStatusBuckets(dormant), ["zombie"]);
  // On a holder search Open is not the resting choice, so it is written.
  const held = setTroveDormant(fromLink("active", { ...BARE, q: HOLDER }), ["dormant"]);
  assert.deepEqual(held.status, ["open"]);
  // Turning the switch off leaves the link value alone.
  assert.deepEqual(setTroveDormant(active, []), active);
});

test("an old link decodes to filters that send the same troves or more", () => {
  assert.deepEqual(fromLink("active,zombie"), BARE);
  assert.deepEqual(fromLink("zombie"), { ...BARE, dormant: ["dormant"] });
  assert.deepEqual(troveStatusBuckets(fromLink("zombie")), ["zombie"]);
  assert.deepEqual(fromLink("liquidated"), { ...BARE, status: ["closed"], ended: ["liquidated"] });
  assert.deepEqual(troveStatusBuckets(fromLink("liquidated")), ["liquidated"]);
  assert.deepEqual(fromLink("active,liquidated"), { ...BARE, status: ["all"] });
  // On an identity search All is the default, so it writes no choice.
  assert.deepEqual(fromLink("active,closed", { ...BARE, q: HOLDER }), { ...BARE, q: HOLDER });
});

test("a Status edit drops the switch of the choice it leaves", () => {
  const dormant = { ...BARE, dormant: ["dormant"] };
  assert.deepEqual(setTroveStatus(dormant, ["closed"]), { ...BARE, status: ["closed"] });
  const ended = { ...BARE, status: ["closed"], ended: ["liquidated"] };
  assert.deepEqual(setTroveStatus(ended, ["open"]), BARE);
  assert.deepEqual(setTroveStatus(ended, ["closed"]), ended);
});

test("the forks' in-memory predicate matches the buckets the route reads", () => {
  const lifecycles = ["open", "zombie", "closed", "liquidated"];
  const views = [
    [{ ...BARE }, ["open", "zombie"]],
    [{ ...BARE, dormant: ["dormant"] }, ["zombie"]],
    [{ ...BARE, status: ["closed"] }, ["closed", "liquidated"]],
    [{ ...BARE, status: ["closed"], ended: ["liquidated"] }, ["liquidated"]],
    [{ ...BARE, status: ["all"] }, lifecycles],
    [{ ...BARE, q: "12345" }, lifecycles],
  ];
  // What the listing does: each dimension's values (the choice, and a switch's
  // value only beside its choice), skipped when empty, every one admitting.
  const dims = [
    ["status", (f) => [statusChoice(f)]],
    ["dormant", (f) => (dormantOnly(f) ? ["dormant"] : [])],
    ["ended", (f) => (endedByLiquidation(f) ? ["liquidated"] : [])],
  ];
  for (const [f, want] of views) {
    const shown = lifecycles.filter((l) =>
      dims.every(([id, get]) => get(f).length === 0 || troveDimensionAdmits(id, get(f), l)),
    );
    assert.deepEqual(shown, want, JSON.stringify(f));
  }
});
