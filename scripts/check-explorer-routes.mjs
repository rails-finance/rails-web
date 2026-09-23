/**
 * Static gate: the roster, the route tree and the legacy redirect table agree
 * about where every explorer lives.
 *
 * An explorer's path is now `/<chain-slug>/<protocol-slug>` and it is written
 * down in exactly one place — the `slug` and `chainId` on its roster entry
 * (rails-ops `decisions/0016-path-scoped-chain-routes.md`). Two other things
 * have to follow it and neither can be derived at runtime:
 *
 *   • the route directory `app/(app)/<chain-slug>/<protocol-slug>/`, because
 *     Next routes off the filesystem, not off the roster;
 *   • `LEGACY_EXPLORER_PATHS` in next.config.ts, because config is loaded
 *     outside the app's module graph and cannot import the roster.
 *
 * Neither drift is visible on a rendered page. A roster entry pointing at a
 * directory that doesn't exist gives a 404 only when someone clicks it, and a
 * missing redirect only fails for a visitor arriving on an old link — which is
 * to say, never for whoever made the change. So it is checked here.
 *
 *   node scripts/check-explorer-routes.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = path.join(ROOT, "app", "(app)");

/** Chain id → URL slug, read from lib/shared/chains.ts rather than restated. */
function readChainSlugs() {
  const src = fs.readFileSync(path.join(ROOT, "lib", "shared", "chains.ts"), "utf8");
  const body = src.slice(src.indexOf("export const CHAINS"));
  const slugs = new Map();
  for (const m of body.matchAll(/^ {2}(\d+): \{[\s\S]*?slug: "([^"]+)"/gm)) {
    slugs.set(Number(m[1]), m[2]);
  }
  return slugs;
}

/** The roster's (id, chainId, slug) triples, read from the source of truth. */
function readRoster() {
  const src = fs.readFileSync(path.join(ROOT, "lib", "shared", "protocols.ts"), "utf8");
  const body = src.slice(src.indexOf("const SPECS"), src.indexOf("const SEEN"));
  const entries = [];
  for (const m of body.matchAll(/id: "([^"]+)",[\s\S]*?chainId: (\d+),[\s\S]*?slug: "([^"]+)",/g)) {
    entries.push({ id: m[1], chainId: Number(m[2]), slug: m[3] });
  }
  return entries;
}

/** The legacy → current pairs next.config.ts redirects on. */
function readLegacyTable() {
  const src = fs.readFileSync(path.join(ROOT, "next.config.ts"), "utf8");
  const body = src.slice(src.indexOf("const LEGACY_EXPLORER_PATHS"), src.indexOf("const nextConfig"));
  return [...body.matchAll(/\["([^"]+)", "([^"]+)"\]/g)].map((m) => ({ from: m[1], to: m[2] }));
}

/**
 * Does this route directory serve a page at its own path? A `page.tsx` sitting
 * in a route group one level down — `liquity-v2/(views)/page.tsx` — serves
 * exactly the same href, because a `(group)` adds no URL segment. Explorers
 * move their listing into one so the listing's `loading.tsx` stops wrapping the
 * protocol's detail routes in Suspense, which was pinning a missing position's
 * response status at 200. Reading only the top level would report that move as
 * a missing route.
 */
function servesPage(dir) {
  if (fs.existsSync(path.join(dir, "page.tsx"))) return true;
  if (!fs.existsSync(dir)) return false;
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .some((e) => e.isDirectory() && e.name.startsWith("(") && fs.existsSync(path.join(dir, e.name, "page.tsx")));
}

const chainSlugs = readChainSlugs();
const roster = readRoster();
const legacy = readLegacyTable();

let failures = 0;
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  failures += 1;
};

if (roster.length === 0) fail("read no roster entries out of lib/shared/protocols.ts — has its shape changed?");

const expected = new Map();
for (const entry of roster) {
  const chainSlug = chainSlugs.get(entry.chainId);
  if (!chainSlug) {
    fail(`roster entry "${entry.id}" is on chain ${entry.chainId}, which lib/shared/chains.ts does not name`);
    continue;
  }
  const href = `/${chainSlug}/${entry.slug}`;
  expected.set(href, entry);

  // 1. The route directory exists, and holds a page.
  const dir = path.join(APP_DIR, chainSlug, entry.slug);
  if (!servesPage(dir)) {
    fail(
      `roster entry "${entry.id}" routes to ${href}, but no page.tsx serves it — neither app/(app)/${chainSlug}/${entry.slug}/page.tsx nor one in a route group beneath it`,
    );
  }

  // 2. Something redirects the old path here. An explorer that never had a
  //    pre-0016 path is exempt — it is named, so adding one is deliberate.
  if (!legacy.some((row) => row.to === href)) {
    fail(`nothing in LEGACY_EXPLORER_PATHS forwards to ${href} — an old bookmark for "${entry.id}" 404s`);
  }
}

