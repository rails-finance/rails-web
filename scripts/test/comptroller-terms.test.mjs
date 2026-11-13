// Compound V2 and Moonwell in their docs' words (rails-ops ui-jobs 631 and 632). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("a pause leaves repaying and withdrawing running, and says nothing of liquidating", () => {
  for (const f of ["lib/comptroller/product.tsx", "lib/comptroller/markets-provenance.ts"]) {
    const src = read(f);
    assert.doesNotMatch(src, /liquidating still run/, f);
    assert.match(src, /[Rr]epaying and withdrawing still run/, f);
  }
  assert.doesNotMatch(read("lib/comptroller/product.tsx"), /pause guardian has stopped/);
});

test("neither export says an unentered market can't be seized", () => {
  for (const f of ["lib/compound-v2/position-to-markdown.ts", "lib/moonwell/position-to-markdown.ts"])
    assert.doesNotMatch(read(f), /can't be seized/, f);
});

test("no health factor where the docs name none", () => {
  const cv2 = read("content/compound-v2/event-prose.yaml");
  assert.doesNotMatch(cv2, /health factor/i);
  const mw = read("content/moonwell/event-prose.yaml");
  assert.doesNotMatch(mw, /health factor/i);
  assert.match(mw, /Credit remaining/);
  assert.doesNotMatch(
    read("components/protocol/moonwell/moonwell-risk-slot.tsx"),
    /"Health factor"|Debt against the liquidation line/,
  );
});

test("Moonwell's liquidation modal states no 7% / 3% split the chain does not show", () => {
  const mw = read("content/moonwell/event-prose.yaml");
  assert.doesNotMatch(mw, /7% for the liquidator/);
  assert.match(mw, /1\.10× the repaid debt/);
});
