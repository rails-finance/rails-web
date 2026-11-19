import test from "node:test";
import assert from "node:assert/strict";
import { perShareText } from "../../lib/liquity-v2/sbold-per-share.ts";

test("a tiny ratio reads as non-zero, to four significant digits rounded", () => {
  assert.equal(
    perShareText("4536142689132635456", "43719935839791186313206357993620281274", 18, 18),
    "0.0000000000000000001038",
  );
});

test("a ratio near one, and above a thousand (whole digits kept)", () => {
  assert.equal(perShareText("1050000000000000000", "1000000000000000000", 18, 18), "1.05");
  assert.equal(perShareText("1234567000000000000000", "1000000000000000000", 18, 18), "1,235");
});

test("no figure over a zero supply", () => {
  assert.equal(perShareText("5", "0", 18, 18), null);
});

test("a share count past twelve digits reads as a mantissa and a power of ten", async () => {
  const { engineeringParts } = await import("../../lib/liquity-v2/sbold-per-share.ts");
  assert.deepEqual(engineeringParts("43719935839791186313206357993620281274", 18), { mantissa: "43.72", exponent: 18 });
  assert.deepEqual(engineeringParts("3130000000000000000000000000000", 18), { mantissa: "3.130", exponent: 12 });
  assert.equal(engineeringParts("3130000000000000000000000", 18), null);
});

test("the four significant digits round half-up on the fifth", async () => {
  const { perShareText } = await import("../../lib/liquity-v2/sbold-per-share.ts");
  // 1.23456 rounds to 1.235; 1.23449 to 1.234.
  assert.equal(perShareText("123456", "100000", 18, 18), "1.235");
  assert.equal(perShareText("123449", "100000", 18, 18), "1.234");
  // 0.000099995 rounds up across the carry to 0.0001.
  assert.equal(perShareText("99995", "1000000000", 18, 18), "0.0001");
  // 9.9995 carries into a new whole digit.
  assert.equal(perShareText("99995", "10000", 18, 18), "10");
});

test("a mantissa that rounds out of its range moves up a power", async () => {
  const { engineeringParts } = await import("../../lib/liquity-v2/sbold-per-share.ts");
  const at18 = (whole) => `${whole}${"0".repeat(18)}`;
  // 9.9996 × 10^18 is 10.00 × 10^18: inside the 1-to-999 mantissa of a power of three.
  assert.deepEqual(engineeringParts(at18("9999600000000000000"), 18), { mantissa: "10.00", exponent: 18 });
  // 999.96 × 10^18 is 1.000 × 10^21.
  assert.deepEqual(engineeringParts(at18("999960000000000000000"), 18), { mantissa: "1.000", exponent: 21 });
  // 43.7199 × 10^18 is 43.72 × 10^18.
  assert.deepEqual(engineeringParts(at18("43719900000000000000"), 18), { mantissa: "43.72", exponent: 18 });
});

test("below 0.0001 the ratio reads as a mantissa and a negative power of ten (ui-jobs 765)", async () => {
  const { perShareScientific, scientificText } = await import("../../lib/liquity-v2/sbold-per-share.ts");
  const p = perShareScientific("4536142689132635456", "43719935839791186313206357993620281274", 18, 18);
  assert.deepEqual(p, { mantissa: "1.038", exponent: -19 });
  assert.equal(scientificText(p.mantissa, p.exponent), "1.038 × 10⁻¹⁹");
  // Trailing zeros come back to four digits: 0.00001 is 1.000 × 10⁻⁵.
  assert.deepEqual(perShareScientific("1", "100000", 18, 18), { mantissa: "1.000", exponent: -5 });
  // Half-up on the fifth digit: 0.000012345 is 1.235 × 10⁻⁵.
  assert.deepEqual(perShareScientific("12345", "1000000000", 18, 18), { mantissa: "1.235", exponent: -5 });
  // At or above 0.0001 the plain decimal stands, a carry into 0.0001 included.
  assert.equal(perShareScientific("99995", "1000000000", 18, 18), null);
  assert.equal(perShareScientific("1050000000000000000", "1000000000000000000", 18, 18), null);
  assert.equal(perShareScientific("5", "0", 18, 18), null);
});

test("a positive power reads in the same superscript style", async () => {
  const { scientificText } = await import("../../lib/liquity-v2/sbold-per-share.ts");
  assert.equal(scientificText("43.72", 18), "43.72 × 10¹⁸");
});

test("a holder's pro-rata BOLD: balance × total assets ÷ total supply (ui-jobs 765)", async () => {
  const { proRata } = await import("../../lib/liquity-v2/sbold-per-share.ts");
  // Half the supply of a vault of 3 BOLD is 1.5 BOLD.
  assert.deepEqual(proRata("50", "3000000000000000000", "100", 18, 18), { text: "1.5", sci: null });
  // One share unit of the 749 block's supply: far below a wei, stated in scientific form.
  const p = proRata("1", "4536142689132635456", "43719935839791186313206357993620281274", 18, 18);
  assert.deepEqual(p.sci, { mantissa: "1.038", exponent: -37 });
  assert.equal(proRata("1", "5", "0", 18, 18), null);
  assert.deepEqual(proRata("0", "5", "7", 18, 18), { text: "0", sci: null });
});
