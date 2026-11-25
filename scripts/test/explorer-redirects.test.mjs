// The roster's `redirects` and `noInfoPage` (lib/shared/protocols.ts), against the page files: the
// sitemap and llms.txt leave out a route or /info page on these flags, so a flag that drifts from its
// page lists a redirect for a crawler or drops a page that serves (ui-jobs 578). The roster imports
// through `@/`, so this file resolves `@/` and extensionless paths as chain-launch.test.mjs does.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = pathToFileURL(REPO + "/").href;
const hook = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = ${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  let url = null;
  if (spec.startsWith("@/")) url = ROOT + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) url = new URL(spec, ctx.parentURL).href;
  if (url) {
    if (!/\\.[a-z]+$/.test(url)) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        if (existsSync(fileURLToPath(url + ext))) { url += ext; break; }
      }
    }
    return next(url, ctx);
  }
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));
const { existsSync: exists } = await import("node:fs");
const { PROTOCOLS } = await import("../../lib/shared/protocols.ts");

/** The page file serving `href`: the route's own page, or a route group's `(views)` page. */
function pageFile(href) {
  const dir = path.join(REPO, "app", "(app)", href);
  return [path.join(dir, "page.tsx"), path.join(dir, "(views)", "page.tsx")].find((f) => exists(f)) ?? null;
}
const redirects = (file) => /\bredirect\(/.test(readFileSync(file, "utf8"));

test("every explorer's route serves, and redirects exactly where the roster says", () => {
  for (const p of PROTOCOLS) {
    const f = pageFile(p.href);
    assert.ok(f, `${p.id}: no page for ${p.href}`);
    assert.equal(redirects(f), !!p.redirects?.includes("route"), `${p.id}: ${p.href} redirect flag`);
  }
});

test("every /info page exists unless the roster says none, and redirects exactly where it says", () => {
  for (const p of PROTOCOLS) {
    const f = pageFile(p.infoHref);
    assert.equal(!f, !!p.noInfoPage, `${p.id}: ${p.infoHref} ${f ? "exists" : "missing"}`);
    if (f) assert.equal(redirects(f), !!p.redirects?.includes("info"), `${p.id}: ${p.infoHref} redirect flag`);
  }
});
