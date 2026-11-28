// The kind ring (components/shared/token-kind-ring.tsx). Pendle's PT and YT
// render the markup captured from origin/preview (a82f7245a) before ui-jobs 871
// added the Polaris kinds (scripts/fixtures/kind-rings/expected.json); the
// token chip's plain and PT-stamp cases render the markup of b14ec95e2
// (chips.json); and fpETH, vpETH and svpETH draw pETH's mark in their ring at
// every size, 1px wide below 20px, with a tooltip naming the token. svpETH's
// disc draws its lock from 28px. The icons are .tsx and import through `@/`,
// so the render runs in tsx (kind-rings.render.mjs).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { pendle, chips, polaris, pethAddress } = JSON.parse(
  execFileSync(
    process.execPath,
    [
      path.join(REPO, "node_modules/tsx/dist/cli.mjs"),
      "--tsconfig",
      "tsconfig.json",
      "scripts/test/kind-rings.render.mjs",
    ],
    { cwd: REPO, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  ),
);
const fixture = (name) => JSON.parse(readFileSync(path.join(REPO, "scripts/fixtures/kind-rings", name), "utf8"));
const expected = fixture("expected.json");
const expectedChips = fixture("chips.json");

test("the fixture covers every Pendle case and a ring at each size from 20px", () => {
  assert.deepEqual(Object.keys(pendle).sort(), Object.keys(expected).sort());
  assert.equal(Object.values(expected).filter((html) => html.includes("data-kind-ring")).length, 10);
});

for (const name of Object.keys(expected)) {
  test(`Pendle markup is unchanged: ${name}`, () => {
    assert.equal(pendle[name], expected[name]);
  });
}

test("the chip fixture covers a plain chip and a PT stamp at each size", () => {
  assert.deepEqual(Object.keys(chips).sort(), Object.keys(expectedChips).sort());
  for (const html of Object.values(expectedChips)) assert.ok(!html.includes("data-kind-ring"));
  assert.ok(expectedChips["pt-stamp-chip-28"].includes(">PT</span></span>"), "the PT stamp");
});

for (const name of Object.keys(expectedChips)) {
  test(`token chip markup is unchanged: ${name}`, () => {
    assert.equal(chips[name], expectedChips[name]);
  });
}

const TIPS = {
  fpETH: "fpETH, the floor part of pETH",
  vpETH: "vpETH, the part of pETH above the floor",
  svpETH: "svpETH, staked vpETH",
};
const RING = { fpETH: "fpeth", vpETH: "vpeth", svpETH: "svpeth" };
const RING_COLOUR = {
  fpETH: 'border-rb-500"',
  vpETH: "border-purple-600 dark:border-purple-400",
  svpETH: "border-purple-600 dark:border-purple-400",
};
// The ring's width and the mark inside it: 1px and 1px of ground below 20px,
// 2px and 1px at 20 and 28.
const RING_WIDTH = { 14: 1, 16: 1, 20: 2, 28: 2 };

for (const symbol of Object.keys(TIPS))
  for (const size of [14, 16, 20, 28])
    for (const suffix of ["", "-symbol-only"]) {
      const name = `${symbol}-${size}${suffix}`;
      test(`${name}: pETH's mark in its ring, named in the tooltip`, () => {
        const html = polaris[name];
        assert.ok(html.includes(`src="/icons/tokens/${pethAddress}.png"`), "pETH's mark");
        assert.ok(html.includes(`alt="${symbol}"`), "the image names the token");
        assert.ok(html.includes(`title="${TIPS[symbol]}"`), "the tooltip names the token");
        assert.ok(!html.includes('role="img"'), "no letter glyph");
        const w = RING_WIDTH[size];
        assert.ok(html.includes(`data-kind-ring="${RING[symbol]}"`), "the ring");
        assert.ok(html.includes(RING_COLOUR[symbol]), "the ring's colour");
        assert.ok(html.includes(`border-width:${w}px`), "the ring's width");
        assert.ok(html.includes(`width="${size - 2 * (w + 1)}"`), "the mark inside the ring");
        // Below 20px the icon may narrow in a tight row; from 20px it holds.
        assert.equal(html.includes("min-w-0 shrink items-center sm:shrink-0"), size < 20, "the icon's shrink");
        assert.equal(html.includes("data-staked-mark"), symbol === "svpETH", "svpETH's staked disc");
        assert.equal(html.includes("lucide-lock"), symbol === "svpETH" && size >= 28, "the lock from 28px");
      });
    }

test("pETH keeps its bare mark", () => {
  for (const size of [14, 16, 20, 28]) assert.ok(!polaris[`pETH-${size}`].includes("data-kind-ring"));
});

test("a bare fpETH symbol off the Polaris chain is not taken for Polaris's", () => {
  assert.ok(!polaris["fpETH-symbol-off-sepolia"].includes("data-kind-ring"));
});

test("a Polaris spine row wears the ring through the token chip", () => {
  assert.ok(polaris.spine.includes('data-kind-ring="svpeth"'));
});
