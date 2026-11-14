// The class modal's words (rails-ops ui-jobs 617): the modal the receipt head's
// class dots open, and /about/provenance's "Kinds of figure" section, read them
// from lib/shared/prov-class-words.ts. No other check reads the modal's JSX, so
// this one guards both the strings and the component that draws them.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CLASS_LINES,
  CLASS_NAMES,
  COMPUTED_LINE,
  DEFINITION_LINE,
  LADDER_INTRO,
  LADDER_TITLE,
  SPLIT_LINE,
} from "../../lib/shared/prov-class-words.ts";

const ALL = [
  LADDER_TITLE,
  LADDER_INTRO,
  SPLIT_LINE,
  COMPUTED_LINE,
  DEFINITION_LINE,
  ...CLASS_LINES.flatMap((c) => [c.line, c.modalNote ?? ""]),
].join("\n");

test("the modal's title", () => {
  assert.equal(LADDER_TITLE, "What the dots mean");
});

test("one line per class, in the grammar's order", () => {
  assert.deepEqual(
    CLASS_LINES.map((c) => c.cls),
    ["emitted", "state", "oracle", "indexed", "offchain"],
  );
  assert.deepEqual(Object.keys(CLASS_NAMES), ["emitted", "state", "oracle", "indexed", "offchain"]);
  for (const c of CLASS_LINES) assert.ok(c.line.length > 0, c.cls);
});

test("the definition-leaf sentence is present", () => {
  assert.equal(
    DEFINITION_LINE,
    "A constant the protocol defines, such as a stablecoin’s $1 face, is not a read and has no dot.",
  );
});

test("no tool names, custody words or the old weakest-link wording", () => {
  for (const re of [/eth_/i, /backend/i, /\bus\b/i, /\bour\b/i, /weakest/i, /indexer/i, /materiali[sz]ed/i]) {
    assert.doesNotMatch(ALL, re, String(re));
  }
});

test("the modal draws these words and no prose of its own", () => {
  const src = readFileSync(new URL("../../components/shared/provenance.tsx", import.meta.url), "utf8");
  const body = src.match(/export function LadderModal[\s\S]*?\n}\n/)?.[0];
  assert.ok(body, "LadderModal not found");
  for (const name of [
    "LADDER_TITLE",
    "LADDER_INTRO",
    "CLASS_LINES",
    "SPLIT_LINE",
    "COMPUTED_LINE",
    "DEFINITION_LINE",
  ]) {
    assert.match(body, new RegExp(`\\b${name}\\b`), name);
  }
  // JSX text: anything between a tag's ">" and the next "<" or "{" that holds a letter.
  const text = [...body.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map((m) => m[1].trim()).filter(Boolean);
  assert.deepEqual(text, [], `literal prose in LadderModal: ${text.join(" | ")}`);
});
