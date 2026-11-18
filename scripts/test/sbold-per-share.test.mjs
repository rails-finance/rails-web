import test from "node:test";
import assert from "node:assert/strict";
import { perShareText } from "../../lib/liquity-v2/sbold-per-share.ts";

test("a tiny ratio reads as non-zero, to four significant digits", () => {
  assert.equal(
    perShareText("4536142689132635456", "43719935839791186313206357993620281274", 18, 18),
    "0.0000000000000000001037",
  );
});

test("a ratio near one, and above a thousand (whole digits kept)", () => {
  assert.equal(perShareText("1050000000000000000", "1000000000000000000", 18, 18), "1.05");
  assert.equal(perShareText("1234567000000000000000", "1000000000000000000", 18, 18), "1,234");
});

test("no figure over a zero supply", () => {
  assert.equal(perShareText("5", "0", 18, 18), null);
});
