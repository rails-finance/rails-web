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
import { spineAmountPress } from "../../lib/shared/spine-amount-press.ts";

const OPEN_Z = " has-[[data-tip-open]]:z-50!";

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

test("an amountLink outside Rails draws the spine as before the prop: the spine links Rails pages only", () => {
  assert.equal(rendered.linkedExternal, expected.liquityAdjust);
});

test("an amountLink wraps the amount alone, and the rest of the spine is unchanged", () => {
  const html = rendered.linked;
  const anchors = [...html.matchAll(/<a\b[^>]*>(.*?)<\/a>/g)];
  assert.equal(anchors.length, 1, "one link");
  const [whole, inner] = anchors[0];
  assert.equal(inner, "4.2K", "the link holds the figure and nothing else");
  assert.match(whole, /href="\/sepolia\/polaris\/reserve-loans\/28"/);
  assert.doesNotMatch(whole, /\btitle=/, "the house tooltip names the destination, and no native title doubles it");
  assert.match(whole, /data-spine-amount-link="marked"/);
  assert.match(whole, /data-anatomy="L3.3"/);
  assert.match(whole, /aria-label="4.2K: Went to reserve loan #28"/, "the name reads the words without the arrow");
  assert.match(whole, /pointer-events-auto/, "a tap on the link opens the link");
  const cls = /class="([^"]*)"/.exec(whole)?.[1].split(" ") ?? [];
  for (const c of [
    "[@media(hover:none)]:underline",
    "[@media(hover:none)]:decoration-dotted",
    "[@media(hover:none)]:decoration-1",
    "[@media(hover:none)]:decoration-[var(--edge-row-line)]",
  ]) {
    assert.ok(cls.includes(c), `on a screen without hover the link rests on a dotted hairline underline: ${c}`);
  }
  assert.ok(
    cls
      .filter((c) => /underline|decoration/.test(c))
      .every((c) => /^(\[@media\(hover:none\)\]|hover|focus-visible):|^underline-offset-/.test(c)),
    "with hover the link has no underline at rest",
  );
  assert.match(
    html,
    /<span data-reveal-tip="" class="relative inline-flex cursor-pointer items-center "><a\b/,
    "the link stands in the house tooltip (RevealTip)",
  );
  assert.doesNotMatch(html, /role="tooltip"/, "the tooltip is closed at rest");
  assert.doesNotMatch(whole, /aria-expanded/, "before a press opens its tooltip the link is a plain link");
  assert.doesNotMatch(whole, /aria-describedby/, "a closed tooltip describes nothing");
  assert.doesNotMatch(whole, /data-tip-open/, "the node's raise is off at rest");
  assert.match(
    html,
    /data-spine-node=""[^>]*class="relative z-10 max-sm:z-30 max-sm:pointer-events-none/,
    "its node stands above the phone toggle and passes other taps through",
  );
  assert.ok(
    html.includes(`max-sm:pointer-events-none${OPEN_Z}`),
    "while the amount's tooltip is open its node stands above the other rows, the number column and a group's range",
  );
  // Put the plain figure back where the link stands: the spine is the
  // unlinked one, so nothing beside the amount moved.
  const plain = html
    .replace(
      /<span class="(justify-self-(?:end|start) p[rl]-5)"><span data-reveal-tip=""[^>]*><a\b[^>]*>(.*?)<\/a><\/span><\/span>/,
      (_, side, txt) => `<span class="text-base font-semibold whitespace-nowrap ${side}">${txt}</span>`,
    )
    .replace(` max-sm:z-30 max-sm:pointer-events-none${OPEN_Z}`, "");
  assert.equal(plain, expected.liquityAdjust);
});

// Below 640px a node with a linked amount stands at max-sm:z-30 in the row's
// stacking context, and a wide node's ground reaches the number column at the
// row's left edge: the number and a group's range stand above it and pass
// taps through, so a tap on an amount under them opens its link.
test("below 640px the number column and the group range stand above a linked node", () => {
  const read = (f) => readFileSync(path.join(REPO, f), "utf8");
  const node = Number(
    /rows\.some\(\(r\) => r\.amountLink && !r\.amountLink\.external\) \? " max-sm:z-(\d+) max-sm:pointer-events-none /.exec(
      read("components/shared/spine-column.tsx"),
    )?.[1],
  );
  assert.ok(node > 0, "the linked node's phone z-index is read from its class string");
  const numClass = /className=\{`spine-num ([^$`]*)/.exec(read("components/shared/event-card.tsx"))?.[1] ?? "";
  const num = Number(/max-sm:z-(\d+)/.exec(numClass)?.[1]);
  assert.ok(num > node, `.spine-num max-sm:z-${num} is above the node's max-sm:z-${node}`);
  assert.match(numClass, /max-sm:pointer-events-none/, ".spine-num passes taps through below 640px");
  const css = read("app/globals.css");
  const phone = css.slice(css.indexOf("@media (max-width: 639.98px)", css.indexOf(".spine-row {")));
  const range = Number(/\.group-range \{\s*z-index: (\d+);/.exec(phone)?.[1]);
  assert.ok(range > node, `.group-range z-index ${range} is above the node's ${node} below 640px`);
  assert.match(css, /\.group-range \{[^}]*pointer-events: none;/, ".group-range passes taps through");
  const open = Number(/has-\[\[data-tip-open\]\]:z-(\d+)!/.exec(read("components/shared/spine-column.tsx"))?.[1]);
  assert.ok(open > num && open > range, `an open tooltip's node, z-${open}, is above .spine-num and .group-range`);
});

