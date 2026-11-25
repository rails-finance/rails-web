// Every About page view names a section its explorer's menu has (rails-ops ui-jobs 790): `intro`,
// `positions` where the explorer has a position listing, or one of its sub-page segments. The
// roster (lib/shared/protocols.ts SPECS) and the pages are read as source, since a tested module
// imports nothing through `@/`. ProtocolInfoPage throws on a stray key outside production and moves
// the view into the intro in production; this is the check that runs before either.
//
// A file can draw several explorers (morpho-info.tsx draws Ethereum, Base and Arbitrum). Each key
// there must be in the menu of at least one session the file names, and where the file names one
// session, in that session's menu. The browser verifier (verify-about-sections) checks each page whole.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CHAIN_SLUG = { 1: "ethereum", 8453: "base", 42161: "arbitrum", 10: "optimism", 5042: "arc", 11155111: "sepolia" };

/** session → its menu keys, and "<chain>/<slug>" → session, from the roster's source. */
function rosterMenus() {
  const src = readFileSync("lib/shared/protocols.ts", "utf8");
  const start = src.indexOf("const SPECS: ProtocolSpec[] = [");
  const end = src.indexOf("\n];", start);
  assert.ok(start > 0 && end > start, "SPECS not found in lib/shared/protocols.ts");
  const menus = new Map();
  const routes = new Map();
  for (const spec of src
    .slice(start, end)
    .split(/\n  \{\n/)
    .slice(1)) {
    const session = spec.match(/^\s*session: "([^"]+)"/m)?.[1];
    if (!session) continue;
    const keys = new Set(["intro"]);
    if (!/^\s*positionListing: false,/m.test(spec)) keys.add("positions");
    for (const m of spec.matchAll(/segment: "([^"]+)"/g)) keys.add(m[1]);
    menus.set(session, keys);
    const chain = CHAIN_SLUG[spec.match(/^\s*chainId: (\d+)/m)?.[1]];
    const slug = spec.match(/^\s*slug: "([^"]+)"/m)?.[1];
    if (chain && slug) routes.set(`${chain}/${slug}`, session);
  }
  return { menus, routes };
}

function files(dir, keep, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, keep, out);
    else if (keep(p)) out.push(p);
  }
  return out;
}

test("every About view names a section in its explorer's menu", () => {
  const { menus, routes } = rosterMenus();
  assert.ok(menus.size > 40, `read ${menus.size} roster entries`);
  const routePages = files("app", (p) => /[\\/]info[\\/]page\.tsx$/.test(p));
  const components = [
    ...files("components/protocol", (p) => /info(-page)?\.tsx$/.test(p)),
    // The vault layers' About pages (ui-jobs 791).
    ...files("components/vaults", (p) => /(-info|-routes)\.tsx$/.test(p)),
  ];
  // The sessions each file draws: a route page its own (by its chain and slug), a shared
  // component every route page importing it.
  const drawn = new Map();
  for (const p of routePages) {
    // An explorer's /info, or its vault layer's /vaults/info (ui-jobs 791).
    const m = p.match(
      /app[\\/]\(app\)[\\/]([^\\/]+)[\\/]([^\\/]+)[\\/](?:vaults[\\/]\(views\)[\\/])?info[\\/]page\.tsx$/,
    );
    const session = m && routes.get(`${m[1]}/${m[2]}`);
    if (!session) continue;
    drawn.set(p, new Set([session]));
    for (const imp of readFileSync(p, "utf8").matchAll(/from "@\/(components\/(?:protocol|vaults)\/[^"]+)"/g)) {
      const c = components.find((f) => f.replace(/\\/g, "/") === `${imp[1]}.tsx`);
      if (c) drawn.set(c, new Set([...(drawn.get(c) ?? []), session]));
    }
  }
  const pages = [...routePages, ...components];
  let checked = 0;
  for (const p of pages) {
    const src = readFileSync(p, "utf8");
    const keys = [...src.matchAll(/\bsection: "([^"]+)"/g)].map((m) => m[1]);
    if (keys.length === 0) continue;
    const sessions = [...(drawn.get(p) ?? [])];
    assert.ok(sessions.length > 0, `${p}: names sections but no roster session`);
    // A vault layer with its own menu (`layer={{ … menu }}`, ui-jobs 791) names its
    // sections by the `key`s that menu lists, in place of the explorer's.
    const layerKeys = /\blayer=\{\{[^}]*\bmenu\b/.test(src)
      ? new Set([...src.matchAll(/\bkey: "([^"]+)", label:/g)].map((m) => m[1]))
      : null;
    for (const key of keys) {
      if (layerKeys) {
        assert.ok(layerKeys.has(key), `${p}: section "${key}" is in no key of the layer's menu`);
        checked++;
        continue;
      }
      const owners = sessions.filter((s) => menus.get(s).has(key));
      assert.ok(owners.length > 0, `${p}: section "${key}" is in no menu of ${sessions.join(", ")}`);
      checked++;
    }
  }
  assert.ok(checked > 100, `checked ${checked} sections`);
});
