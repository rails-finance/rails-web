// Every info page's glossary term carries at least one source, a docs link or the contract that
// names it (rails-ops standards/info-page-template.md, glossary; ui-jobs 647). The type in
// components/shared/protocol-info-page.tsx refuses an empty list; this reads the pages' source for
// an empty one, which a cast could slip past; and the glossaries the event-prose files build
// (lib/<family>/event-templates.ts spreads `[first, ...rest]`, which over an empty list is `[undefined]`).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const { parseContent } = createRequire(import.meta.url)("../yaml-loader.cjs");

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

/** The families whose info glossary is built from content/<family>/event-prose.yaml. */
const PROSE_GLOSSARIES = ["spark", "moonwell", "liquity-v1", "aave-v3", "aave-v4", "frankencoin"];

test("every glossary term an event-prose file builds has a source that resolves", () => {
  const bad = [];
  for (const family of PROSE_GLOSSARIES) {
    const file = parseContent(readFileSync(`content/${family}/event-prose.yaml`, "utf8"));
    const terms = file.glossary ?? [];
    assert.ok(terms.length > 0, `${family}: no glossary`);
    for (const t of terms) {
      const sources = Array.isArray(t.sources) ? t.sources : [];
      const resolves = (l) =>
        l != null &&
        (typeof l.url === "string" ||
          ("doc" in l && file.doc_urls?.[l.doc] !== undefined) ||
          // A faq id resolves through a table the template passes in, not the file: present is all this can check.
          ("faq" in l && typeof l.faq === "string"));
      if (sources.length === 0 || !sources.every(resolves)) bad.push(`${family}: ${String(t.bold).trim()}`);
    }
  }
  assert.deepEqual(bad, []);
});