// The click rules around the tooltips, read from the source: the repo has no
// DOM to dispatch a click in.
const src = (f) => readFileSync(path.join(REPO, f), "utf8");
test("a click in an interactive RevealTip's bubble stops there, and on its padding or arrow follows no link around it", () => {
  assert.match(
    src("components/shared/reveal-tip.tsx"),
    /if \(interactive && bubbleRef\.current\?\.contains\(e\.target as Node\)\) \{\s*const control = \(e\.target as Element\)\.closest\("a\[href\],button"\);\s*if \(!control \|\| !bubbleRef\.current\.contains\(control\)\) e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*return;\s*\}/,
  );
});
test("the links that stop their click start the progress bar", () => {
  const value = src("components/shared/linked-value.tsx");
  assert.match(
    value,
    /else if \(!external\) startNavigationProgressOnClick\(e, href\);/,
    "the linked value (the spine amount), when its press follows",
  );
  assert.match(
    value,
    /onClick: \(e: React\.MouseEvent\) => \{\s*e\.stopPropagation\(\);\s*if \(!external\) startNavigationProgressOnClick\(e, href\);/,
    "the link in its tooltip",
  );
  assert.match(
    src("components/shared/holder-label.tsx"),
    /onClick=\{\(e\) => startNavigationProgressOnClick\(e, href\)\}/,
    "the holder label's Open the vault page",
  );
  assert.match(
    src("components/nav/navigation-progress.tsx"),
    /if \(e\.button !== 0 \|\| e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey\) return;\s*startNavigationProgress\(href\);/,
    "a plain left click only",
  );
});
test("a touch that turns into a scroll leaves no pointer behind", () => {
  assert.match(
    src("components/shared/linked-value.tsx"),
    /onPointerCancel: \(\) => \{\s*pointer\.current = undefined;/,
  );
});
test("the link says whether its tooltip is open only once a press has opened it", () => {
  const spine = src("components/shared/linked-value.tsx");
  assert.match(spine, /"aria-expanded": discloses \? open : undefined,/);
  assert.match(spine, /if \(press\.open\) setDiscloses\(true\);/);
  assert.match(spine, /"data-tip-open": open \? "" : undefined,/);
});

// A press on the linked amount (lib/shared/spine-amount-press.ts): a touch or
// a pen opens the tooltip first and a second press follows the link; a mouse
// click and a keyboard Enter follow at once; with no pointer event seen, a
// screen without hover opens the tooltip first.
const tap = { pointer: "touch", hoverless: false, keyboard: false };
test("a first tap on the amount opens its tooltip and does not follow the link", () => {
  assert.deepEqual(spineAmountPress(false, { on: "amount", ...tap }), { open: true, follow: false });
  assert.deepEqual(spineAmountPress(false, { on: "amount", ...tap, pointer: "pen" }), { open: true, follow: false });
});
test("a second tap on the amount follows the link", () => {
  const first = spineAmountPress(false, { on: "amount", ...tap });
  assert.deepEqual(spineAmountPress(first.open, { on: "amount", ...tap }), { open: true, follow: true });
});
test("the link in the open tooltip follows it", () => {
  assert.equal(spineAmountPress(true, { on: "tip", ...tap }).follow, true);
});
test("a tap elsewhere closes the tooltip and follows nothing", () => {
  assert.deepEqual(spineAmountPress(true, { on: "outside", ...tap }), { open: false, follow: false });
});
test("a mouse click on the amount follows the link and opens no tooltip, on any screen", () => {
  for (const hoverless of [true, false])
    assert.deepEqual(spineAmountPress(false, { on: "amount", pointer: "mouse", hoverless, keyboard: false }), {
      open: false,
      follow: true,
    });
});
test("Enter on the amount follows the link, whatever pointer came before", () => {
  for (const pointer of [undefined, "touch", "mouse"])
    assert.deepEqual(spineAmountPress(false, { on: "amount", pointer, hoverless: true, keyboard: true }), {
      open: false,
      follow: true,
    });
});
test("with no pointer event (a screen reader's activation) the screen decides", () => {
  assert.deepEqual(spineAmountPress(false, { on: "amount", hoverless: true, keyboard: false }), {
    open: true,
    follow: false,
  });
  assert.deepEqual(spineAmountPress(false, { on: "amount", hoverless: false, keyboard: false }), {
    open: false,
    follow: true,
  });
});
