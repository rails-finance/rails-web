// The shown-values arithmetic rounds an exact half as its decimal reads
// (rails-ops ui-jobs 743): 1.005 is 1.00499999999999989… in binary, and a
// receipt that prints $1.005 must come to $1.01. Swept over every x.xx5 below
// 1,000, signed, against a decimal-string reference.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { centsOf, shownAmount, shownPrice, shownUsd } = await import(
  pathToFileURL(REPO + "/lib/shared/shown-usd.ts").href
);

/** "1.005" → 1.01, "-0.145" → -0.15: half away from zero, on the digits. */
function decimalCents(str) {
  const neg = str.startsWith("-");
  const [int, frac] = str.replace("-", "").split(".");
  let c = BigInt(int) * 100n + BigInt(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) c += 1n;
  const v = Number(c) / 100;
  return neg ? -v : v;
}

test("every x.xx5 below 1,000 rounds half away from zero, as the decimal reads", () => {
  let wrong = 0;
  for (let i = 0; i < 1000; i++)
    for (let j = 0; j < 100; j++) {
      const str = `${i}.${String(j).padStart(2, "0")}5`;
      for (const s of [str, `-${str}`]) if (centsOf(Number(s)) !== decimalCents(s)) wrong++;
    }
  assert.equal(wrong, 0);
  assert.equal(centsOf(1.005), 1.01);
  assert.equal(centsOf(0.145), 0.15);
  assert.equal(centsOf(-0.285), -0.29);
  assert.equal(centsOf(0.565), 0.57);
});

test("amounts and prices keep their sixth decimal, and a large amount every digit", () => {
  assert.equal(shownAmount(1.0000005), 1.000001);
  assert.equal(shownAmount(123_456_789.123456), 123_456_789.123456);
  assert.equal(shownPrice(98_765.4321785), 98_765.432179);
  // A product landing on an exact half-cent rounds up.
  assert.equal(shownUsd(1, 1.005), 1.01);
});
