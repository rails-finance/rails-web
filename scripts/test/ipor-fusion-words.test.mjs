// The IPOR Fusion factsheet's words (lib/ipor-fusion/words.ts,
// lib/ipor-fusion/addresses.ts): fees in basis points, and the role names the
// ruling of 19 Nov 2026 set (owner = role 1, curator = role 200, Atomist =
// role 100, every other role by its constant).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const hook = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(spec, ctx, next) {
  if ((spec.startsWith("./") || spec.startsWith("../")) && !/\\.[a-z]+$/.test(spec)) {
    const url = new URL(spec, ctx.parentURL).href;
    if (existsSync(fileURLToPath(url + ".ts"))) return next(url + ".ts", ctx);
  }
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));

const { bpsText, roleName } = await import("../../lib/ipor-fusion/words.ts");
const { IPOR_ROLES, IPOR_STEWARD_ROLES, IPOR_FUSE_WHITELIST } = await import("../../lib/ipor-fusion/addresses.ts");

test("fees are basis points", () => {
  assert.equal(bpsText(500), "5%");
  assert.equal(bpsText(30), "0.3%");
  assert.equal(bpsText(0), "0%");
  assert.equal(bpsText(1), "0.01%");
});

test("the three named roles carry the ruling's words", () => {
  assert.deepEqual(roleName("1"), { text: "Owner", constant: false });
  assert.deepEqual(roleName("200"), { text: "Curator", constant: false });
  assert.deepEqual(roleName("100"), { text: "Atomist", constant: false });
  assert.equal(IPOR_ROLES["1"].constant, "OWNER_ROLE");
  assert.equal(IPOR_ROLES["100"].constant, "ATOMIST_ROLE");
  assert.equal(IPOR_ROLES["200"].constant, "ALPHA_ROLE");
});

test("every other role is its constant, set as code", () => {
  assert.deepEqual(roleName("2"), { text: "GUARDIAN_ROLE", constant: true });
  assert.deepEqual(roleName("1200"), { text: "PRICE_ORACLE_MIDDLEWARE_MANAGER_ROLE", constant: true });
  assert.deepEqual(roleName("4242"), { text: "role 4242", constant: true });
});

test("the steward stat names the owner, then the curator", () => {
  assert.deepEqual([...IPOR_STEWARD_ROLES], ["1", "200"]);
});

test("each census chain has a lowercased Fuse Whitelist", () => {
  for (const id of [1, 42161, 8453]) assert.match(IPOR_FUSE_WHITELIST[id], /^0x[0-9a-f]{40}$/);
});
