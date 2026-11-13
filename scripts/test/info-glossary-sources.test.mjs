// Every info page's glossary term carries at least one source, a docs link or the contract that
// names it (rails-ops standards/info-page-template.md, glossary; ui-jobs 647). The type in
// components/shared/protocol-info-page.tsx refuses an empty list; this reads the pages' source for
// an empty one, which a cast could slip past.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function infoPages(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) infoPages(p, out);
    else if (name === "page.tsx" && /[\\/]info[\\/]page\.tsx$/.test(p)) out.push(p);
  }
  return out;
}

test("no glossary term on an info page has an empty source list", () => {
  const pages = infoPages("app");
  assert.ok(pages.length > 10, `found ${pages.length} info pages`);
  const empty = pages.filter((p) => /\bsources:\s*\[\s*\]/.test(readFileSync(p, "utf8")));
  assert.deepEqual(empty, []);
});

test("a contract source names what carries the word", () => {
  const velo = readFileSync("app/(app)/optimism/velodrome/info/page.tsx", "utf8");
  assert.match(velo, /kind: "contract"/);
  assert.match(velo, /carries: .*Slipstream Position NFT v1\.2/);
});
