// The kind ring (components/shared/token-kind-ring.tsx). Pendle's PT and YT
// render the markup captured from origin/preview (a82f7245a) before ui-jobs 871
// added the Polaris kinds (scripts/fixtures/kind-rings/expected.json), and
// fpETH, vpETH and svpETH draw pETH's mark: in their ring from 20px, bare
// below, with a tooltip naming the token at every size. The icons are .tsx
// and import through `@/`, so the render runs in tsx (kind-rings.render.mjs).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { pendle, polaris, pethAddress } = JSON.parse(
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
const expected = JSON.parse(readFileSync(path.join(REPO, "scripts/fixtures/kind-rings/expected.json"), "utf8"));

test("the fixture covers every Pendle case and a ring at each size from 20px", () => {
  assert.deepEqual(Object.keys(pendle).sort(), Object.keys(expected).sort());
  assert.equal(Object.values(expected).filter((html) => html.includes("data-kind-ring")).length, 10);
});

for (const name of Object.keys(expected)) {
  test(`Pendle markup is unchanged: ${name}`, () => {
    assert.equal(pendle[name], expected[name]);
  });
}

const TIPS = {
  fpETH: "fpETH, the floor part of pETH",
  vpETH: "vpETH, the part of pETH above the floor",
  svpETH: "svpETH, staked vpETH",
};
const RING = { fpETH: "fpeth", vpETH: "vpeth", svpETH: "svpeth" };

for (const symbol of Object.keys(TIPS))
  for (const size of [16, 20, 28])
    for (const suffix of ["", "-symbol-only"]) {
      const name = `${symbol}-${size}${suffix}`;
      test(`${name}: pETH's mark, named in the tooltip, ringed from 20px`, () => {
        const html = polaris[name];
        assert.ok(html.includes(`src="/icons/tokens/${pethAddress}.png"`), "pETH's mark");
        assert.ok(html.includes(`alt="${symbol}"`), "the image names the token");
        assert.ok(html.includes(`title="${TIPS[symbol]}"`), "the tooltip names the token");
        assert.ok(!html.includes('role="img"'), "no letter glyph");
        if (size >= 20) {
          assert.ok(html.includes(`data-kind-ring="${RING[symbol]}"`), "the ring");
          assert.ok(html.includes(`width="${size - 6}"`), "the mark inside the ring");
        } else {
          assert.ok(!html.includes("data-kind-ring"), "no ring below 20px");
          assert.ok(html.includes(`width="${size}"`), "the bare mark at full size");
        }
        assert.equal(html.includes("data-staked-mark"), symbol === "svpETH" && size >= 20, "svpETH's staked mark");
      });
    }

test("pETH keeps its bare mark", () => {
  for (const size of [16, 20, 28]) assert.ok(!polaris[`pETH-${size}`].includes("data-kind-ring"));
});

test("a bare fpETH symbol off the Polaris chain is not taken for Polaris's", () => {
  assert.ok(!polaris["fpETH-symbol-off-sepolia"].includes("data-kind-ring"));
});

test("a Polaris spine row wears the ring through the token chip", () => {
  assert.ok(polaris.spine.includes('data-kind-ring="svpeth"'));
});
