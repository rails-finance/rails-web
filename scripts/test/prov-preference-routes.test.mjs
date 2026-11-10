// The standing inspector's route allow-list (lib/shared/prov-preference-routes.ts;
// rails-ops decision 0062 point 6, ui-jobs 571): every entry is a route app/
// serves, and a template matches only the route that served the path.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PROV_PREFERENCE_ROUTES, provPreferenceAllows, routeMatches } from "../../lib/shared/prov-preference-routes.ts";

/** Every page.tsx under app/, as a template without route groups. */
function appTemplates(dir = "app", at = []) {
  const out = new Set();
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name.startsWith("@") || name.startsWith("_")) continue;
      const next = /^\(.+\)$/.test(name) ? at : [...at, name];
      for (const t of appTemplates(p, next)) out.add(t);
    } else if (/^page\.(tsx|ts|jsx|js)$/.test(name)) out.add("/" + at.join("/"));
  }
  return out;
}

test("every allow-listed route is a page app/ serves", () => {
  const served = appTemplates();
  for (const t of PROV_PREFERENCE_ROUTES) assert.ok(served.has(t), `${t} is not an app/ route`);
});

test("no route is listed twice", () => {
  assert.equal(new Set(PROV_PREFERENCE_ROUTES).size, PROV_PREFERENCE_ROUTES.length);
});

test("a dynamic segment matches only the param the route served", () => {
  assert.ok(routeMatches("/base/morpho/vaults/[vault]", "/base/morpho/vaults/0xabc", { vault: "0xabc" }));
  // The static sibling serves no `vault` param.
  assert.ok(!routeMatches("/base/morpho/vaults/[vault]", "/base/morpho/vaults/info", {}));
  assert.ok(!routeMatches("/base/morpho/vaults/[vault]", "/base/morpho/vaults/0xabc/0xdef", { vault: "0xabc" }));
  assert.ok(routeMatches("/", "/", {}));
  assert.ok(!routeMatches("/", "/vaults", {}));
  assert.ok(routeMatches("/vaults", "/vaults", {}));
  assert.ok(routeMatches("/x/[a]", "/x/a%20b", { a: "a b" }));
});

test("catch-all segments", () => {
  assert.ok(routeMatches("/start/[[...path]]", "/start", {}));
  assert.ok(routeMatches("/start/[[...path]]", "/start/a/b", { path: ["a", "b"] }));
  assert.ok(!routeMatches("/start/[...path]", "/start", {}));
});

test("the allow-list reads", () => {
  assert.ok(provPreferenceAllows("/vaults", {}));
  assert.ok(provPreferenceAllows("/ethereum/yearn/vaults", {}));
  assert.ok(!provPreferenceAllows("/vaults/compare", {}));
  assert.ok(!provPreferenceAllows("/ethereum/aave/vaults/info", {}));
  assert.ok(!provPreferenceAllows(null, {}));
});