// 2b. No Suspense boundary sits above a dynamic route.
//
//     A `loading.tsx` is a Suspense boundary over its whole subtree, and once
//     one flushes its shell the response status is fixed at 200 — so a
//     `notFound()` in any `[param]` page beneath it runs too late and a missing
//     position answers 200 with a not-found body. Nothing on the rendered page
//     shows it, and no test that only reads markup catches it, which is why it
//     is checked here rather than left to review.
//
//     The shape that satisfies this: the listing and the sibling views that
//     want the skeleton live in a `(views)` route group (which adds no URL
//     segment, so nothing moves for a visitor) and the detail routes sit
//     outside it. Adding a `loading.tsx` back at an explorer root, or dragging
//     a `[param]` directory into a `(views)` group, reopens the hole.
function routeDirs(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    if (!fs.existsSync(d)) continue;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const p = path.join(d, e.name);
      out.push(p);
      stack.push(p);
    }
  }
  return out;
}
function servesAnyPage(dir) {
  if (fs.existsSync(path.join(dir, "page.tsx"))) return true;
  return routeDirs(dir).some((d) => fs.existsSync(path.join(d, "page.tsx")));
}
/** Every `[param]` page anywhere beneath `dir`. An inner boundary does not
 *  rescue it — the OUTERMOST one flushes first, and that is the flush that
 *  fixes the status. */
function dynamicPagesUnder(dir) {
  return routeDirs(dir)
    .filter((d) => fs.existsSync(path.join(d, "page.tsx")))
    .filter((d) =>
      path
        .relative(dir, d)
        .split(path.sep)
        .some((seg) => seg.startsWith("[")),
    );
}
for (const dir of [APP_DIR, ...routeDirs(APP_DIR)]) {
  if (!fs.existsSync(path.join(dir, "loading.tsx"))) continue;
  const shadowed = dynamicPagesUnder(dir);
  if (shadowed.length === 0) continue;
  fail(
    `${path.relative(ROOT, path.join(dir, "loading.tsx"))} is a Suspense boundary over ` +
      shadowed.map((d) => path.relative(dir, d)).join(", ") +
      ` — its shell flushes first, so a notFound() there answers 200. Move the loading.tsx (with the page that ` +
      `wants it) into a (views) route group and leave the dynamic segments outside.`,
  );
}

// 3. No orphan route directories: every explorer directory under a chain
//    segment belongs to a roster entry. This is the half that catches a MOVED
//    explorer whose roster entry was left behind.
//
//    NOTHING IS EXEMPT ANY MORE. A chain's Vaults section used to be — a vault
//    was a fund factsheet rather than an explorer, so `/<chain>/vaults` had a
//    route directory and no roster row, and the allowance was read out of
//    lib/shared/vault-directories.ts. rails-ops decision 0028 put every vault
//    under the protocol whose factory deployed it, so every vault surface is
//    now inside an explorer's own directory and the registry is deleted. A
//    `/<chain>/vaults` directory appearing again is an orphan, which is what
//    this check should say about it.
for (const chainSlug of chainSlugs.values()) {
  const chainDir = path.join(APP_DIR, chainSlug);
  if (!fs.existsSync(chainDir)) continue;
  for (const dirent of fs.readdirSync(chainDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const href = `/${chainSlug}/${dirent.name}`;
    if (!expected.has(href)) {
      fail(
        `app/(app)/${chainSlug}/${dirent.name}/ has no roster entry — nothing links to it and /coverage does not count it`,
      );
    }
  }
}

// 4. No redirect points somewhere that isn't an explorer.
for (const row of legacy) {
  if (!expected.has(row.to)) {
    fail(`LEGACY_EXPLORER_PATHS sends ${row.from} to ${row.to}, which is not any explorer's route`);
  }
}

if (failures > 0) {
  console.error(`\ncheck:routes — ${failures} problem${failures === 1 ? "" : "s"}.`);
  process.exit(1);
}
console.log(`check:routes — ${roster.length} explorers: route directory, roster entry and legacy redirect all agree.`);
