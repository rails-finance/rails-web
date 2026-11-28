// LinkedValue (ui-jobs 878, anatomy L14; components/shared/linked-value.tsx)
// rendered server-side: an explorer link's tooltip names the chain's explorer
// from lib/shared/chains.ts, a Rails link's names the page, and at rest the
// value is a plain link with the resting cue and no native title. The
// component is .tsx and imports through `@/`, so the render runs in tsx
// (linked-value.render.mjs). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { valuePress, spineAmountPress, followsInPlace } from "../../lib/shared/spine-amount-press.ts";

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

for (const [name, explorer, host] of [
  ["ethereum", "Etherscan", "https://etherscan.io"],
  ["base", "Basescan", "https://basescan.org"],
  ["arbitrum", "Arbiscan", "https://arbiscan.io"],
]) {
  test(`an explorer link names the chain's explorer and opens it: ${name}`, () => {
    assert.equal(r[name].tip, `View on ${explorer} ↗`);
    const href = `${host}/tx/0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060`;
    assert.equal(r[name].href, href, "the chain builds the href");
    const a = anchor(r[name].html);
    assert.ok(a.includes(`href="${href}"`));
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

test("every chain lib/shared/chains.ts names links its explorer", () => {
  const all = Object.entries(r.everyChain);
  assert.ok(all.length >= 7);
  for (const [id, c] of all) {
    assert.ok(c.host && c.name, `chain ${id} has an explorer`);
    assert.equal(c.href, `${c.host}/block/1`, `chain ${id}'s link opens its explorer`);
    assert.equal(c.tip, `View on ${c.name} ↗`);
  }
});

test("on a chain with no explorer in lib/shared/chains.ts the value renders plain, less its link classes, warning once", () => {
  for (const html of r.unknownChain.html) assert.equal(html, '<span class="font-mono text-xs">0x5c50…2060</span>');
  assert.deepEqual(r.unknownChain.warnings, [
    '[LinkedValue] no explorer for chain 137: "0x5c50…2060" renders unlinked',
  ]);
});

test("the plain form drops the link classes behind a variant prefix too", () => {
  assert.equal(r.unlinked, "font-mono dark:bg-sunken text-xs [@media(hover:none)]:underline");
});

test("a verify link elsewhere names its site from the URL's host, whatever the scheme's case", () => {
  assert.deepEqual(r.sites, {
    "https://github.com/liquity/bold": "github.com",
    "HTTPS://WWW.GitHub.com/liquity/bold": "github.com",
    "ipfs://bafybeigdyrzt/readme": "bafybeigdyrzt",
    "mailto:team@example.org": "mailto:team@example.org",
    "not a url": "not a url",
  });
});

test("hover opens and closes the tooltip for a mouse alone", () => {
  const src = readFileSync(path.join(REPO, "components/shared/linked-value.tsx"), "utf8");
  const guard = 'if (e.pointerType !== "mouse") return;';
  const enter = /onPointerEnter: \(e: React\.PointerEvent\) => \{\s*([^\n]*)/.exec(src);
  const leave = /const leaveHover = \(e: React\.PointerEvent\) => \{\s*([^\n]*)/.exec(src);
  assert.equal(enter?.[1], guard, "onPointerEnter opens for a mouse only");
  assert.equal(leave?.[1], guard, "onPointerLeave closes for a mouse only");
});

test("while the receipts inspector is armed, a press, Enter or Space on the value goes to the receipt around it", () => {
  const src = readFileSync(path.join(REPO, "components/shared/linked-value.tsx"), "utf8");
  const yields = /if \(e\.currentTarget\.closest\(PICKABLE_SELECTOR\)\) return;/;
  const click = /onClick: \(e: React\.MouseEvent<HTMLElement>\) => \{([\s\S]*?)e\.stopPropagation\(\);/.exec(src);
  assert.match(click?.[1] ?? "", yields, "the click");
  const key = /onKeyDown: \(e: React\.KeyboardEvent<HTMLElement>\) => \{([\s\S]*?)e\.stopPropagation\(\);/.exec(src);
  assert.match(key?.[1] ?? "", yields, "Enter and Space");
  assert.match(src, /import \{ PICKABLE_SELECTOR \} from "@\/lib\/shared\/tip-yields";/);
});

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

// LinkedValue's `onFollow` (ui-jobs 878): a Rails link that jumps in place.
const RAILS_AT_EE3AE3931 =
  '<span data-reveal-tip="" class="relative inline-flex cursor-pointer items-center "><a class="underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] rounded-sm [@media(hover:none)]:underline [@media(hover:none)]:decoration-dotted [@media(hover:none)]:decoration-1 [@media(hover:none)]:decoration-[var(--edge-row-line)] font-mono text-xs" aria-label="#123: Trove 123" data-anatomy="L14" data-trove-link="123" href="/ethereum/liquity-v2/trove/123">#123</a></span>';

test("a Rails link without onFollow renders as it did before onFollow came", () => {
  assert.equal(r.rails.html, RAILS_AT_EE3AE3931);
});

test("onFollow leaves the markup as it is, the href kept for a new tab", () => {
  assert.equal(r.railsFollow.html, r.rails.html);
});

const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
const jumps = (open, p, keys = plain) => followsInPlace(valuePress(open, { on: "value", ...p }), keys);

test("with onFollow, a touch or a pen opens the tooltip first and the second press jumps", () => {
  for (const pointer of ["touch", "pen"]) {
    const first = { pointer, hoverless: true, keyboard: false };
    assert.equal(jumps(false, first), false, `${pointer}: the first press does not call onFollow`);
    assert.deepEqual(valuePress(false, { on: "value", ...first }), { open: true, follow: false });
    assert.equal(jumps(true, first), true, `${pointer}: the second press calls onFollow`);
  }
});

test("with onFollow, a mouse click, Enter and the tooltip's link jump", () => {
  assert.equal(jumps(false, { pointer: "mouse", hoverless: false, keyboard: false }), true, "a mouse click");
  assert.equal(jumps(true, { pointer: "mouse", hoverless: false, keyboard: false }), true, "a click while hovering");
  for (const hoverless of [true, false])
    assert.equal(jumps(false, { hoverless, keyboard: true }), true, `Enter, hoverless ${hoverless}`);
  for (const open of [true, false])
    assert.equal(
      followsInPlace(valuePress(open, { on: "tip", hoverless: false, keyboard: false }), plain),
      true,
      "the tooltip's link",
    );
});

test("with onFollow, a cmd, ctrl, shift, alt or middle click goes to the browser", () => {
  const mouse = { pointer: "mouse", hoverless: false, keyboard: false };
  for (const keys of [
    { ...plain, metaKey: true },
    { ...plain, ctrlKey: true },
    { ...plain, shiftKey: true },
    { ...plain, altKey: true },
    { ...plain, button: 1 },
  ]) {
    assert.equal(jumps(false, mouse, keys), false, JSON.stringify(keys));
    assert.equal(followsInPlace({ follow: true }, keys), false, `the tooltip's link: ${JSON.stringify(keys)}`);
  }
  assert.equal(jumps(true, { pointer: "touch", hoverless: true, keyboard: false }, { ...plain, metaKey: true }), false);
});

test("onFollow's presses prevent the navigation, close the tooltip and start no progress bar", () => {
  const src = readFileSync(path.join(REPO, "components/shared/linked-value.tsx"), "utf8");
  const jump =
    /const jump = \(e: React\.MouseEvent, follow: FollowHandler\) => \{([\s\S]*?)\n  \};/.exec(src)?.[1] ?? "";
  assert.match(jump, /e\.preventDefault\(\);\s*follow\(e\);\s*setOpen\(false\);/);
  assert.doesNotMatch(jump, /startNavigationProgress/);
  assert.match(
    src,
    /if \(onFollow && followsInPlace\(press, e\)\) \{\s*jump\(e, onFollow\);\s*return;\s*\}\s*if \(!press\.follow\) e\.preventDefault\(\);/,
    "the value: the jump comes before the progress bar and returns",
  );
  const tip = /if \(onFollow\) \{([\s\S]*?)\n  \}/.exec(src)?.[1] ?? "";
  assert.match(
    tip,
    /tipLink\.onClick = \(e: React\.MouseEvent\) => \{\s*e\.stopPropagation\(\);\s*if \(followsInPlace\(\{ follow: true \}, e\)\) jump\(e, onFollow\);\s*\};/,
  );
  assert.doesNotMatch(tip, /startNavigationProgress/, "the tooltip's link");
});
