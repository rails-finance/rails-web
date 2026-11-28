// The spine's flank amount with and without `amountLink` (ui-jobs 872,
// components/shared/activity-timeline.tsx SpineVal): a family that passes no
// link renders the markup captured from the spine before the prop existed
// (scripts/fixtures/spine-amount-link/expected.json), and a link wraps the
// amount alone. The spine is .tsx and imports through `@/`, so the render
// runs in tsx (spine-amount-link.render.mjs). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const rendered = JSON.parse(
  execFileSync(
    process.execPath,
    [
      path.join(REPO, "node_modules/tsx/dist/cli.mjs"),
      "--tsconfig",
      "tsconfig.json",
      "scripts/test/spine-amount-link.render.mjs",
    ],
    { cwd: REPO, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  ),
);
const expected = JSON.parse(readFileSync(path.join(REPO, "scripts/fixtures/spine-amount-link/expected.json"), "utf8"));

for (const name of ["liquityAdjust", "aaveWithdraw", "touch"]) {
  test(`a spine with no amountLink renders as before the prop: ${name}`, () => {
    assert.equal(rendered[name], expected[name]);
  });
}

test("an amountLink wraps the amount alone, and the rest of the spine is unchanged", () => {
  const html = rendered.linked;
  const anchors = [...html.matchAll(/<a\b[^>]*>(.*?)<\/a>/g)];
  assert.equal(anchors.length, 1, "one link");
  const [whole, inner] = anchors[0];
  assert.equal(inner, "4.2K", "the link holds the figure and nothing else");
  assert.match(whole, /href="\/sepolia\/polaris\/reserve-loans\/28"/);
  assert.match(whole, /title="Went to reserve loan #28 →"/);
  assert.match(whole, /data-spine-amount-link="marked"/);
  assert.match(whole, /data-anatomy="L3.3"/);
  assert.match(whole, /aria-label="4.2K: Went to reserve loan #28"/, "the name reads the words without the arrow");
  assert.match(whole, /pointer-events-auto/, "a tap on the link opens the link");
  assert.match(
    html,
    /data-spine-node=""[^>]*class="relative z-10 max-sm:z-30 max-sm:pointer-events-none/,
    "its node stands above the phone toggle and passes other taps through",
  );
  // Put the plain figure back where the link stands: the spine is the
  // unlinked one, so nothing beside the amount moved.
  const plain = html
    .replace(
      /<span class="(justify-self-(?:end|start) p[rl]-5)"><a\b[^>]*>(.*?)<\/a><\/span>/,
      (_, side, txt) => `<span class="text-base font-semibold whitespace-nowrap ${side}">${txt}</span>`,
    )
    .replace(" max-sm:z-30 max-sm:pointer-events-none", "");
  assert.equal(plain, expected.liquityAdjust);
});

// Below 640px a node with a linked amount stands at max-sm:z-30 in the row's
// stacking context, and a wide node's ground reaches the number column at the
// row's left edge: the number and a group's range stand above it.
test("below 640px the number column and the group range stand above a linked node", () => {
  const read = (f) => readFileSync(path.join(REPO, f), "utf8");
  const node = Number(
    /data-spine-node[\s\S]*?max-sm:z-(\d+) max-sm:pointer-events-none/.exec(
      read("components/shared/spine-column.tsx"),
    )[1],
  );
  const num = Number(/spine-num absolute z-20 max-sm:z-(\d+)/.exec(read("components/shared/event-card.tsx"))?.[1]);
  assert.ok(num > node, `.spine-num max-sm:z-${num} is above the node's max-sm:z-${node}`);
  const css = read("app/globals.css");
  const phone = css.slice(css.indexOf("@media (max-width: 639.98px)", css.indexOf(".spine-row {")));
  const range = Number(/\.group-range \{\s*z-index: (\d+);/.exec(phone)?.[1]);
  assert.ok(range > node, `.group-range z-index ${range} is above the node's ${node} below 640px`);
});
