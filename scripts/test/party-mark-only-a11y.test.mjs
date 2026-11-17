// The event page's mark-only party chip (components/shared/event-card.tsx SentenceParty, PartyChip `markOnly` in
// components/shared/chain-truth-event.tsx; anatomy P4): no aria-hidden on an ancestor of the chip's Prov, which is a
// focusable button while the inspector is armed; aria-hidden only on the decorative children (the mark, the icon).
// A source check: the tests import no JSX.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
/** A function's body, from its declaration to the next top-level declaration. */
function body(text, name) {
  const at = text.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} is declared`);
  const rest = text.slice(at + 1);
  const end = rest.search(/\n(export )?(function|const|interface|type) /);
  return end < 0 ? rest : rest.slice(0, end);
}

test("SentenceParty puts no aria-hidden on the wrapper around the Prov", () => {
  const fn = body(src("components/shared/event-card.tsx"), "SentenceParty");
  assert.ok(fn.includes("<PartyChip"), "it draws the chip");
  assert.equal(
    /aria-hidden/.test(fn.replace(/\/\*[\s\S]*?\*\//g, "")),
    false,
    "no aria-hidden in SentenceParty's markup",
  );
});

test("PartyChip's aria-hidden sits on children inside the Prov, never on the Prov or around it", () => {
  const fn = body(src("components/shared/chain-truth-event.tsx"), "PartyChip");
  const open = fn.indexOf("<Prov");
  const close = fn.lastIndexOf("</Prov>");
  assert.ok(open >= 0 && close > open, "the chip is a Prov");
  const before = fn.slice(0, open);
  const prov = fn.slice(open, fn.indexOf(">", open) + 1);
  assert.equal(/aria-hidden/.test(before), false, "nothing hidden around the Prov");
  assert.equal(/aria-hidden/.test(prov), false, "the Prov itself is not hidden");
  const inside = fn.slice(open, close);
  assert.ok(
    (inside.match(/aria-hidden/g) ?? []).length >= 3,
    "the mark, the glyph or tile, and the icon are hidden in mark-only mode",
  );
});
