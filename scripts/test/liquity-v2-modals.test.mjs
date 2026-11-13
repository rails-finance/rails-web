// Liquity V2's "?" modals name the open branch's Max LTV (rails-ops ui-jobs 589):
// the adjust modal reads 90.91% on WETH (MCR 110%) and 83.33% on wstETH and rETH
// (MCR 120%), and stays a sentence on a branch Rails does not know.
// Run: npm test
//
// The loader imports through `@/` and reads a `.yaml` file, so this file
// registers the resolver scripts/lib/strip-types.mjs gives the scripts.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const ROOT = new URL("../../", import.meta.url).href;
const hooks = `
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
const ROOT = ${JSON.stringify(ROOT)};
const EXT = [".ts", "/index.ts", ".mjs", ".js"];
export async function resolve(spec, ctx, next) {
  let s = spec;
  if (s.startsWith("@/")) s = new URL(s.slice(2), ROOT).href;
  if (s.startsWith(".") || s.startsWith("file:")) {
    const base = s.startsWith("file:") ? s : new URL(s, ctx.parentURL).href;
    if (!/\\.(ts|tsx|mjs|js|yaml|json)$/.test(base))
      for (const e of EXT) if (existsSync(new URL(base + e))) return next(base + e, ctx);
    return next(base, ctx);
  }
  return next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (url.startsWith("file:") && url.endsWith(".yaml")) {
    const { toModule } = createRequire(ROOT)("./scripts/yaml-loader.cjs");
    return { format: "module", source: toModule(readFileSync(new URL(url), "utf8")), shortCircuit: true };
  }
  return next(url, ctx);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { L5 } = await import("../../lib/liquity/event-templates.ts");

const maxLtvSentence = (c) => c.extraParagraphs.find((p) => /Max LTV/.test(p));

test("the adjust modal states the open branch's Max LTV", () => {
  assert.match(maxLtvSentence(L5.adjust({ collateralType: "WETH" })), /Max LTV \(90\.91% for WETH\)/);
  for (const t of ["wstETH", "rETH"])
    assert.match(maxLtvSentence(L5.adjust({ collateralType: t })), new RegExp(`Max LTV \\(83\\.33% for ${t}\\)`));
});

test("the adjust modal stays a sentence without a known branch", () => {
  const s = maxLtvSentence(L5.adjust({}));
  assert.doesNotMatch(s, /[{}]|\d+\.\d+%/);
  assert.match(s, /Max LTV \(set per branch for this collateral\)/);
});

test("the liquidation modal reads the same figure", () => {
  assert.match(L5.liquidation({ collateralType: "rETH" }).intro, /Max LTV of 83\.33% for rETH/);
});
