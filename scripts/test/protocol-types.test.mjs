// Each protocol's primary type (lib/shared/protocol-types.ts; rails-ops
// decision 0068 point 8, ui-jobs 780). protocols.ts imports through `@/`, so
// the roster is read as source: each entry's id, protocolKey and type.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROTOCOL_TYPE_LABELS } from "../../lib/shared/protocol-types.ts";

const src = readFileSync(new URL("../../lib/shared/protocols.ts", import.meta.url), "utf8");
const specs = src.slice(src.indexOf("const SPECS: ProtocolSpec[] = ["));

/** Each entry, by walking its 4-space-indented fields in order. */
const entries = [];
for (const line of specs.split("\n")) {
  const id = line.match(/^ {4}id: "([^"]+)",$/);
  if (id) entries.push({ id: id[1], key: id[1], type: null });
  const key = line.match(/^ {4}protocolKey: "([^"]+)",$/);
  if (key) entries.at(-1).key = key[1];
  const type = line.match(/^ {4}type: "([^"]+)",$/);
  if (type) entries.at(-1).type = type[1];
}

test("the roster reads", () => {
  assert.ok(entries.length > 50, `${entries.length} entries`);
});

test("every entry has one type from the list", () => {
  for (const e of entries) assert.ok(e.type && e.type in PROTOCOL_TYPE_LABELS, `${e.id}: ${e.type}`);
});

test("every chain row of a version takes the same type", () => {
  const byKey = new Map();
  for (const e of entries) {
    const seen = byKey.get(e.key);
    if (seen) assert.equal(e.type, seen.type, `${e.id} is ${e.type}, ${seen.id} is ${seen.type}`);
    else byKey.set(e.key, e);
  }
});

test("every type in the list has a protocol", () => {
  const used = new Set(entries.map((e) => e.type));
  for (const t of Object.keys(PROTOCOL_TYPE_LABELS)) assert.ok(used.has(t), `${t} has no protocol`);
});

test("the agreed picks (Miles, 20 Nov 2026)", () => {
  const t = Object.fromEntries(entries.map((e) => [e.id, e.type]));
  assert.equal(t.fluid, "cdp");
  assert.equal(t.fx, "cdp");
  assert.equal(t.llamalend, "lending");
  assert.equal(t.maple, "lending");
  assert.equal(t.pendle, "fixed-rate");
  assert.equal(t.pwn, "fixed-rate");
  assert.equal(t.liquity, "cdp");
});
