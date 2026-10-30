// lib/shared/change-log-read.ts and withChanges: a change log that could not
// be read is unavailable; one with no changes in it is empty and says nothing.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { changeLogRead, fetchChangeLog } from "../../lib/shared/change-log-read.ts";
import { withChanges } from "../../lib/shared/flows-changes.ts";

test("an answered log, even with no logs in it, is the log", () => {
  const empty = { logs: [] };
  assert.deepEqual(changeLogRead(true, empty), { log: empty, unavailable: false });
});

test("a failed read is unavailable", () => {
  assert.deepEqual(changeLogRead(false, null), { log: null, unavailable: true });
  assert.deepEqual(changeLogRead(true, null), { log: null, unavailable: true });
});

test("fetchChangeLog: a 502 is unavailable, a 200 with an empty list is empty, a network error is unavailable", async () => {
  const real = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{"error":"x"}', { status: 502 });
    assert.deepEqual(await fetchChangeLog("/x"), { log: null, unavailable: true });
    globalThis.fetch = async () => new Response('{"logs":[]}', { status: 200 });
    assert.deepEqual(await fetchChangeLog("/x"), { log: { logs: [] }, unavailable: false });
    globalThis.fetch = async () => {
      throw new TypeError("network");
    };
    assert.deepEqual(await fetchChangeLog("/x"), { log: null, unavailable: true });
    globalThis.fetch = async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    };
    await assert.rejects(fetchChangeLog("/x"), { name: "AbortError" });
  } finally {
    globalThis.fetch = real;
  }
});

test("withChanges: unavailable marks the timeline, an empty list leaves it as it was", () => {
  const t = { days: [] };
  assert.equal(withChanges(t, []), t);
  assert.equal(withChanges(t, [], true).changesUnavailable, true);
  assert.equal(withChanges(t, [], true).changes, undefined);
  assert.equal(withChanges(null, [], true), null);
  const c = { day: 1 };
  const both = withChanges(t, [c], false);
  assert.deepEqual(both.changes, [c]);
  assert.equal(both.changesUnavailable, undefined);
});
