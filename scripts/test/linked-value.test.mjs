// LinkedValue (ui-jobs 878, anatomy L14; components/shared/linked-value.tsx)
// rendered server-side: an explorer link's tooltip names the chain's explorer
// from lib/shared/chains.ts, a Rails link's names the page, and at rest the
// value is a plain link with the resting cue and no native title. The
// component is .tsx and imports through `@/`, so the render runs in tsx
// (linked-value.render.mjs). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { valuePress, spineAmountPress } from "../../lib/shared/spine-amount-press.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const r = JSON.parse(
  execFileSync(
    process.execPath,
    [
      path.join(REPO, "node_modules/tsx/dist/cli.mjs"),
      "--tsconfig",
      "tsconfig.json",
      "scripts/test/linked-value.render.mjs",
    ],
    { cwd: REPO, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  ),
);
const anchor = (html) => {
  const all = [...html.matchAll(/<a\b[^>]*>/g)];
  assert.equal(all.length, 1, "one link");
  return all[0][0];
};

for (const [name, explorer] of [
  ["ethereum", "Etherscan"],
  ["base", "Basescan"],
  ["arbitrum", "Arbiscan"],
]) {
  test(`an explorer link names the chain's explorer: ${name}`, () => {
    assert.equal(r[name].tip, `View on ${explorer} ↗`);
    const a = anchor(r[name].html);
    assert.match(
      a,
      new RegExp(`aria-label="0x5c50…2060: View on ${explorer}"`),
      "the name reads the words without the arrow",
    );
    assert.match(a, /target="_blank"/);
    assert.match(a, /rel="noopener"/);
    assert.match(a, /data-anatomy="L14"/);
  });
}

test("an explorer link's name reads the context line, then the link's words", () => {
  assert.equal(r.context.tip, "View on Etherscan ↗");
  assert.match(
    anchor(r.context.html),
    /aria-label="4.2K pETH: Went to the Curve pETH\/fpETH\/vpETH pool, View on Etherscan"/,
  );
});

test("a Rails link names the page and keeps the caller's hooks", () => {
  assert.equal(r.rails.tip, "Trove 123 →");
  const a = anchor(r.rails.html);
  assert.match(a, /href="\/ethereum\/liquity-v2\/trove\/123"/);
  assert.match(a, /aria-label="#123: Trove 123"/);
  assert.match(a, /data-trove-link="123"/);
  assert.doesNotMatch(a, /target=/, "a Rails page opens in the same tab");
  assert.match(r.rails.html, /<a\b[^>]*>#123<\/a>/, "the link holds the value and nothing else");
  const cls = /class="([^"]*)"/.exec(a)?.[1].split(" ") ?? [];
  assert.ok(cls.includes("font-mono") && cls.includes("text-xs"), "the caller's classes follow the cue");
});

for (const name of ["ethereum", "rails"]) {
  test(`at rest the value is a plain link with the resting cue: ${name}`, () => {
    const html = r[name].html;
    const a = anchor(html);
    const cls = /class="([^"]*)"/.exec(a)?.[1].split(" ") ?? [];
    for (const c of [
      "[@media(hover:none)]:underline",
      "[@media(hover:none)]:decoration-dotted",
      "[@media(hover:none)]:decoration-1",
      "[@media(hover:none)]:decoration-[var(--edge-row-line)]",
      "hover:underline",
      "focus-visible:underline",
    ]) {
      assert.ok(cls.includes(c), c);
    }
    assert.ok(
      cls
        .filter((c) => /underline|decoration/.test(c))
        .every((c) => /^(\[@media\(hover:none\)\]|hover|focus-visible):|^underline-offset-/.test(c)),
      "with hover the link has no underline at rest",
    );
    assert.match(html, /^<span data-reveal-tip=""[^>]*><a\b/, "the link stands in the house tooltip (RevealTip)");
    assert.doesNotMatch(html, /role="tooltip"/, "the tooltip is closed at rest");
    assert.doesNotMatch(a, /aria-expanded/);
    assert.doesNotMatch(a, /aria-describedby/);
    assert.doesNotMatch(a, /data-tip-open/);
    assert.doesNotMatch(html, /\btitle=/, "no native title beside the house tooltip");
  });
}

test("872's spineAmountPress is valuePress, and a value press reads as an amount press", () => {
  for (const pointer of ["touch", "pen", "mouse", undefined])
    for (const hoverless of [true, false])
      for (const keyboard of [true, false])
        for (const open of [true, false]) {
          const p = { pointer, hoverless, keyboard };
          assert.deepEqual(valuePress(open, { on: "value", ...p }), spineAmountPress(open, { on: "amount", ...p }));
        }
});
