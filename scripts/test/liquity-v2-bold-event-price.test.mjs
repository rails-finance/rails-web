// lib/liquity-v2/bold-event-price.ts (rails-ops ui-jobs 757): the line a Liquity
// V2 event's receipt and a redemption row state for BOLD's market price at the
// event, from the timeline row's boldPrice.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  // lib/shared/usd-display.ts reaches lib/aave-v4/asset-class.ts through "@/", a pure module.
  if (specifier.startsWith("@/")) {
    const url = new URL(specifier.slice(2) + ".ts", "${new URL("../../", import.meta.url).href}").href;
    if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
  }
  if (specifier.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL) {
    const url = new URL(specifier + ".ts", context.parentURL).href;
    if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { boldEventLine, boldEventProv } = await import("../../lib/liquity-v2/bold-event-price.ts");
const { faceUsdProv } = await import("../../lib/shared/flows-timeline-provenance.ts");

// last_price(0) = 1e36 / 0.998842e18 puts BOLD at $0.998842.
const BP = {
  usd: 0.998842,
  emaUsd: 0.99881,
  block: 26441929,
  source: "curve-usdc-bold",
  pool: "0xefc6516323fbd28e80b85a497b65a86243a54b3e",
  tokenIndex: 0,
  quoteSymbol: "USDC",
  lastPriceRaw: "1001159343279197631",
  emaRaw: "1001191418225163262",
};

test("the line names the price, the pool, the call and the block", () => {
  const l = boldEventLine(BP, 26441929);
  assert.equal(
    l.text,
    "BOLD at $0.998842 on the Curve BOLD/USDC pool (0xefc6…4b3e), last_price(0) at block 26,441,929",
  );
  assert.equal(`${l.lead} ${l.price} ${l.rest}`, l.text);
});

test("a read older than the event names both blocks", () => {
  const l = boldEventLine(BP, 26442100);
  assert.equal(
    l.text,
    "BOLD at $0.998842 on the Curve BOLD/USDC pool (0xefc6…4b3e), last_price(0) at block 26,441,929; this event is at block 26,442,100",
  );
});

test("a row with no boldPrice states no line", () => {
  assert.equal(boldEventLine(undefined, 26441929), null);
  assert.equal(boldEventLine(null), null);
  assert.equal(boldEventLine({ ...BP, usd: 0 }, 26441929), null);
  assert.equal(boldEventProv({ ...BP, usd: Number.NaN }), undefined);
  const face = faceUsdProv("BOLD", "1,000.00", "after", null);
  assert.ok(!face.summary.includes("BOLD at"));
});

test("the debt's $1-face receipt carries the line and keeps its formula", () => {
  const line = boldEventLine(BP, 26441929).text;
  const face = faceUsdProv("BOLD", "1,000.00", "after", line);
  assert.ok(face.summary.endsWith(`${line}.`));
  assert.equal(face.formula, "debt × $1");
});

test("the line's receipt names the pool, the raw and the block, and no depeg", () => {
  const p = boldEventProv(BP, 26441929);
  assert.equal(p.contract.address, BP.pool);
  assert.equal(p.source.block, BP.block);
  assert.equal(p.inputs[0].value, BP.lastPriceRaw);
  assert.ok(!/depeg/i.test(p.summary));
});
